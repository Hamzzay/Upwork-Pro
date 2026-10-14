import { Router } from 'express';
import { z } from 'zod';
import { audit, exec, pool, query } from './db';
import { requireRole } from './auth';
import { typeFacts } from './proposal/guide';
import { htmlToPlain, textToHtml } from './html';
import { qaList, splitText, storeAnswers } from './proposal/answers';
import { latestVersion } from './proposal/pipeline';
import { jobIdFromUrl } from './screening/jobsource';
import { splitMobile } from './library/mobile';
import { diff, snapshot } from './changes';
import { getSettings } from './settings';
import { loomVideos, PROFILE_FIELDS, profileBody } from './routes_library';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from './config';
import { zip } from './zip';

/**
 * The Claude plugin saves its own work here: the job it screened, the proposal it wrote, and (through the shared status
 * endpoint in routes.ts) what happened on Upwork. The plugin is the source of truth for these: the app stores what it sends
 * as is, never re-screens or rewrites it, and marks the job source = 'claude_plugin'. Reached with the person's own token.
 */
export const plugin = Router();
const anyone = requireRole();
const canSeeAll = (role: string) => role === 'admin' || role === 'manager';
const SOURCE = 'claude_plugin';

const rule = z.object({ code: z.string().trim().regex(/^[A-Z]\d{1,3}$/, 'Rule codes look like F2 or G14'), rule: z.string().trim().max(300).optional(), value: z.string().trim().max(1000).optional() });
const pair = z.object({ label: z.string().trim().max(120), value: z.string().trim().max(2000) });
const posting = z.object({
  title: z.string().max(300).default(''), posted: z.string().max(120).default(''), location: z.string().max(200).default(''), description: z.string().max(60_000).default(''),
  skills: z.array(z.string().max(120)).max(60).default([]), terms: z.array(pair).max(40).default([]), screening_questions: z.array(z.string().max(2000)).max(30).default([]),
  activity: z.array(pair).max(30).default([]), client: z.array(pair).max(40).default([]),
  client_history: z.array(z.object({ title: z.string().max(300).default(''), dates: z.string().max(120).default(''), amount: z.string().max(120).default(''), rating: z.string().max(60).default(''), feedback: z.string().max(4000).default('') })).max(40).default([]),
  other_open_jobs: z.array(z.string().max(300)).max(30).default([]),
}).partial();
const jobBody = z.object({
  job_text: z.string().trim().min(50, 'Send the full job page text (at least 50 characters)').max(100_000),
  job_url: z.string().trim().max(500).regex(/^https?:\/\/(?:[a-z0-9-]+\.)?upwork\.com\/\S+$/i, 'The job link must be an Upwork link').optional(),
  title: z.string().trim().min(1).max(300),
  verdict: z.enum(['PASS', 'FLAG', 'FAIL']),
  fails: z.array(rule).max(30).default([]), flags: z.array(rule).max(40).default([]),
  job: z.array(pair).max(40).default([]), client: z.array(pair).max(40).default([]), competition: z.array(pair).max(30).default([]),
  fit: z.string().trim().max(4000).optional(), proposal_notes: z.array(z.string().trim().max(2000)).max(30).default([]),
  client_country: z.string().trim().max(200).optional(), budget: z.string().trim().max(300).optional(), hire_rate: z.string().trim().max(100).optional(), job_type: z.string().trim().max(60).optional(),
  posting: posting.optional(),
  decision: z.object({ continue: z.boolean(), reason: z.string().trim().max(2000).optional() }).optional(),
  force_new: z.boolean().optional(),
});

/** Save a job the plugin screened. One job per Upwork job id: a second save of the same job is refused unless force_new. */
plugin.post('/plugin/jobs', anyone, async (req, res) => {
  const b = jobBody.safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message, field: b.error.issues[0].path.join('.') });
  const d = b.data, user = req.user!;
  const jobId = d.job_url ? jobIdFromUrl(d.job_url) : null;
  if (jobId && !d.force_new) {
    const dup = (await query<any>('SELECT s.id, s.title, s.created_at, u.name AS user_name FROM screenings s JOIN users u ON u.id=s.user_id WHERE s.upwork_job_id=? AND s.discarded_at IS NULL ORDER BY s.id DESC LIMIT 1', [jobId]))[0];
    if (dup) return void res.status(409).json({ error: `This Upwork job is already saved as job #${dup.id} (by ${dup.user_name}). Update that one, or send force_new to save it again.`, existing_id: dup.id });
  }
  const cfg = await getSettings();
  const cont = d.decision?.continue;
  if (cont && d.verdict !== 'PASS' && (d.decision!.reason ?? '').length < cfg['override.min_reason']) {
    return void res.status(400).json({ error: `Continuing past a ${d.verdict} needs a reason of at least ${cfg['override.min_reason']} characters`, field: 'decision.reason' });
  }
  // fill in each rule's wording from the app's own list when the plugin sent only the code
  const words = new Map((await query<any>('SELECT code, rule FROM rules')).map((r) => [r.code, r.rule]));
  const named = (xs: z.infer<typeof rule>[]) => xs.map((x) => ({ code: x.code, rule: x.rule || words.get(x.code) || x.code, value: x.value ?? '' }));
  const fails = named(d.fails), flags = named(d.flags);
  const codes = [...fails, ...flags].map((x) => x.code);
  const report = { job: { verdict: d.verdict, title: d.title, job: d.job, client: d.client, competition: d.competition, fit: d.fit ?? '', fails, flags, override_note: '', proposal_notes: d.proposal_notes,
    columns: { client_country: d.client_country ?? 'not shown', budget: d.budget ?? 'not shown', hire_rate: d.hire_rate ?? 'not shown', job_type: d.job_type ?? 'not shown' } } };
  const post = d.posting ? { title: d.title, posted: '', location: '', description: '', skills: [], terms: [], screening_questions: [], activity: [], client: [], client_history: [], other_open_jobs: [], ...d.posting } : null;
  const conn = await pool.getConnection();
  let id = 0;
  try {
    await conn.beginTransaction();
    const [r]: any = await conn.query(
      `INSERT INTO screenings (user_id, input_type, source, source_url, upwork_job_id, raw_input, job_text, status, title, verdict, report_json, rule_codes, fail_reasons, flag_reasons,
         client_country, budget, hire_rate, job_type, model, provider, started_at, finished_at, posting_json, posting_status, proceeded, continued_at, skip_note)
       VALUES (?, 'text', ?, ?, ?, ?, ?, 'done', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'claude-plugin', 'plugin', NOW(), NOW(), ?, ?, ?, ?, ?)`,
      [user.id, SOURCE, d.job_url ?? null, jobId, d.job_text, d.job_text, d.title, d.verdict, JSON.stringify(report), codes.join(', ') || null,
        fails.map((x) => `${x.rule}${x.value ? ': ' + x.value : ''}`).join(' | ') || null, flags.map((x) => `${x.rule}${x.value ? ': ' + x.value : ''}`).join(' | ') || null,
        d.client_country ?? null, d.budget ?? null, d.hire_rate ?? null, d.job_type ?? null, post ? JSON.stringify(post) : null, post ? 'done' : null,
        cont === undefined ? null : cont ? 'yes' : 'no', cont ? new Date() : null, cont === false ? d.decision?.reason ?? null : null]);
    id = Number(r.insertId);
    if (cont && d.verdict !== 'PASS') await conn.query('INSERT INTO overrides (screening_id, user_id, verdict_at_time, reason) VALUES (?,?,?,?)', [id, user.id, d.verdict, d.decision!.reason]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  await audit(user.id, 'plugin_job_save', `screening=${id} verdict=${d.verdict}${codes.length ? ' codes=' + codes.join(',') : ''}${cont === undefined ? '' : cont ? ' continued' : ' skipped'}`);
  res.status(201).json({ id, url: `/#/s/${id}` });
});

