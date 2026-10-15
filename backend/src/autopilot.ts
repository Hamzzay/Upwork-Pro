/**
 * Auto mode (R75, asked for by Ahmad): a job screened and its proposal written with no questions in between. The worker calls these
 * as each step ends. A PASS or a FLAG goes on (a FLAG is recorded as continued by auto mode, with its flags named, like any
 * override); a FAIL stops for a person to decide. Then the recommended projects are confirmed, a profile is chosen (the one whose
 * services fit the job's tags best, else the one this person used last, else the only one), a Loom video only when the post asks
 * for one, and the proposal is written with the type the signals suggest. Every choice can be changed on the proposal page after.
 */
import { audit, exec, pool, query } from './db';
import { getSettings } from './settings';
import { loomChoices } from './proposal/pipeline';

const stop = (id: number, note: string) => exec(`UPDATE screenings SET auto_state='stopped', auto_note=? WHERE id=? AND auto_mode=1`, [note.slice(0, 300), id]);

/** After the screening: go on to the matching, or stop on a FAIL. */
export async function autoAfterScreening(id: number) {
  const s = (await query<any>('SELECT id, user_id, auto_mode, verdict, rule_codes, title, continued_at FROM screenings WHERE id=?', [id]))[0];
  if (!s || !Number(s.auto_mode) || s.continued_at) return;
  const decide = 'Decide on the Screening tab: continue it with a reason, and auto mode goes on, or skip it.';
  if (s.verdict === 'FAIL') return void (await stop(id, `The job failed the gate${s.rule_codes ? ' (' + s.rule_codes + ')' : ''}. ${decide}`));
  // R84 (Ahmad): auto mode goes on by itself only where a person would not stop to think. Not a job page at all: stop.
  if (!s.title || /^not (shown|known)$/i.test(String(s.title).trim())) return void (await stop(id, `This does not look like an Upwork job page: the screening found no job title. ${decide}`));
  if (s.verdict === 'FLAG') {
    const cfg = await getSettings();
    const codes = String(s.rule_codes || '').split(/\s*,\s*/).filter(Boolean);
    const stopping = codes.filter((c) => cfg['auto.stop_rules'].includes(c));
    if (stopping.length) return void (await stop(id, `The screening flagged ${stopping.join(', ')}, which always stop${stopping.length === 1 ? 's' : ''} auto mode. ${decide}`));
    if (codes.length > cfg['matching.auto_max_flags']) return void (await stop(id, `The screening raised ${codes.length} flags (${codes.join(', ')}), more than auto mode goes past by itself (${cfg['matching.auto_max_flags']}). ${decide}`));
  }
  if (s.verdict === 'FLAG') {
    await exec('INSERT IGNORE INTO overrides (screening_id, user_id, verdict_at_time, reason, reason_picks) VALUES (?,?,?,?,NULL)',
      [id, s.user_id, 'FLAG', `Auto mode: continued without asking${s.rule_codes ? ' (flags: ' + s.rule_codes + ')' : ''}.`]);
  }
  await exec(`UPDATE screenings SET proceeded='yes', continued_at=COALESCE(continued_at, NOW()), tagging_status=COALESCE(tagging_status, 'queued'), auto_state='running', auto_note=NULL WHERE id=?`, [id]);
  await audit(s.user_id, 'auto_continue', `screening=${id} verdict=${s.verdict}`);
}

