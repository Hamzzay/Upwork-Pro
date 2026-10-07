import { Router } from 'express';
import { z } from 'zod';
import { audit, exec, pool, query } from './db';
import { requireRole } from './auth';
import { textToHtml } from './html';
import { jobIdFromUrl } from './screening/jobsource';
import { getSettings } from './settings';

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
    const dup = (await query<any>('SELECT s.id, s.title, s.created_at, u.name AS user_name FROM screenings s JOIN users u ON u.id=s.user_id WHERE s.upwork_job_id=? ORDER BY s.id DESC LIMIT 1', [jobId]))[0];
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
         client_country, budget, hire_rate, job_type, model, provider, started_at, finished_at, posting_json, posting_status, proceeded, continued_at)
       VALUES (?, 'text', ?, ?, ?, ?, ?, 'done', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'claude-plugin', 'plugin', NOW(), NOW(), ?, ?, ?, ?)`,
      [user.id, SOURCE, d.job_url ?? null, jobId, d.job_text, d.job_text, d.title, d.verdict, JSON.stringify(report), codes.join(', ') || null,
        fails.map((x) => `${x.rule}${x.value ? ': ' + x.value : ''}`).join(' | ') || null, flags.map((x) => `${x.rule}${x.value ? ': ' + x.value : ''}`).join(' | ') || null,
        d.client_country ?? null, d.budget ?? null, d.hire_rate ?? null, d.job_type ?? null, post ? JSON.stringify(post) : null, post ? 'done' : null,
        cont === undefined ? null : cont ? 'yes' : 'no', cont ? new Date() : null]);
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
  const s = (await query<any>('SELECT id, user_id, status, verdict, continued_at, proceeded FROM screenings WHERE id=?', [Number(req.params.id)]))[0];
  if (!s || (!canSeeAll(req.user.role) && s.user_id !== req.user.id)) { res.status(404).json({ error: 'Not found' }); return null; }
  if (s.status !== 'done') { res.status(409).json({ error: 'This job has not finished screening' }); return null; }
  return s;
}
async function decide(s: any, cont: boolean, reason: string | undefined, userId: number) {
  if (cont && s.verdict !== 'PASS') await exec('INSERT IGNORE INTO overrides (screening_id, user_id, verdict_at_time, reason) VALUES (?,?,?,?)', [s.id, userId, s.verdict, reason]);
  await exec(`UPDATE screenings SET proceeded=?, continued_at=${cont ? 'COALESCE(continued_at, NOW())' : 'continued_at'} WHERE id=?`, [cont ? 'yes' : 'no', s.id]);
  await audit(userId, cont ? 'plugin_continue' : 'plugin_skip', `screening=${s.id}`);
}

/** Save the proposal the plugin wrote, with the profile and projects it used. A second save adds a new version. */
plugin.post('/plugin/jobs/:id/proposal', anyone, async (req, res) => {
  const b = z.object({
    text: z.string().trim().min(30, 'Send the proposal text').max(30_000),
    profile: z.union([z.number().int().positive(), z.string().trim().min(1).max(190)]),
    projects: z.array(z.string().trim().min(1).max(190)).max(6).default([]),
    template: z.string().trim().max(160).optional(),
    finished: z.boolean().default(true),
    continue_reason: z.string().trim().max(2000).optional(),
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
  const prof = typeof d.profile === 'number' ? profs.find((p) => p.id === d.profile) : profs.find((p) => p.name.toLowerCase() === String(d.profile).toLowerCase());
  if (!prof) return void res.status(400).json({ error: `No active Upwork profile called "${d.profile}". Active profiles: ${profs.map((p) => p.name).join(', ') || 'none'}`, field: 'profile' });
  const lib = await query<any>('SELECT id, name FROM projects');
  const picked = d.projects.map((n) => ({ name: n, p: lib.find((x) => x.name.toLowerCase() === n.toLowerCase()) ?? null }));
  const unknown = picked.filter((x) => !x.p).map((x) => x.name);

  const conn = await pool.getConnection();
  let version = 1, proposalId = 0;
  try {
    await conn.beginTransaction();
    // the projects it used: mark them chosen among any matches the app already has, add the rest
    const [have]: any = await conn.query('SELECT id, project_id, project_name, rank_no FROM job_matches WHERE screening_id=?', [s.id]);
    await conn.query('UPDATE job_matches SET selected=0 WHERE screening_id=?', [s.id]);
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
      await conn.query(`UPDATE proposals SET status='done', stage=NULL, profile_id=?, template_name=COALESCE(?, template_name), finished_at=COALESCE(finished_at, NOW()),
        finalized_at=${d.finished ? 'COALESCE(finalized_at, NOW())' : 'finalized_at'}, finalized_by=${d.finished ? 'COALESCE(finalized_by, ?)' : 'finalized_by'} WHERE id=?`,
        d.finished ? [prof.id, d.template ?? null, userId, proposalId] : [prof.id, d.template ?? null, proposalId]);
    } else {
      const [ins]: any = await conn.query(`INSERT INTO proposals (screening_id, status, template_choice, template_name, created_by, finished_at, profile_id, finalized_at, finalized_by, model, warnings)
        VALUES (?, 'done', 'manual', ?, ?, NOW(), ?, ?, ?, 'claude-plugin', '[]')`, [s.id, d.template ?? 'Claude plugin', userId, prof.id, d.finished ? new Date() : null, d.finished ? userId : null]);
      proposalId = Number(ins.insertId);
    }
    await conn.query(`INSERT INTO proposal_versions (proposal_id, version_no, content_html, source, note, created_by) VALUES (?,?,?,'plugin','From the Claude plugin',?)`, [proposalId, version, textToHtml(d.text), userId]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  await audit(userId, 'plugin_proposal_save', `screening=${s.id} version=${version} profile=${prof.id}${d.finished ? ' finished' : ''}`);
  res.json({ ok: true, proposal_id: proposalId, version, profile: prof.name, projects_not_in_library: unknown,
    next: d.finished ? 'Ready to send: once it is submitted on Upwork, set the status to Sent.' : 'Saved as a draft. Save again with finished=true when it is final.' });
});

/** The values the plugin may use: active profiles, project names, rule codes, statuses, outcomes and loss reasons. */
plugin.get('/plugin/options', anyone, async (_req, res) => {
  const cfg = await getSettings();
  res.json({
    profiles: (await query<any>('SELECT id, name FROM upwork_profiles WHERE active=1 ORDER BY name')),
    projects: (await query<any>('SELECT name FROM projects WHERE active=1 ORDER BY name')).map((p) => p.name),
    rules: await query("SELECT code, type, rule, details FROM rules WHERE active=1 ORDER BY type='flag', CAST(SUBSTRING(code, 2) AS UNSIGNED)"),
    statuses: ['Sent', 'Viewed', 'Chat opened', 'Interview'], outcomes: cfg['tracking.outcomes'], loss_outcomes: cfg['tracking.loss_outcomes'], loss_reasons: cfg['tracking.loss_reasons'],
    min_continue_reason: cfg['override.min_reason'],
  });
});