/** Record the decision on a job saved earlier: continue (a FLAG or FAIL needs a reason) or skip. */
plugin.post('/plugin/jobs/:id/decision', anyone, async (req, res) => {
  const b = z.object({ continue: z.boolean(), reason: z.string().trim().max(2000).optional() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const s = await ownJob(req, res); if (!s) return;
  if (s.continued_at || s.proceeded) return void res.status(409).json({ error: 'The decision on this job is already recorded' });
  const min = (await getSettings())['override.min_reason'];
  if (b.data.continue && s.verdict !== 'PASS' && (b.data.reason ?? '').length < min) return void res.status(400).json({ error: `Continuing past a ${s.verdict} needs a reason of at least ${min} characters` });
  await decide(s, b.data.continue, b.data.reason, req.user!.id);
  res.json({ ok: true });
});

async function ownJob(req: any, res: any) {
  const s = (await query<any>('SELECT id, user_id, status, verdict, continued_at, proceeded FROM screenings WHERE id=? AND discarded_at IS NULL', [Number(req.params.id)]))[0];
  if (!s || (!canSeeAll(req.user.role) && s.user_id !== req.user.id)) { res.status(404).json({ error: 'Not found' }); return null; }
  if (s.status !== 'done') { res.status(409).json({ error: 'This job has not finished screening' }); return null; }
  return s;
}
async function decide(s: any, cont: boolean, reason: string | undefined, userId: number) {
  if (cont && s.verdict !== 'PASS') await exec('INSERT IGNORE INTO overrides (screening_id, user_id, verdict_at_time, reason) VALUES (?,?,?,?)', [s.id, userId, s.verdict, reason]);
  await exec(`UPDATE screenings SET proceeded=?, continued_at=${cont ? 'COALESCE(continued_at, NOW())' : 'continued_at'}, skip_note=? WHERE id=?`, [cont ? 'yes' : 'no', cont ? null : reason ?? null, s.id]);
  await audit(userId, cont ? 'plugin_continue' : 'plugin_skip', `screening=${s.id}`);
}

/** Save the proposal the plugin wrote, with the profile and projects it used. A second save adds a new version. */
plugin.post('/plugin/jobs/:id/proposal', anyone, async (req, res) => {
  const b = z.object({
    text: z.string().trim().min(30, 'Send the proposal text').max(30_000),
    profile: z.union([z.number().int().positive(), z.string().trim().min(1).max(190)]).optional(), // left out: the profile saved at the profile step
    projects: z.array(z.string().trim().min(1).max(190)).max(6).optional(), // left out: the projects saved at the projects step stay as they are
    template: z.string().trim().max(160).optional(),
    finished: z.boolean().default(true),
    continue_reason: z.string().trim().max(2000).optional(),
    loom_video: z.string().trim().max(200).nullable().optional(),
    screening_answers: qaList.optional(), // apart from the text; left out: the answers saved before stay
  }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message, field: b.error.issues[0].path.join('.') });
  const s = await ownJob(req, res); if (!s) return;
  const d = b.data, userId = req.user!.id;
  if (s.proceeded === 'no') return void res.status(409).json({ error: 'This job was skipped. Record a decision to continue first.' });
  if (!s.continued_at) { // writing a proposal means continuing; a FLAG or FAIL still needs its reason
    const min = (await getSettings())['override.min_reason'];
    if (s.verdict !== 'PASS' && (d.continue_reason ?? '').length < min) return void res.status(400).json({ error: `This job is a ${s.verdict}: send continue_reason (at least ${min} characters) to continue with it`, field: 'continue_reason' });
    await decide(s, true, d.continue_reason, userId);
  }
  const profs = await query<any>('SELECT id, name FROM upwork_profiles WHERE active=1');
  const saved = (await query<any>('SELECT proposal_profile_id, chosen_template_id, chosen_template_name FROM screenings WHERE id=?', [s.id]))[0];
  if (d.profile === undefined && !saved.proposal_profile_id) return void res.status(400).json({ error: 'Send the profile: none was saved for this job yet', field: 'profile' });
  const prof = d.profile === undefined ? (await query<any>('SELECT id, name FROM upwork_profiles WHERE id=?', [saved.proposal_profile_id]))[0]
    : typeof d.profile === 'number' ? profs.find((p) => p.id === d.profile) : profs.find((p) => p.name.toLowerCase() === String(d.profile).toLowerCase());
  if (!prof) return void res.status(400).json({ error: `No active Upwork profile called "${d.profile}". Active profiles: ${profs.map((p) => p.name).join(', ') || 'none'}. Add it with add_profile, then save again.`, field: 'profile' });
  // the proposal type: the one sent, else the one chosen at the type step
  const tplName = d.template ?? saved.chosen_template_name ?? null;
  const tplId = d.template ? (await findTemplate(d.template))?.id ?? null : saved.chosen_template_id ?? null;
  // the Loom video sent with it: one of the sending profile's videos, by its title; null records that none was sent
  let loom: { id: number; title: string } | null | undefined;
  if (d.loom_video === null) loom = null;
  else if (d.loom_video) {
    const vids = await query<any>('SELECT id, title FROM loom_videos WHERE profile_id=?', [prof.id]);
    loom = vids.find((v) => v.title.toLowerCase() === d.loom_video!.toLowerCase()) ?? undefined;
    if (!loom) return void res.status(400).json({ error: `${prof.name} has no Loom video called "${d.loom_video}". Its videos: ${vids.map((v) => v.title).join('; ') || 'none'}. Use a title from get_library (loom_videos), or leave loom_video out.`, field: 'loom_video' });
  }
  // the cover letter alone; answers sent inside the text (plugin before v0.9.0) are taken out and kept apart
  const sep = splitText(d.text);
  const prior = (await query<any>('SELECT id FROM proposals WHERE screening_id=?', [s.id]))[0];
  const answers = d.screening_answers ?? (sep.answers.length ? sep.answers : prior ? (await latestVersion(prior.id))?.answers ?? null : null);
  const lib = await query<any>('SELECT id, name FROM projects');
  const picked = (d.projects ?? []).map((n) => ({ name: n, p: lib.find((x) => x.name.toLowerCase() === n.toLowerCase()) ?? null }));
  const unknown = picked.filter((x) => !x.p).map((x) => x.name);

  const conn = await pool.getConnection();
  let version = 1, proposalId = 0;
  try {
    await conn.beginTransaction();
    // the projects it used: mark them chosen among any matches the app already has, add the rest
    const [have]: any = await conn.query('SELECT id, project_id, project_name, rank_no FROM job_matches WHERE screening_id=?', [s.id]);
    if (d.projects) await conn.query('UPDATE job_matches SET selected=0 WHERE screening_id=?', [s.id]);
    let rank = have.reduce((m: number, r: any) => Math.max(m, r.rank_no), 0);
    for (const x of picked) {
      const row = have.find((r: any) => (x.p && r.project_id === x.p.id) || r.project_name.toLowerCase() === x.name.toLowerCase());
      if (row) await conn.query('UPDATE job_matches SET selected=1 WHERE id=?', [row.id]);
      else await conn.query(`INSERT INTO job_matches (screening_id, project_id, project_name, rank_no, score, max_score, compliance_gap, recommended, shared_tags, selected) VALUES (?,?,?,?,0,0,0,0,'[]',1)`,
        [s.id, x.p ? x.p.id : null, x.p ? x.p.name : x.name, ++rank]);
    }
    // the plugin did its own matching: mark it done so the app shows the projects it chose
    await conn.query(`UPDATE screenings SET tagging_status='done', tagged_at=COALESCE(tagged_at, NOW()), selection_confirmed_at=COALESCE(selection_confirmed_at, NOW()), selection_confirmed_by=COALESCE(selection_confirmed_by, ?),
      proposal_profile_id=?, upwork_profile_id=?, proposal_profile_confirmed_at=NOW(), proposal_profile_confirmed_by=? WHERE id=?`, [userId, prof.id, prof.id, userId, s.id]);
    const [pr]: any = await conn.query('SELECT id FROM proposals WHERE screening_id=? FOR UPDATE', [s.id]);
    if (pr.length) {
      proposalId = pr[0].id;
      const [n]: any = await conn.query('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM proposal_versions WHERE proposal_id=? FOR UPDATE', [proposalId]);
      version = Number(n[0].n);
      await conn.query(`UPDATE proposals SET status='done', stage=NULL, profile_id=?, template_name=COALESCE(?, template_name), template_id=COALESCE(?, template_id), finished_at=COALESCE(finished_at, NOW()),
        finalized_at=${d.finished ? 'COALESCE(finalized_at, NOW())' : 'finalized_at'}, finalized_by=${d.finished ? 'COALESCE(finalized_by, ?)' : 'finalized_by'} WHERE id=?`,
        d.finished ? [prof.id, tplName, tplId, userId, proposalId] : [prof.id, tplName, tplId, proposalId]);
    } else {
      const [ins]: any = await conn.query(`INSERT INTO proposals (screening_id, status, template_choice, template_id, template_name, created_by, finished_at, profile_id, finalized_at, finalized_by, model, warnings)
        VALUES (?, 'done', 'manual', ?, ?, ?, NOW(), ?, ?, ?, 'claude-plugin', '[]')`, [s.id, tplId, tplName ?? 'Claude plugin', userId, prof.id, d.finished ? new Date() : null, d.finished ? userId : null]);
      proposalId = Number(ins.insertId);
    }
    await conn.query(`INSERT INTO proposal_versions (proposal_id, version_no, content_html, answers_json, source, note, created_by) VALUES (?,?,?,?,'plugin','From the Claude plugin',?)`, [proposalId, version, textToHtml(sep.letter), storeAnswers(answers), userId]);
    if (loom !== undefined) await conn.query('UPDATE screenings SET loom_video_id=?, loom_video_title=? WHERE id=?', [loom ? loom.id : null, loom ? loom.title : null, s.id]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  await audit(userId, 'plugin_proposal_save', `screening=${s.id} version=${version} profile=${prof.id}${d.finished ? ' finished' : ''}`);
  res.json({ ok: true, proposal_id: proposalId, version, profile: prof.name, stage: await stageAfter(s.id), loom_video: loom ? loom.title : loom === null ? 'none' : undefined, projects_not_in_library: unknown,
    add_missing: unknown.length ? 'Add each of these with add_project (name, links, overview, tags from the project sheet), then save again so they link to the library.' : undefined,
    next: d.finished ? 'Ready to send: once it is submitted on Upwork, set the status to Sent.' : 'Saved as a draft. Save again with finished=true when it is final.' });
});

// ---------- every step saved as it happens: read, profile, projects, type, Loom video ----------
// The plugin calls this as soon as the person answers each step, so Upwork Pro always shows where a plugin job stands and
// anyone can pick it up halfway. Each step fills the same fields the app's own steps fill, so the stage follows by itself.
// A step saved again replaces what that step saved before; a later step never erases an earlier one. Every save is kept in
// the job's History (field_changes) with the old and the new value, source "Claude plugin".
const STEP_SOURCE = 'Claude plugin';
const stageAfter = async (id: number): Promise<{ stage: string; label: string } | null> => (await import('./routes')).jobStage(id); // routes.ts loads this file, so it is fetched when first needed
/** A proposal type by its name, or by its number alone ("Type 7", "7"). */
async function findTemplate(name: string): Promise<{ id: number; name: string } | null> {
  const all = await query<any>('SELECT id, name FROM templates WHERE active=1');
  const want = name.trim().toLowerCase(), num = /^(?:type\s*)?(\d+)\b/i.exec(name.trim())?.[1];
  return all.find((t) => t.name.toLowerCase() === want) ?? (num ? all.find((t) => new RegExp(`^type\\s*${num}\\b`, 'i').test(t.name)) : null) ?? all.find((t) => t.name.toLowerCase().includes(want) && want.length > 4) ?? null;
}
const stepBody = z.discriminatedUnion('step', [
  z.object({ step: z.literal('read'), data: z.object({
    tags: z.array(z.object({ name: z.string().trim().min(1).max(120), reason: z.string().trim().max(600).optional(), core_rank: z.number().int().min(1).max(3).optional() })).max(60).default([]),
    industry: z.object({ name: z.string().trim().min(1).max(120), reason: z.string().trim().max(600).optional() }).nullable().optional(),
    signals: z.array(z.object({ signal: z.union([z.number().int().positive(), z.string().trim().min(1).max(160)]), value: z.string().trim().min(1).max(200), evidence: z.string().trim().max(700).optional() })).max(80).default([]) }) }),
  z.object({ step: z.literal('profile'), data: z.object({ profile: z.union([z.number().int().positive(), z.string().trim().min(1).max(190)]), rate: z.number().min(0).max(100000).nullable().optional() }) }),
  z.object({ step: z.literal('projects'), data: z.object({
    shortlist: z.array(z.object({ name: z.string().trim().min(1).max(190), reason: z.string().trim().max(300).optional(), recommended: z.boolean().optional() })).max(20).default([]),
    picked: z.array(z.string().trim().min(1).max(190)).max(6), skip_tech_stack: z.boolean().optional() }) }),
  z.object({ step: z.literal('type'), data: z.object({ type: z.string().trim().min(1).max(160), ranking: z.array(z.object({ type: z.string().trim().max(160), why: z.string().trim().max(400).optional() })).max(12).optional() }) }),
  z.object({ step: z.literal('loom'), data: z.object({ video: z.string().trim().min(1).max(200).nullable() }) }),
]);
plugin.post('/plugin/jobs/:id/step', anyone, async (req, res) => {
  const b = stepBody.safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message, field: b.error.issues[0].path.join('.') });
  const s = await ownJob(req, res); if (!s) return;
  if (s.proceeded === 'no') return void res.status(409).json({ error: 'This job was skipped. Record a decision to continue first.' });
  if (!s.continued_at) return void res.status(409).json({ error: 'Record the decision on this job first (record_decision), then save its steps.' });
  const userId = req.user!.id, id = s.id as number, step = b.data.step;
  const changes: [string, string | null, string | null][] = [];
  const note = (field: string, before: string | null, after: string | null) => { if ((before ?? null) !== (after ?? null)) changes.push([field, before, after]); };
  const extra: Record<string, unknown> = {};
  const lower = (x: string) => x.trim().toLowerCase();

  if (b.data.step === 'read') {
    const d = b.data.data;
    const dict = await query<any>('SELECT t.id, t.name, t.weight, c.name AS category FROM tags t JOIN tag_categories c ON c.id=t.category_id WHERE t.active=1');
    const find = (name: string, industry = false) => dict.find((t) => lower(t.name) === lower(name) && (!industry || /^industry$/i.test(t.category))) ?? (industry ? undefined : dict.find((t) => lower(t.name) === lower(name)));
    const rows: { tag: any; reason: string; core: number | null }[] = []; const unknownTags: string[] = [];
    for (const t of d.tags) { const tag = find(t.name); if (!tag) { unknownTags.push(t.name); continue; } if (!rows.some((r) => r.tag.id === tag.id)) rows.push({ tag, reason: t.reason ?? '', core: t.core_rank ?? null }); }
    if (d.industry) { const tag = find(d.industry.name, true); if (!tag) unknownTags.push(d.industry.name + ' (industry)'); else if (!rows.some((r) => r.tag.id === tag.id)) rows.push({ tag, reason: d.industry.reason ?? '', core: null }); }
    const sigs = await query<any>('SELECT id, number, name FROM signals WHERE active=1'), vals = await query<any>('SELECT id, signal_id, name, move, is_fallback FROM signal_values WHERE active=1');
    const sigRows: any[] = []; const unknownSignals: string[] = [];
    for (const x of d.signals) {
      const sig = typeof x.signal === 'number' ? sigs.find((g) => g.number === x.signal) : sigs.find((g) => lower(g.name) === lower(String(x.signal))) ?? sigs.find((g) => String(g.number) === String(x.signal).replace(/\D/g, ''));
      const val = sig ? vals.find((v) => v.signal_id === sig.id && lower(v.name) === lower(x.value)) : null;
      if (!sig || !val) { unknownSignals.push(`${x.signal}: ${x.value}`); continue; }
      sigRows.push({ sig, val, evidence: x.evidence ?? null });
    }
    const beforeTags = (await query<any>('SELECT tag_name FROM job_tags WHERE screening_id=? ORDER BY category_name, tag_name', [id])).map((x) => x.tag_name).join(', ') || null;
    const beforeSigs = (await query<any>('SELECT signal_name, value_name FROM job_signals WHERE screening_id=? AND is_fallback=0 ORDER BY signal_number', [id])).map((x) => `${x.signal_name}: ${x.value_name}`).join('; ') || null;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM job_tags WHERE screening_id=?', [id]);
      for (const x of rows) await conn.query('INSERT INTO job_tags (screening_id, tag_id, tag_name, category_name, weight, reason, core_rank) VALUES (?,?,?,?,?,?,?)', [id, x.tag.id, x.tag.name, x.tag.category, x.tag.weight, x.reason, x.core]);
      if (d.signals.length) {
        await conn.query('DELETE FROM job_signals WHERE screening_id=?', [id]);
        const seen = new Set<number>();
        for (const x of sigRows) {
          await conn.query(`INSERT INTO job_signals (screening_id, signal_id, signal_number, signal_name, value_id, value_name, is_fallback, is_primary, confidence, evidence, reason, move_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, x.sig.id, x.sig.number, x.sig.name, x.val.id, x.val.name, x.val.is_fallback ? 1 : 0, seen.has(x.sig.id) ? 0 : 1, 'medium', x.evidence, null, x.val.move ?? null]);
          seen.add(x.sig.id);
        }
      }
      await conn.query(`UPDATE screenings SET tagging_status='done', tagged_at=COALESCE(tagged_at, NOW()) WHERE id=?`, [id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    note('job tags', beforeTags, [...rows].sort((a, b) => a.tag.category.localeCompare(b.tag.category) || a.tag.name.localeCompare(b.tag.name)).map((x) => x.tag.name).join(', ') || null);
    if (d.signals.length) note('signals', beforeSigs, [...sigRows].sort((a, b) => a.sig.number - b.sig.number).filter((x) => !x.val.is_fallback).map((x) => `${x.sig.name}: ${x.val.name}`).join('; ') || null);
    Object.assign(extra, { tags_saved: rows.length, signals_saved: sigRows.length, tags_not_in_dictionary: unknownTags.length ? unknownTags : undefined, signals_not_found: unknownSignals.length ? unknownSignals : undefined,
      left_out: unknownTags.length || unknownSignals.length ? 'These were left out because Upwork Pro does not have them. Use the names from get_library (tags) and the signal names and values from get_writing_guide.' : undefined });
  }

  if (b.data.step === 'profile') {
    const d = b.data.data;
    const profs = await query<any>('SELECT id, name, price FROM upwork_profiles WHERE active=1');
    const prof = typeof d.profile === 'number' ? profs.find((p) => p.id === d.profile) : profs.find((p) => lower(p.name) === lower(String(d.profile)));
    if (!prof) return void res.status(400).json({ error: `No active Upwork profile called "${d.profile}". Active profiles: ${profs.map((p) => p.name).join(', ') || 'none'}. Add it with add_profile, then save again.`, field: 'profile' });
    const was = (await query<any>('SELECT pr.name, s.proposal_rate FROM screenings s LEFT JOIN upwork_profiles pr ON pr.id=s.proposal_profile_id WHERE s.id=?', [id]))[0];
    await exec(`UPDATE screenings SET proposal_profile_id=?, upwork_profile_id=?, proposal_profile_confirmed_at=NOW(), proposal_profile_confirmed_by=?${d.rate !== undefined ? ', proposal_rate=?' : ''} WHERE id=?`,
      d.rate !== undefined ? [prof.id, prof.id, userId, d.rate, id] : [prof.id, prof.id, userId, id]);
    note('profile', was?.name ?? null, prof.name);
    if (d.rate !== undefined) note('rate', was?.proposal_rate == null ? null : String(Number(was.proposal_rate)), d.rate == null ? null : String(d.rate));
    // a video belongs to a profile: one chosen for another profile no longer applies
    const lv = (await query<any>('SELECT s.loom_video_title, v.profile_id FROM screenings s LEFT JOIN loom_videos v ON v.id=s.loom_video_id WHERE s.id=?', [id]))[0];
    if (lv?.loom_video_title && lv.profile_id !== prof.id) { await exec('UPDATE screenings SET loom_video_id=NULL, loom_video_title=NULL WHERE id=?', [id]); note('loom video', lv.loom_video_title, null); extra.loom_video_cleared = 'The Loom video chosen before belonged to the other profile. Save the video step again.'; }
    Object.assign(extra, { profile: prof.name, rate: d.rate ?? undefined });
  }

  if (b.data.step === 'projects') {
    const d = b.data.data, cfg = await getSettings();
    const lib = await query<any>('SELECT id, name FROM projects');
    const inLib = (n: string) => lib.find((x) => lower(x.name) === lower(n)) ?? null;
    const names = [...new Set([...d.shortlist.map((x) => x.name), ...d.picked].map((n) => n.trim()))];
    const unknown = names.filter((n) => !inLib(n));
    if (unknown.length) return void res.status(400).json({ error: `Not in the project library: ${unknown.join(', ')}. Add each with add_project first (name, links, overview, tags), then save this step again. Nothing was saved.`, projects_not_in_library: unknown, field: 'projects' });
    const picked = [...new Set(d.picked.map((n) => inLib(n)!.id))];
    if (picked.length < cfg['selection.min'] || picked.length > cfg['selection.max']) return void res.status(400).json({ error: `Pick ${cfg['selection.min'] === cfg['selection.max'] ? cfg['selection.max'] : cfg['selection.min'] + ' to ' + cfg['selection.max']} project${cfg['selection.max'] === 1 ? '' : 's'} (the setting in Upwork Pro). ${picked.length} were sent.`, field: 'picked' });
    const beforeSkip = !!(await query<any>('SELECT skip_tech_stack FROM screenings WHERE id=?', [id]))[0]?.skip_tech_stack;
    const beforePicked = (await query<any>('SELECT project_name FROM job_matches WHERE screening_id=? AND selected=1 ORDER BY rank_no', [id])).map((x) => x.project_name).join(', ') || null;
    const beforeList = (await query<any>('SELECT project_name FROM job_matches WHERE screening_id=? ORDER BY rank_no', [id])).map((x) => x.project_name).join(', ') || null;
    // the shortlist in the order shown, then any picked project that was not on it
    const order = [...d.shortlist.map((x) => ({ p: inLib(x.name)!, reason: x.reason ?? null, rec: !!x.recommended })), ...d.picked.map((n) => inLib(n)!).filter((p) => !d.shortlist.some((x) => lower(x.name) === lower(p.name))).map((p) => ({ p, reason: null as string | null, rec: false }))]
      .filter((x, i, a) => a.findIndex((y) => y.p.id === x.p.id) === i);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [have]: any = await conn.query('SELECT id, project_id, rank_no FROM job_matches WHERE screening_id=? FOR UPDATE', [id]);
      // rows the app matched keep their scores; the plugin's own earlier rows that are no longer shown go
      const keep = new Set(order.map((x) => x.p.id));
      await conn.query('UPDATE job_matches SET selected=0 WHERE screening_id=?', [id]);
      for (const h of have) if (!keep.has(h.project_id)) await conn.query('DELETE FROM job_matches WHERE id=? AND max_score=0', [h.id]);
      const [left]: any = await conn.query('SELECT id, project_id, rank_no FROM job_matches WHERE screening_id=?', [id]);
      let rank = left.reduce((m: number, r: any) => Math.max(m, r.rank_no), 0);
      for (const x of order) {
        const row = left.find((r: any) => r.project_id === x.p.id), sel = picked.includes(x.p.id) ? 1 : 0;
        if (row) await conn.query('UPDATE job_matches SET selected=?, recommended=IF(?, 1, recommended), ai_reason=COALESCE(?, ai_reason) WHERE id=?', [sel, x.rec ? 1 : 0, x.reason, row.id]);
        else await conn.query(`INSERT INTO job_matches (screening_id, project_id, project_name, rank_no, score, max_score, compliance_gap, recommended, shared_tags, selected, ai_reason) VALUES (?,?,?,?,0,0,0,?,'[]',?,?)`,
          [id, x.p.id, x.p.name, ++rank, x.rec ? 1 : 0, sel, x.reason]);
      }
      await conn.query(`UPDATE screenings SET tagging_status='done', tagged_at=COALESCE(tagged_at, NOW()), selection_confirmed_at=NOW(), selection_confirmed_by=?,
        skip_tech_stack=COALESCE(?, skip_tech_stack), rematch_only=0 WHERE id=?`, [userId, d.skip_tech_stack == null ? null : d.skip_tech_stack ? 1 : 0, id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    note('projects shown', beforeList, (await query<any>('SELECT project_name FROM job_matches WHERE screening_id=? ORDER BY rank_no', [id])).map((x) => x.project_name).join(', ') || null);
    note('projects picked', beforePicked, (await query<any>('SELECT project_name FROM job_matches WHERE screening_id=? AND selected=1 ORDER BY rank_no', [id])).map((x) => x.project_name).join(', ') || null);
    if (d.skip_tech_stack != null) note('skip tech stack', beforeSkip ? 'yes' : 'no', d.skip_tech_stack ? 'yes' : 'no');
    Object.assign(extra, { picked: order.filter((x) => picked.includes(x.p.id)).map((x) => x.p.name), shown: order.length });
  }

  if (b.data.step === 'type') {
    const d = b.data.data;
    const t = await findTemplate(d.type);
    if (!t) return void res.status(400).json({ error: `No active proposal type called "${d.type}". The types: ${(await query<any>('SELECT name FROM templates WHERE active=1 ORDER BY name')).map((x) => x.name).join('; ')}.`, field: 'type' });
    const was = (await query<any>('SELECT s.chosen_template_name, p.id AS pid, p.template_name FROM screenings s LEFT JOIN proposals p ON p.screening_id=s.id WHERE s.id=?', [id]))[0];
    await exec('UPDATE screenings SET chosen_template_id=?, chosen_template_name=? WHERE id=?', [t.id, t.name, id]);
    if (was?.pid) await exec(`UPDATE proposals SET template_id=?, template_name=?, template_choice='manual' WHERE id=?`, [t.id, t.name, was.pid]); // drafts exist: later drafts are of this type
    note('proposal type', was?.template_name ?? was?.chosen_template_name ?? null, t.name);
    Object.assign(extra, { type: t.name });
  }

  if (b.data.step === 'loom') {
    const d = b.data.data;
    const cur = (await query<any>('SELECT s.proposal_profile_id, s.loom_video_title, pr.name FROM screenings s LEFT JOIN upwork_profiles pr ON pr.id=s.proposal_profile_id WHERE s.id=?', [id]))[0];
    if (d.video === null) { await exec('UPDATE screenings SET loom_video_id=NULL, loom_video_title=NULL WHERE id=?', [id]); note('loom video', cur?.loom_video_title ?? null, null); extra.loom_video = 'none'; }
    else {
      if (!cur?.proposal_profile_id) return void res.status(409).json({ error: 'Save the profile step first: a Loom video belongs to the sending profile.' });
      const vids = await query<any>('SELECT id, title FROM loom_videos WHERE profile_id=?', [cur.proposal_profile_id]);
      const v = vids.find((x) => lower(x.title) === lower(d.video!));
      if (!v) return void res.status(400).json({ error: `${cur.name} has no Loom video called "${d.video}". Its videos: ${vids.map((x) => x.title).join('; ') || 'none'}. Use a title from get_library (loom_videos), or send null for no video.`, field: 'video' });
      await exec('UPDATE screenings SET loom_video_id=?, loom_video_title=? WHERE id=?', [v.id, v.title, id]);
      note('loom video', cur.loom_video_title ?? null, v.title); extra.loom_video = v.title;
    }
  }

  for (const [field, before, after] of changes) await exec('INSERT INTO field_changes (screening_id, field, old_value, new_value, source, user_id) VALUES (?,?,?,?,?,?)', [id, field, before, after, STEP_SOURCE, userId]);
  await audit(userId, 'plugin_step_save', `screening=${id} step=${step}${changes.length ? '' : ' unchanged'}`);
  res.json({ ok: true, step, changed: changes.length > 0, ...extra, stage: await stageAfter(id) });
});

/**
 * The independent review of a job's newest draft, for the plugin: the same reviewer the app uses, so a proposal gets the same
 * score wherever it was written. Queues it and waits for the result (the worker writes it), up to about a minute and a half.
 */
plugin.post('/plugin/jobs/:id/review', anyone, async (req, res) => {
  const s = await ownJob(req, res); if (!s) return;
  const { queueReview, reviewOf } = await import('./routes_proposals');
  const q = await queueReview(s.id);
  if (q.error) return void res.status(q.status).json({ error: q.error });
  const read = async () => (await query<any>('SELECT review_status, review_json, review_version, review_error, reviewed_at FROM proposals WHERE screening_id=?', [s.id]))[0];
  for (let i = 0; i < 25; i++) { // under the connector's own one minute limit
    const p = await read();
    if (p.review_status === 'done') return void res.json({ review: reviewOf(p), how_to_use: 'Show the score, the verdict, the problems and the suggestions as they are. Do not ask which to apply and do not list options: the person says if they want any applied. Apply only the ones they name, save the new draft, and review it again. Never change the score or soften the review.' });
    if (p.review_status === 'error') return void res.status(502).json({ error: 'The review could not be made: ' + (p.review_error || 'the reviewer failed') + '. Try again.' });
    await new Promise((r) => setTimeout(r, 2000));
  }
  res.status(202).json({ pending: true, note: 'The review is still being written. Call review_proposal again in a moment, or read it with get_job (review).' });
});

/** The values the plugin may use: active profiles, project names, rule codes, statuses, outcomes and loss reasons. */
plugin.get('/plugin/options', anyone, async (_req, res) => {
  const cfg = await getSettings();
  res.json({
    profiles: (await query<any>(`SELECT id, name, ${PROFILE_FIELDS.join(', ')} FROM upwork_profiles WHERE active=1 ORDER BY name`))
      .map((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== ''))),
    projects: (await query<any>('SELECT name FROM projects WHERE active=1 ORDER BY name')).map((p) => p.name),
    rules: await query("SELECT code, type, rule, details FROM rules WHERE active=1 ORDER BY type='flag', CAST(SUBSTRING(code, 2) AS UNSIGNED)"),
    statuses: ['Sent', 'Viewed', 'Chat opened', 'Interview'], outcomes: cfg['tracking.outcomes'], loss_outcomes: cfg['tracking.loss_outcomes'], loss_reasons: cfg['tracking.loss_reasons'],
    min_continue_reason: cfg['override.min_reason'],
  });
});

// ---------- adding what the library is missing ----------
// When the plugin needs a profile or a project the app does not have yet, it adds it here straight away, with the same
// permissions as the app (profiles: admins; projects: managers and admins). Nothing is overwritten: an existing record only
// gets the fields that are still empty, so edits made in the app win.

/** Add an Upwork profile, or fill the empty fields of an existing one with the same name. */
plugin.post('/plugin/profiles', requireRole('admin'), async (req, res) => {
  const b = profileBody.omit({ active: true }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message, field: b.error.issues[0].path.join('.') });
  const d: any = b.data;
  const cur = (await query<any>('SELECT * FROM upwork_profiles WHERE name=?', [d.name]))[0];
  if (!cur) {
    const r = await exec(`INSERT INTO upwork_profiles (name, ${PROFILE_FIELDS.join(', ')}, added_via) VALUES (?)`, [[d.name, ...PROFILE_FIELDS.map((k) => d[k] ?? null), SOURCE]]);
    await audit(req.user!.id, 'profile_create', `${d.name} (id ${r.insertId}) from the Claude plugin`, diff(null, await snapshot('upwork_profiles', r.insertId)));
    return void res.status(201).json({ ok: true, id: r.insertId, created: true, name: d.name });
  }
  const fill = PROFILE_FIELDS.filter((k) => d[k] != null && (cur[k] == null || cur[k] === ''));
  const before = fill.length ? await snapshot('upwork_profiles', cur.id) : null;
  if (fill.length) await exec(`UPDATE upwork_profiles SET ${fill.map((k) => k + '=?').join(', ')} WHERE id=?`, [...fill.map((k) => d[k]), cur.id]);
  if (fill.length) await audit(req.user!.id, 'profile_update', `${cur.name} (id ${cur.id}) filled from the Claude plugin`, diff(before, await snapshot('upwork_profiles', cur.id)));
  res.json({ ok: true, id: cur.id, created: false, name: cur.name, filled: fill, active: !!cur.active,
    note: cur.active ? undefined : 'This profile is disabled in Upwork Pro. An admin can enable it under Upwork profiles.' });
});

const link = z.string().trim().max(500).regex(/^https?:\/\/\S+$/i, 'Links start with http:// or https://');
const projectBody = z.object({
  name: z.string().trim().min(1).max(190),
  landing_link: link.optional(), system_link: link.optional(), android_link: link.optional(), ios_link: link.optional(), mobile_link: z.string().trim().max(500).optional(), staging_link: link.optional(), case_study_link: link.optional(),
  overview: z.string().trim().max(8000).optional(), case_study_summary: z.string().trim().max(8000).optional(),
  tags: z.array(z.string().trim().min(1).max(120)).max(200).default([]).describe('Tag names from the tag dictionary, Industry tags included'),
});
const PROJECT_FIELDS = ['landing_link', 'system_link', 'android_link', 'ios_link', 'mobile_link', 'staging_link', 'case_study_link', 'overview', 'case_study_summary'] as const;

/** Add a project to the library, or fill the empty fields of an existing one and add the tags it is missing (never removes). */
plugin.post('/plugin/projects', requireRole('admin', 'manager'), async (req, res) => {
  const b = projectBody.safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message, field: b.error.issues[0].path.join('.') });
  const d: any = b.data;
  const known = new Map((await query<any>('SELECT t.id, t.name, c.name AS category FROM tags t JOIN tag_categories c ON c.id=t.category_id WHERE t.active=1'))
    .map((t) => [t.name.toLowerCase(), t]));
  const tags = d.tags.map((n: string) => known.get(n.toLowerCase())).filter(Boolean);
  const unknownTags = d.tags.filter((n: string) => !known.has(n.toLowerCase()));
  // an old style mobile link (both stores in one) is split into Android, iOS and anything else
  if (d.mobile_link) { const m = splitMobile(d.mobile_link); d.android_link ??= m.android ?? undefined; d.ios_link ??= m.ios ?? undefined; d.mobile_link = m.other ?? undefined; }
  // the proposal link: a public page first (landing, then a store link), then the live system
  const liveLink = d.landing_link || d.android_link || d.ios_link || d.system_link || null;
  const existing = (await query<any>('SELECT id FROM projects WHERE name=?', [d.name]))[0];
  const before = existing ? await snapshot('projects', existing.id) : null;
  const conn = await pool.getConnection();
  let id: number, created = false, filled: string[] = [], added = 0;
  try {
    await conn.beginTransaction();
    const [[cur]]: any = await conn.query('SELECT * FROM projects WHERE name=?', [d.name]);
    if (!cur) {
      const [r]: any = await conn.query(`INSERT INTO projects (name, live_link, ${PROJECT_FIELDS.join(', ')}, added_via) VALUES (?)`, [[d.name, liveLink, ...PROJECT_FIELDS.map((k) => d[k] ?? null), SOURCE]]);
      id = Number(r.insertId); created = true;
    } else {
      id = cur.id;
      filled = PROJECT_FIELDS.filter((k) => d[k] && !cur[k]);
      if (!cur.live_link && liveLink) filled.push('live_link');
      if (filled.length) await conn.query(`UPDATE projects SET ${filled.map((k) => k + '=?').join(', ')} WHERE id=?`, [...filled.map((k) => (k === 'live_link' ? liveLink : d[k])), id]);
    }
    if (tags.length) added = ((await conn.query('INSERT IGNORE INTO project_tags (project_id, tag_id) VALUES ?', [tags.map((t: any) => [id, t.id])])) as any)[0].affectedRows;
    // an Industry tag also places the project on the Industries page
    for (const t of tags.filter((x: any) => x.category === 'Industry')) {
      let [[ind]]: any = await conn.query('SELECT id FROM industries WHERE name=?', [t.name]);
      if (!ind) { const [r]: any = await conn.query('INSERT INTO industries (name) VALUES (?)', [t.name]); ind = { id: r.insertId }; }
      await conn.query('INSERT IGNORE INTO project_industries (project_id, industry_id) VALUES (?,?)', [id, ind.id]);
    }
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  await audit(req.user!.id, created ? 'project_create' : 'project_update', `${d.name} (id ${id}) from the Claude plugin`, diff(before, await snapshot('projects', id)));
  res.status(created ? 201 : 200).json({ ok: true, id, created, name: d.name, filled, tags_added: added, unknown_tags: unknownTags,
    note: unknownTags.length ? 'These tags are not in the tag dictionary, so they were left out. An admin can add them under Tag dictionary.' : undefined });
});

// ---------- what the plugin reads instead of keeping its own copy ----------
/** The project library and the tag dictionary, as the app has them: the plugin matches projects from this, not from a sheet.
 *  Case studies are long, so they come only for the projects named in `case_studies` (comma separated), or all with `case_studies=all`. */
plugin.get('/plugin/library', anyone, async (req, res) => {
  const wantCs = String(req.query.case_studies ?? '').trim(), allCs = wantCs.toLowerCase() === 'all';
  const csNames = new Set(wantCs.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
  const cats = await query<any>('SELECT id, name, is_compliance FROM tag_categories ORDER BY sort_order, name');
  const tags = await query<any>('SELECT id, category_id, name, weight, description FROM tags WHERE active=1 ORDER BY sort_order, name');
  const projects = await query<any>(`SELECT id, name, live_link, landing_link, system_link, android_link, ios_link, mobile_link, staging_link, case_study_link, overview, case_study_summary
    FROM projects WHERE active=1 ORDER BY name`);
  const links = await query<any>(`SELECT pt.project_id, t.name, c.name AS category FROM project_tags pt JOIN tags t ON t.id=pt.tag_id AND t.active=1 JOIN tag_categories c ON c.id=t.category_id`);
  const inds = await query<any>('SELECT pi.project_id, i.name FROM project_industries pi JOIN industries i ON i.id=pi.industry_id');
  const clean = (o: any) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
  const cfg = await getSettings();
  res.json({
    note: 'Match exactly as "matching" says (the same rule as the app). Tags with weight 0 carry no matching weight. Case studies are left out: ask for them by project name once the projects are chosen.',
    matching: {
      rule: 'Platform filter first. Then the work: name the job\'s core work, one to three specific tags, the main work first (for a scraping job Web scraping / data pipelines; never broad tags like Workflow automation, AI automation, AI powered, Ongoing maintenance). A project proves the job only if it shares a core work tag; only those are recommended, and those that did the main work come first. Then industry: the job has ONE industry, the client\'s own business (never the industries of data, leads or markets the job is about); same industry first, then related, then the rest. Then how many core work tags a project shares. Then the tag score: the weights of the shared tags, industry not counted. Last, read the overview and case study of the top 12 or so and put them in order by how well each proves this exact job (the same core work, input, output and users first), with one line on why; drop any that do not really prove it. Core work is only workflow, AI capability, automation or product type tags, never a project stage, tool, model or stack. When the person asks to skip tech stack tags (saved on the job as skip_tech_stack), leave every tag of the Tech stack category out of the score, the matched tags and the most a project can score; everything else stays the same.',
      min_score: cfg['matching.min_score'], shown: cfg['matching.shown'], recommended: cfg['matching.recommended'], more: 10,
    },
    tag_dictionary: cats.map((c) => ({ category: c.name, compliance: !!c.is_compliance,
      tags: tags.filter((t) => t.category_id === c.id).map((t) => clean({ name: t.name, weight: Number(t.weight), description: t.description })) })).filter((c) => c.tags.length),
    projects: projects.map((p) => clean({ name: p.name, proposal_link: p.live_link, landing_link: p.landing_link, system_link: p.system_link, android_link: p.android_link, ios_link: p.ios_link, other_mobile_link: p.mobile_link,
      staging_link: p.staging_link, case_study_link: p.case_study_link, overview: p.overview,
      case_study_summary: allCs || csNames.has(String(p.name).toLowerCase()) ? p.case_study_summary : null, has_case_study: !!p.case_study_summary || null,
      industries: inds.filter((x) => x.project_id === p.id).map((x) => x.name),
      tags: links.filter((x) => x.project_id === p.id && x.category !== 'Industry').map((x) => x.name) })),
    loom_videos_note: 'Short Loom videos per profile. Before writing, ask the person which of the sending profile\'s videos to send, or none: recommend the one whose tags share the most weight with the job (industry included) when the post asks for a video, and none otherwise. Put the chosen link in the proposal and send its title as loom_video on save_proposal.',
    loom_videos: (await loomVideos('v.active=1 AND p.active=1')).map((v) => clean({ profile: v.profile_name, title: v.title, url: v.url, topic: v.topic, tags: v.tags.map((t: any) => t.name) })),
  });
});

/** The writing guide: the proposal types (the templates the app's writer uses too, each with when it is chosen and its length), the
 *  writing rules, banned phrases, modules, screening answer rules and the checklist. `type` returns that type's full text; `all=1` every type's. */
plugin.get('/plugin/writing-guide', anyone, async (req, res) => {
  const docs = await query<any>("SELECT kind, content, updated_at FROM writing_docs WHERE active=1 AND kind<>'type' ORDER BY sort_order");
  const types = await query<any>('SELECT id, name, body_html, prompt, priority, updated_at, opening_rules, opening_no_us, opening_starts FROM templates WHERE active=1 ORDER BY priority, name');
  const one = (k: string) => docs.filter((d) => d.kind === k).map((d) => d.content).join('\n\n') || null;
  const want = String(req.query.type ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const all = req.query.all === '1';
  const key = (name: string) => name.toLowerCase().replace(/^type\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  res.json({
    types: types.map((t) => {
      const text = htmlToPlain(t.body_html) + (t.prompt ? '\n\nInstructions: ' + t.prompt : '')
        + (t.opening_rules ? `\n\nFIRST TWO LINES (strict; Upwork shows them in the preview)\n${t.opening_rules}${t.opening_starts ? '\nMust start with: ' + t.opening_starts.split('|').join(' or ') : ''}${t.opening_no_us ? '\nNo talk about us, no project names, no stats in the first two lines.' : ''}` : '');
      const match = all || (want && (t.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').includes(want) || key(t.name).replace(/-/g, ' ').includes(want)));
      return { key: key(t.name), title: t.name, ...typeFacts(text), first_two_lines: t.opening_rules || undefined, content: match ? text : undefined };
    }),
    type_selection: one('selection'), writing_rules: one('rules'), banned_phrases: one('banned'), modules: one('modules'), screening_answers: one('screening'), verification_checklist: one('checklist'),
    updated_at: [...docs, ...types].reduce((m: any, d: any) => (m && m > d.updated_at ? m : d.updated_at), null),
  });
});

/** Who this token belongs to. The MCP checks it before serving a request, and the plugin can say who is signed in. */
// ---------- the Claude plugin itself, as a file anyone signed in can download and add to their Claude ----------
// It is zipped from the `plugin` folder at the top of the repository each time, so a `git pull` is all an update needs.
const PLUGIN_DIR = join(appRoot, '..', 'plugin');
function pluginFiles(): { path: string; data: Buffer }[] {
  const out: { path: string; data: Buffer }[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(join(PLUGIN_DIR, rel)).sort()) {
      if (name === '.DS_Store' || name === 'node_modules' || name === '.git') continue;
      const p = rel ? rel + '/' + name : name, full = join(PLUGIN_DIR, p);
      if (statSync(full).isDirectory()) walk(p); else out.push({ path: p, data: readFileSync(full) });
    }
  };
  for (const top of ['.claude-plugin', 'README.md', 'skills']) { if (!existsSync(join(PLUGIN_DIR, top))) continue; if (statSync(join(PLUGIN_DIR, top)).isDirectory()) walk(top); else out.push({ path: top, data: readFileSync(join(PLUGIN_DIR, top)) }); }
  return out;
}
function pluginInfo() {
  const manifest = join(PLUGIN_DIR, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifest)) return null;
  const m = JSON.parse(readFileSync(manifest, 'utf8'));
  const skills = existsSync(join(PLUGIN_DIR, 'skills')) ? readdirSync(join(PLUGIN_DIR, 'skills')).filter((n) => existsSync(join(PLUGIN_DIR, 'skills', n, 'SKILL.md'))).sort() : [];
  return { name: String(m.name), version: String(m.version), description: String(m.description ?? ''), skills, file: `${m.name}-${m.version}.plugin` };
}
plugin.get('/plugin/info', anyone, (_req, res) => { const i = pluginInfo(); res.json({ available: !!i, ...(i ?? {}) }); });
plugin.get('/plugin/download', anyone, async (req, res) => {
  const i = pluginInfo();
  if (!i) return void res.status(404).json({ error: 'The plugin files are not on this server' });
  const data = zip(pluginFiles());
  await audit(req.user!.id, 'plugin_download', `version=${i.version}`);
  res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="${i.file}"`); res.setHeader('Cache-Control', 'no-store');
  res.send(data);
});

plugin.get('/plugin/whoami', anyone, async (req, res) => {
  res.json({ id: req.user!.id, name: req.user!.name, email: req.user!.email, role: req.user!.role });
});