/** The profile auto mode sends from: the services that fit the job's tags best, else the one this person used last, else the only one. */
export async function pickProfile(screeningId: number, userId: number): Promise<number | null> {
  const profiles = await query<any>('SELECT id, name, services FROM upwork_profiles WHERE active=1 ORDER BY id');
  if (!profiles.length) return null;
  if (profiles.length === 1) return profiles[0].id;
  const tags = (await query<any>('SELECT tag_name, weight FROM job_tags WHERE screening_id=?', [screeningId])).map((t) => ({ name: String(t.tag_name || '').toLowerCase(), w: Number(t.weight) || 1 })).filter((t) => t.name.length > 2);
  const score = (p: any) => { const sv = String(p.services || '').toLowerCase(); return tags.reduce((n, t) => n + (sv.includes(t.name) ? t.w : 0), 0); };
  const ranked = profiles.map((p) => ({ id: p.id, score: score(p) })).sort((a, b) => b.score - a.score);
  if (ranked[0].score > 0 && ranked[0].score > (ranked[1]?.score ?? 0)) return ranked[0].id;
  const last = (await query<any>(`SELECT s.proposal_profile_id AS id FROM screenings s JOIN upwork_profiles pr ON pr.id=s.proposal_profile_id AND pr.active=1
    WHERE s.user_id=? AND s.proposal_profile_confirmed_at IS NOT NULL ORDER BY s.proposal_profile_confirmed_at DESC LIMIT 1`, [userId]))[0];
  if (last) return last.id;
  return ranked[0].score > 0 ? ranked[0].id : profiles[0].id;
}

/** After the matching: confirm the recommended projects, choose the profile and the video, and start the proposal. True when it took over. */
export async function autoAfterMatching(id: number): Promise<boolean> {
  const s = (await query<any>('SELECT id, user_id, auto_mode, auto_state, selection_confirmed_at FROM screenings WHERE id=?', [id]))[0];
  if (!s || !Number(s.auto_mode) || s.auto_state === 'stopped' || s.selection_confirmed_at) return false;
  if ((await query<any>('SELECT 1 FROM proposals WHERE screening_id=? LIMIT 1', [id])).length) return false;
  const cfg = await getSettings();
  const shown = await query<any>('SELECT project_id, recommended FROM job_matches WHERE screening_id=? AND project_id IS NOT NULL ORDER BY rank_no', [id]);
  let pick = shown.filter((m) => m.recommended).map((m) => m.project_id as number).slice(0, cfg['selection.max']);
  if (pick.length < cfg['selection.min']) pick = shown.map((m) => m.project_id as number).slice(0, Math.max(cfg['selection.min'], pick.length));
  if (pick.length < cfg['selection.min']) { await stop(id, 'No project in the library fits this job. Pick projects on the Projects tab, and go on from there.'); return true; }
  const profileId = await pickProfile(id, s.user_id);
  if (!profileId) { await stop(id, 'There is no active Upwork profile to send from. An admin adds one under Upwork profiles.'); return true; }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE job_matches SET selected = (project_id IN (?)) WHERE screening_id=?', [pick, id]);
    await conn.query(`UPDATE screenings SET selection_confirmed_at=NOW(), selection_confirmed_by=?, proposal_profile_id=?, upwork_profile_id=?, proposal_profile_confirmed_at=NOW(),
      proposal_profile_confirmed_by=?, auto_state='running' WHERE id=?`, [s.user_id, profileId, profileId, s.user_id, id]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  // a Loom video only when the post asks for one: the one that fits best
  const lm = await loomChoices(id);
  const vid = lm.asked && lm.videos.length ? lm.videos.find((v) => v.best) ?? lm.videos[0] : null;
  await exec('UPDATE screenings SET loom_video_id=?, loom_video_title=? WHERE id=?', [vid ? vid.id : null, vid ? vid.title : null, id]);
  // the type the signals suggest ('auto'): the writer reads the signals if they are not ready yet
  await exec(`INSERT INTO proposals (screening_id, status, template_choice, template_id, created_by) VALUES (?, 'queued', 'auto', NULL, ?)`, [id, s.user_id]);
  await audit(s.user_id, 'auto_write', `screening=${id} projects=${pick.join(',')} profile=${profileId}${vid ? ' video=' + vid.id : ''}`);
  return true;
}

/** The proposal is written: auto mode is done (or stopped, when it could not be written). */
export async function autoAfterProposal(screeningId: number, ok: boolean, error?: string) {
  await exec(`UPDATE screenings SET auto_state=?, auto_note=? WHERE id=? AND auto_mode=1 AND auto_state='running'`,
    [ok ? 'done' : 'stopped', ok ? null : `The proposal could not be written${error ? ': ' + error : ''}. Try again on the Proposal tab.`.slice(0, 300), screeningId]);
}
