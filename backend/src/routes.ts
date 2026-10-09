import { Router } from 'express';
import { z } from 'zod';
import { audit, exec, pool, query } from './db';
import { attachUser, hashPassword, login, loginThrottled, logout, requireRole, setSessionCookie } from './auth';
import { detectInput, InputError, jobIdFromUrl } from './screening/jobsource';
import { loadContext } from './screening/context';
import { gatePrompt, normalizeReport } from './screening/contract';
import { screenJobText } from './screening/service';
import { library, loomVideos } from './routes_library';
import { proposals, proposalFor } from './routes_proposals';
import { imports } from './routes_import';
import { pickLoom, validSelection } from './screening/matching';
import { EXPORT_LIMIT, exportRows, toCsv, toXlsx } from './export';
import { getSettings, setSetting, SETTINGS, settingsConflict, type SettingKey } from './settings';
import { plugin } from './routes_plugin';
import { writing } from './routes_writing';
import { oauthApi } from './oauth';
import { htmlToPlain } from './html';
import { buildReport, packRows } from './reports';
import { withCallContext } from './llm/context';
import { testCall } from './llm';
import { PROVIDERS, PROVIDER_IDS, currentChoice, keyPresent, realCallsEnabled, type ProviderId } from './llm/providers';

export const api = Router();
api.use(attachUser);
api.use(library);
api.use(proposals);
api.use(imports);
api.use(plugin);
api.use(writing);
api.use(oauthApi);

const wrap = (e: unknown) => (e instanceof z.ZodError ? { error: 'Invalid input', issues: e.issues.map((i) => i.message) } : null);

// ---------- auth ----------
api.post('/login', async (req, res) => {
  const b = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Email and password required' });
  const key = `${req.ip}|${b.data.email.toLowerCase()}`;
  if (loginThrottled(key)) return void res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const r = await login(b.data.email, b.data.password);
  if (!r) return void res.status(401).json({ error: 'Wrong email or password' });
  setSessionCookie(res, r.token);
  await audit(r.user.id, 'login');
  res.json({ user: r.user });
});
api.post('/logout', async (req, res) => { await logout(req, res); res.json({ ok: true }); });
api.get('/me', (req, res) => res.json({ user: req.user ?? null }));

// ---------- screenings ----------
const canSeeAll = (role: string) => role === 'admin' || role === 'manager';

api.post('/screenings', requireRole(), async (req, res) => {
  const b = z.object({
    input: z.string(),
    job_url: z.string().trim().max(500).nullish(),
  }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Paste a job link or the job page text' });
  let parsed;
  try { parsed = detectInput(b.data.input); }
  catch (e) { if (e instanceof InputError) return void res.status(400).json({ error: e.message, code: e.code }); throw e; }

  let sourceUrl: string | null = parsed.type === 'link' ? parsed.url : null;
  if (parsed.type === 'text' && b.data.job_url) {
    if (!/^https?:\/\/(?:[a-z0-9-]+\.)?upwork\.com\/\S+$/i.test(b.data.job_url)) return void res.status(400).json({ error: 'The job link must be an Upwork link' });
    sourceUrl = b.data.job_url;
  }
  const r = await exec(
    `INSERT INTO screenings (user_id, input_type, source_url, upwork_job_id, raw_input, job_text, posting_status) VALUES (?,?,?,?,?,?,'queued')`,
    [req.user!.id, parsed.type, sourceUrl, parsed.type === 'link' ? parsed.jobId : (sourceUrl ? jobIdFromUrl(sourceUrl) : null),
     b.data.input.trim(), parsed.type === 'text' ? parsed.text : null],
  );
  res.status(202).json({ id: r.insertId, status: 'queued', input_type: parsed.type });
});

/**
 * Where a job stands. Two phases: our own work (screening .. ready to send), then Upwork (submitted .. closed).
 * A job is submitted once it is marked Sent, and closed once it has a final outcome ("Pending" is the one outcome
 * that is not final). Skipped and failed jobs are "not pursued".
 */
export const STAGES = ['screening', 'decide', 'projects', 'profile', 'type', 'writing', 'review', 'ready', 'submitted', 'closed', 'skipped', 'failed'] as const;
export const IN_PROGRESS = ['screening', 'decide', 'projects', 'profile', 'type', 'writing', 'review', 'ready'];
// waiting on a person: these are the steps. "screening" and "writing" are the AI at work for a minute or two.
export const NEEDS_ACTION = ['decide', 'projects', 'profile', 'type', 'review', 'ready'];
export const PHASES = ['in_progress', 'submitted', 'closed', 'not_pursued'] as const;
const sentSql = `(s.proposal_sent_at IS NOT NULL OR s.proposal_sent_date IS NOT NULL)`;
const closedSql = `(s.outcome IS NOT NULL AND s.outcome <> 'Pending')`;
const stageSql = `CASE
    WHEN s.status IN ('queued','running') THEN 'screening'
    WHEN s.status = 'error' THEN 'failed'
    WHEN s.proceeded = 'no' THEN 'skipped'
    WHEN ${closedSql} THEN 'closed'
    WHEN ${sentSql} THEN 'submitted'
    WHEN s.continued_at IS NULL THEN 'decide'
    WHEN s.selection_confirmed_at IS NULL THEN 'projects'
    WHEN s.proposal_profile_confirmed_at IS NULL THEN 'profile'
    WHEN p.id IS NULL THEN 'type'
    WHEN p.status IN ('queued','running') THEN 'writing'
    WHEN p.finalized_at IS NULL THEN 'review'
    ELSE 'ready' END`;
const phaseSql = `CASE WHEN (${stageSql}) IN ('skipped','failed') THEN 'not_pursued' WHEN (${stageSql}) IN ('submitted','closed') THEN (${stageSql}) ELSE 'in_progress' END`;
/** The latest thing that happened on Upwork after the proposal: outcome, then interview, replied, viewed, sent. */
const statusSql = `CASE WHEN s.outcome IS NOT NULL THEN s.outcome WHEN s.interviewed='yes' THEN 'Interview' WHEN s.client_replied='yes' THEN 'Chat opened'
  WHEN s.client_viewed='yes' THEN 'Viewed' WHEN s.proposal_sent_date IS NOT NULL OR s.proposal_sent_at IS NOT NULL THEN 'Sent' ELSE NULL END`;
const statusAtSql = `CASE WHEN s.outcome IS NOT NULL THEN s.outcome_at WHEN s.interviewed='yes' THEN s.interviewed_at WHEN s.client_replied='yes' THEN s.client_replied_at
  WHEN s.client_viewed='yes' THEN s.client_viewed_at ELSE COALESCE(s.proposal_sent_at, s.proposal_sent_date) END`;
export const listFrom = `FROM screenings s JOIN users u ON u.id=s.user_id LEFT JOIN overrides o ON o.screening_id=s.id
  LEFT JOIN upwork_profiles pr ON pr.id=s.upwork_profile_id LEFT JOIN proposals p ON p.screening_id=s.id`;
const listSelect = `SELECT s.id, s.user_id, s.notes, s.source, s.input_type, s.source_url, s.title, s.status, s.verdict, s.error_code, s.error_message, s.created_at,
  s.rule_codes, s.proceeded, s.outcome, s.tagging_status, s.selection_confirmed_at, s.continued_at IS NOT NULL AS continued,
  s.client_country, s.budget, s.job_type, s.hire_rate, s.connects_spent, s.boost_connects, s.client_viewed, s.client_replied, s.interviewed, s.proposal_sent_date,
  u.name AS user_name, pr.name AS profile_name, o.id IS NOT NULL AS overridden,
  p.status AS proposal_status, p.finalized_at AS proposal_finalized_at, p.template_name,
  IF(s.source = 'claude_plugin', NULL, TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at)) AS secs_to_proposal, ${stageSql} AS stage, ${phaseSql} AS phase,
  TIMESTAMPDIFF(DAY, COALESCE(${statusAtSql}, s.created_at), NOW()) AS days_since_update,
  TIMESTAMPDIFF(DAY, COALESCE(s.proposal_sent_at, s.proposal_sent_date), s.outcome_at) AS days_to_close, s.outcome_reason, s.proposal_sent_at,
  ${statusSql} AS current_status, ${statusAtSql} AS status_at
  ${listFrom}`;

const PAGE_SIZE = 20;
const likeEsc = (v: string) => v.replace(/[\\%_]/g, (c) => '\\' + c);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const listFilters = z.object({
  verdict: z.enum(['PASS', 'FLAG', 'FAIL']).optional(), mine: z.enum(['0', '1']).optional(), q: z.string().trim().max(100).optional(),
  from: day.optional(), to: day.optional(), rule: z.string().trim().regex(/^[A-Z]\d{1,3}$/).optional(),
  profile: z.coerce.number().int().positive().optional(), user: z.coerce.number().int().positive().optional(),
  outcome: z.string().trim().max(60).optional(), stage: z.enum([...STAGES, 'needs_action', 'quiet']).optional(), phase: z.enum(PHASES).optional(),
  // added for the reports: where it was written, the proposal type, a job tag, a project shown, with or without a Loom video, and the date it was sent
  source: z.enum(['app', 'claude_plugin']).optional(), ptype: z.string().trim().max(160).optional(), tag: z.string().trim().max(120).optional(),
  project: z.string().trim().max(190).optional(), loom: z.enum(['yes', 'no']).optional(), sent_from: day.optional(), sent_to: day.optional(),
});
export type ListFilters = z.infer<typeof listFilters>;

/** Shared by the list, the counters and the export: which jobs this person may see, and the filters. */
export function listWhere(req: any, f: ListFilters, quietDays = 5) {
  const where: string[] = []; const p: any[] = [];
  if (!canSeeAll(req.user.role) || f.mine === '1') { where.push('s.user_id=?'); p.push(req.user.id); }
  if (f.verdict) { where.push('s.verdict=?'); p.push(f.verdict); }
  if (f.q) {
    const like = `%${likeEsc(f.q)}%`;
    where.push(`(s.title LIKE ? OR u.name LIKE ? OR pr.name LIKE ? OR s.rule_codes LIKE ? OR s.source_url LIKE ? OR s.client_country LIKE ?)`);
    p.push(like, like, like, like, like, like);
  }
  if (f.from) { where.push('s.created_at >= ?'); p.push(f.from + ' 00:00:00'); }
  if (f.to) { where.push('s.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); p.push(f.to); }
  if (f.rule) { where.push(`CONCAT(', ', s.rule_codes, ',') LIKE ?`); p.push(`%, ${f.rule},%`); } // whole codes only: G1 never matches G14
  if (f.profile) { where.push('s.upwork_profile_id=?'); p.push(f.profile); }
  if (f.user && canSeeAll(req.user.role)) { where.push('s.user_id=?'); p.push(f.user); }
  if (f.outcome) { if (f.outcome === 'none') where.push('s.outcome IS NULL'); else { where.push('s.outcome=?'); p.push(f.outcome); } }
  if (f.phase) { where.push(`(${phaseSql})=?`); p.push(f.phase); }
  if (f.source) { where.push(f.source === 'app' ? `(s.source IS NULL OR s.source<>'claude_plugin')` : `s.source='claude_plugin'`); }
  if (f.ptype) { where.push('p.template_name=?'); p.push(f.ptype); }
  if (f.tag) { where.push('EXISTS (SELECT 1 FROM job_tags jt WHERE jt.screening_id=s.id AND jt.tag_name=?)'); p.push(f.tag); }
  if (f.project) { where.push('EXISTS (SELECT 1 FROM job_matches jm WHERE jm.screening_id=s.id AND jm.selected=1 AND jm.project_name=?)'); p.push(f.project); }
  if (f.loom) { where.push(f.loom === 'yes' ? '(s.loom_video_id IS NOT NULL OR s.loom_video_title IS NOT NULL)' : `(s.loom_video_id IS NULL AND s.loom_video_title IS NULL AND ${sentSql})`); }
  if (f.sent_from) { where.push('COALESCE(s.proposal_sent_at, s.proposal_sent_date) >= ?'); p.push(f.sent_from + ' 00:00:00'); }
  if (f.sent_to) { where.push('COALESCE(s.proposal_sent_at, s.proposal_sent_date) < DATE_ADD(?, INTERVAL 1 DAY)'); p.push(f.sent_to); }
  if (f.stage === 'needs_action') { where.push(`(${stageSql}) IN (?)`); p.push(NEEDS_ACTION); }
  else if (f.stage === 'quiet') { where.push(`(${stageSql})='submitted' AND COALESCE(${statusAtSql}, s.created_at) < NOW() - INTERVAL ? DAY`); p.push(quietDays); }
  else if (f.stage) { where.push(`(${stageSql})=?`); p.push(f.stage); }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', p };
}

/** Columns the list can be sorted by. Anything else falls back to newest first. */
const SORTS: Record<string, string> = {
  created: 's.id', title: 's.title', verdict: `FIELD(s.verdict,'PASS','FLAG','FAIL')`, country: 's.client_country',
  hire_rate: `CAST(REGEXP_SUBSTR(s.hire_rate, '[0-9]+') AS UNSIGNED)`, user: 'u.name', profile: 'pr.name', outcome: 's.outcome',
  stage: `FIELD(${stageSql}, ${STAGES.map((x) => `'${x}'`).join(',')})`, quiet: `COALESCE(${statusAtSql}, s.created_at)`, time: 'TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at)',
};
export const orderBy = (sort?: string, dir?: string) => {
  const col = SORTS[sort ?? ''] ?? SORTS.created;
  const d = dir === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY ${col} IS NULL, ${col} ${d}, s.id DESC`; // empty values last, whichever way
};

api.get('/screenings', requireRole(), async (req, res) => {
  const f = listFilters.extend({ page: z.coerce.number().int().min(1).default(1), sort: z.string().max(20).optional(), dir: z.enum(['asc', 'desc']).optional() }).parse(req.query);
  const w = listWhere(req, f, (await getSettings())['tracking.quiet_days']);
  const total = Number((await query<any>(`SELECT COUNT(*) AS n ${listFrom} ${w.sql}`, w.p))[0].n);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const rows = await query(`${listSelect} ${w.sql} ${orderBy(f.sort, f.dir)} LIMIT ? OFFSET ?`, [...w.p, PAGE_SIZE, (page - 1) * PAGE_SIZE]);
  res.json({ screenings: rows, total, page, pages, page_size: PAGE_SIZE });
});

// Counts for the summary tiles: every filter applies except the verdict, so the tiles can switch between verdicts.
api.get('/screenings/stats', requireRole(), async (req, res) => {
  const f = listFilters.parse(req.query);
  const quiet = (await getSettings())['tracking.quiet_days'];
  const w = listWhere(req, { ...f, verdict: undefined }, quiet);
  const r = (await query<any>(
    `SELECT COUNT(*) AS total, SUM(s.verdict='PASS') AS pass_n, SUM(s.verdict='FLAG') AS flag_n, SUM(s.verdict='FAIL') AS fail_n, SUM(o.id IS NOT NULL) AS overridden,
       SUM((${stageSql}) IN (?)) AS needs_action,
       SUM((${stageSql})='submitted' AND COALESCE(${statusAtSql}, s.created_at) < NOW() - INTERVAL ? DAY) AS quiet
     ${listFrom} ${w.sql}`, [NEEDS_ACTION, quiet, ...w.p]))[0];
  // the tab counts ignore the tab (phase) and stage filters, so every tab shows its own size
  const wt = listWhere(req, { ...f, verdict: undefined, phase: undefined, stage: undefined }, quiet);
  const tabs = await query<any>(`SELECT (${phaseSql}) AS phase, COUNT(*) AS n ${listFrom} ${wt.sql} GROUP BY 1`, wt.p);
  res.json({ total: Number(r.total), PASS: Number(r.pass_n || 0), FLAG: Number(r.flag_n || 0), FAIL: Number(r.fail_n || 0), overridden: Number(r.overridden || 0),
    needs_action: Number(r.needs_action || 0), quiet: Number(r.quiet || 0), quiet_days: quiet,
    tabs: Object.fromEntries(tabs.map((t) => [t.phase, Number(t.n)])) });
});

// The dashboard: counts, the funnel, timings, what needs attention, and who does what, for a period.
// Built on the same filters as the Jobs list, so a number here is the same number there.
api.get('/dashboard', requireRole(), async (req, res) => {
  const f = listFilters.pick({ from: true, to: true, profile: true, user: true, mine: true }).parse(req.query);
  const w = listWhere(req, f);
  const one = async (sql: string, p: any[] = []) => (await query<any>(sql, [...p, ...w.p]))[0];
  const n = (v: any) => Number(v || 0);
  const c = await one(`SELECT COUNT(*) AS screened, SUM(s.verdict='PASS') AS pass_n, SUM(s.verdict='FLAG') AS flag_n, SUM(s.verdict='FAIL') AS fail_n,
      SUM(s.status='error') AS failed, SUM(s.continued_at IS NOT NULL) AS continued, SUM(o.id IS NOT NULL) AS overridden,
      SUM(p.finished_at IS NOT NULL) AS proposals, SUM(p.finalized_at IS NOT NULL) AS finalized, SUM(s.proposal_sent_date IS NOT NULL) AS sent,
      SUM(s.client_viewed='yes') AS viewed, SUM(s.client_replied='yes') AS replied, SUM(s.interviewed='yes') AS interviewed, SUM(s.outcome='Hired') AS hired,
      SUM(s.connects_spent) + COALESCE(SUM(s.boost_connects), 0) AS connects,
      AVG(IF(s.source='claude_plugin', NULL, TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at))) AS avg_to_proposal, MIN(IF(s.source='claude_plugin', NULL, TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at))) AS min_to_proposal,
      MAX(IF(s.source='claude_plugin', NULL, TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at))) AS max_to_proposal,
      AVG(IF(s.source='claude_plugin', NULL, TIMESTAMPDIFF(SECOND, COALESCE(s.started_at, s.created_at), s.finished_at))) AS avg_screening,
      AVG(TIMESTAMPDIFF(SECOND, s.continued_at, s.tagged_at)) AS avg_matching,
      AVG(IF(s.source='claude_plugin', NULL, TIMESTAMPDIFF(SECOND, p.created_at, p.finished_at))) AS avg_writing
    ${listFrom} ${w.sql}`);
  const stages = await query<any>(`SELECT (${stageSql}) AS stage, COUNT(*) AS n ${listFrom} ${w.sql} GROUP BY 1`, w.p);
  const waiting = await query<any>(`SELECT s.id, s.title, s.user_id, u.name AS user_name, s.created_at, (${stageSql}) AS stage ${listFrom} ${w.sql ? w.sql + ' AND' : 'WHERE'} (${stageSql}) IN (?)
    ORDER BY s.created_at LIMIT 8`, [...w.p, NEEDS_ACTION]);
  const daily = await query<any>(`SELECT DATE(s.created_at) AS d, COUNT(*) AS screened, SUM(s.continued_at IS NOT NULL) AS continued, SUM(p.finished_at IS NOT NULL) AS proposals
    ${listFrom} ${w.sql} GROUP BY DATE(s.created_at) ORDER BY d DESC LIMIT 31`, w.p);
  const by = (col: string, name: string) => query<any>(`SELECT ${col} AS id, ${name} AS name, COUNT(*) AS screened, SUM(s.continued_at IS NOT NULL) AS continued,
      SUM(p.finished_at IS NOT NULL) AS proposals, SUM(s.proposal_sent_date IS NOT NULL) AS sent, SUM(s.outcome='Hired') AS hired,
      AVG(IF(s.source='claude_plugin', NULL, TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at))) AS avg_to_proposal
    ${listFrom} ${w.sql} GROUP BY ${col}, ${name} ORDER BY screened DESC LIMIT 20`, w.p)
    .then((rows) => rows.map((r) => ({ id: r.id, name: r.name, screened: n(r.screened), continued: n(r.continued), proposals: n(r.proposals), sent: n(r.sent), hired: n(r.hired),
      avg_to_proposal: r.avg_to_proposal == null ? null : Math.round(Number(r.avg_to_proposal)) })));
  // rule codes are stored as "G3, G14": count each code, and how often a job carrying it was continued anyway
  const ruleRows = await query<any>(`SELECT s.rule_codes, s.continued_at IS NOT NULL AS cont ${listFrom} ${w.sql ? w.sql + ' AND' : 'WHERE'} s.rule_codes IS NOT NULL`, w.p);
  const rules = new Map<string, { code: string; fired: number; continued: number }>();
  for (const r of ruleRows) for (const code of String(r.rule_codes).split(/\s*,\s*/).filter(Boolean)) {
    const x = rules.get(code) ?? { code, fired: 0, continued: 0 }; x.fired++; if (Number(r.cont)) x.continued++; rules.set(code, x);
  }
  const ruleText = new Map((await query<any>('SELECT code, type, rule FROM rules')).map((r) => [r.code, r]));
  res.json({
    counts: { screened: n(c.screened), PASS: n(c.pass_n), FLAG: n(c.flag_n), FAIL: n(c.fail_n), failed: n(c.failed), continued: n(c.continued), overridden: n(c.overridden),
      proposals: n(c.proposals), finalized: n(c.finalized), sent: n(c.sent), viewed: n(c.viewed), replied: n(c.replied), interviewed: n(c.interviewed), hired: n(c.hired), connects: n(c.connects) },
    timings: { avg_to_proposal: c.avg_to_proposal == null ? null : Math.round(c.avg_to_proposal), min_to_proposal: c.min_to_proposal, max_to_proposal: c.max_to_proposal,
      avg_screening: c.avg_screening == null ? null : Math.round(c.avg_screening), avg_matching: c.avg_matching == null ? null : Math.round(c.avg_matching),
      avg_writing: c.avg_writing == null ? null : Math.round(c.avg_writing) },
    stages: Object.fromEntries(stages.map((r) => [r.stage, n(r.n)])), needs_action: NEEDS_ACTION, waiting,
    daily: daily.reverse().map((r) => ({ day: String(r.d instanceof Date ? r.d.toLocaleDateString('sv') : r.d).slice(0, 10), screened: n(r.screened), continued: n(r.continued), proposals: n(r.proposals) })),
    by_user: canSeeAll(req.user!.role) ? await by('s.user_id', 'u.name') : [], by_profile: await by('s.upwork_profile_id', 'pr.name'),
    rules: [...rules.values()].sort((a, b) => b.fired - a.fired).slice(0, 12).map((r) => ({ ...r, type: ruleText.get(r.code)?.type ?? null, rule: ruleText.get(r.code)?.rule ?? null })),
  });
});

/** The jobs the filters match, as the reports read them, with their tags, projects and signals. Shared by the Reports page and the plugin. */
export const REPORT_LIMIT = 10000;
export async function reportFor(req: any, f: ListFilters) {
  const w = listWhere(req, f);
  const jobs = await query<any>(`SELECT s.id, s.user_id, u.name AS user_name, s.upwork_profile_id AS profile_id, pr.name AS profile_name, s.source, s.verdict, s.rule_codes,
      o.id IS NOT NULL AS overridden, o.verdict_at_time AS override_verdict, s.continued_at IS NOT NULL AS continued, p.finished_at IS NOT NULL AS written, p.template_name, p.template_choice,
      ${sentSql} AS sent, COALESCE(s.proposal_sent_at, s.proposal_sent_date) AS sent_at, s.client_viewed='yes' AS viewed, s.client_replied='yes' AS chat, s.interviewed='yes' AS interview,
      s.outcome, s.outcome_reason, s.outcome_at, s.client_viewed_at AS viewed_at, s.client_replied_at AS chat_at, s.connects_spent, s.boost_connects, s.created_at,
      s.client_country, s.job_type, s.experience_level, s.loom_video_id, s.loom_video_title,
      TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at) AS secs_to_proposal,
      (SELECT pv.content_html FROM proposal_versions pv WHERE pv.proposal_id=p.id ORDER BY pv.version_no DESC LIMIT 1) AS html
    ${listFrom} ${w.sql} ORDER BY s.id DESC LIMIT ?`, [...w.p, REPORT_LIMIT + 1]);
  const capped = jobs.length > REPORT_LIMIT; if (capped) jobs.pop();
  for (const j of jobs) { const t = j.html ? htmlToPlain(j.html).trim() : ''; j.words = t ? t.split(/\s+/).length : null; delete j.html; }
  const ids = jobs.map((j) => j.id);
  const extra = ids.length ? {
    tags: await query<any>('SELECT screening_id, tag_name, category_name FROM job_tags WHERE screening_id IN (?)', [ids]),
    projects: await query<any>('SELECT screening_id, project_name FROM job_matches WHERE selected=1 AND screening_id IN (?)', [ids]),
    signals: await query<any>('SELECT screening_id, signal_number, signal_name, value_name, is_fallback FROM job_signals WHERE screening_id IN (?)', [ids]),
  } : { tags: [], projects: [], signals: [] };
  return { ...buildReport(jobs, extra, (await getSettings())['tracking.loss_outcomes']), capped, limit: REPORT_LIMIT };
}
// Reports: every trend we can count, for the jobs the filters match. Every row carries the Jobs list link that shows its jobs.
api.get('/reports', requireRole(), async (req, res) => {
  const f = listFilters.safeParse(req.query);
  if (!f.success) return void res.status(400).json({ error: f.error.issues[0].message });
  res.json(await reportFor(req, f.data));
});

// Everything about every job the filters match, as CSV or Excel. Same filters and order as the Jobs list.
api.get('/screenings/export', requireRole(), async (req, res) => {
  const f = listFilters.extend({ format: z.enum(['csv', 'xlsx']).default('csv'), sort: z.string().max(20).optional(), dir: z.enum(['asc', 'desc']).optional() }).parse(req.query);
  const w = listWhere(req, f, (await getSettings())['tracking.quiet_days']);
  const list = await query<any>(`${listSelect} ${w.sql} ${orderBy(f.sort, f.dir)} LIMIT ?`, [...w.p, EXPORT_LIMIT]);
  const { headers, rows } = await exportRows(list.map((r) => r.id), new Map(list.map((r) => [r.id, r.stage])));
  const name = `upwork-pro-jobs-${new Date().toLocaleDateString("sv")}.${f.format}`; // sv gives YYYY-MM-DD in local time
  await audit(req.user!.id, 'export', `format=${f.format} rows=${rows.length} filters=${new URLSearchParams(req.query as any).toString().slice(0, 300)}`);
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  if (f.format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return void res.send(await toXlsx(headers, rows));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(toCsv(headers, rows));
});

// What the filter menus can offer: the people, profiles, rule codes and outcomes that exist.
api.get('/screenings/filter-options', requireRole(), async (req, res) => {
  const all = canSeeAll(req.user!.role);
  res.json({
    users: all ? await query('SELECT id, name FROM users ORDER BY name') : [],
    profiles: await query('SELECT id, name FROM upwork_profiles ORDER BY active DESC, name'),
    rules: await query("SELECT code, type, rule FROM rules ORDER BY type='flag', CAST(SUBSTRING(code, 2) AS UNSIGNED)"),
    outcomes: (await query<any>('SELECT DISTINCT outcome FROM screenings WHERE outcome IS NOT NULL ORDER BY outcome')).map((r) => r.outcome),
    types: (await query<any>('SELECT DISTINCT template_name FROM proposals WHERE template_name IS NOT NULL ORDER BY template_name')).map((r) => r.template_name),
    stages: STAGES, needs_action: NEEDS_ACTION, in_progress: IN_PROGRESS, phases: PHASES,
  });
});


/** Everything the page needs for step 2: tags with reasons, the 5 matches with scores, and the confirmed selection. */
async function matchingFor(id: number) {
  const s = (await query<any>(
    `SELECT s.verdict, s.status, s.continued_at, s.tagging_status, s.tagging_error_message, s.tagged_at, s.selection_confirmed_at, s.job_needs, u.name AS confirmed_by
     FROM screenings s LEFT JOIN users u ON u.id=s.selection_confirmed_by WHERE s.id=?`, [id]))[0];
  if (!s) return null;
  const pp = (await query<any>(
    `SELECT s.proposal_profile_id AS id, pr.name, pr.tagline, pr.price, pr.gitlab_account, pr.profile_url, s.proposal_profile_confirmed_at AS confirmed_at, u.name AS confirmed_by
     FROM screenings s LEFT JOIN upwork_profiles pr ON pr.id=s.proposal_profile_id LEFT JOIN users u ON u.id=s.proposal_profile_confirmed_by WHERE s.id=?`, [id]))[0];
  const base = { continued: !!s.continued_at, continued_at: s.continued_at, status: s.tagging_status as string | null, error: s.tagging_error_message as string | null,
    tags: [] as any[], matches: [] as any[], confirmed_at: s.selection_confirmed_at as string | null, confirmed_by: s.confirmed_by as string | null,
    proposal_profile: pp && pp.id ? { id: pp.id, name: pp.name, tagline: pp.tagline, price: pp.price, gitlab_account: pp.gitlab_account, profile_url: pp.profile_url, confirmed_at: pp.confirmed_at, confirmed_by: pp.confirmed_by } : null,
    profiles: [] as any[], job_needs: s.job_needs as string | null };
  if (s.tagging_status !== 'done') return base;
  base.tags = await query(
    `SELECT jt.tag_name AS name, jt.category_name AS category, jt.weight, jt.reason FROM job_tags jt LEFT JOIN tag_categories c ON c.name=jt.category_name
     WHERE jt.screening_id=? ORDER BY COALESCE(c.sort_order, 999), jt.weight DESC, jt.tag_name`, [id]);
  const rows = await query<any>('SELECT project_id, project_name, rank_no, score, max_score, compliance_gap, recommended, shared_tags, selected, pool, alternative, platform FROM job_matches WHERE screening_id=? ORDER BY rank_no', [id]);
  base.matches = rows.map((r) => ({
    project_id: r.project_id, project_name: r.project_name, rank: r.rank_no, score: r.score, max_score: r.max_score,
    percent: r.max_score ? Math.round((r.score / r.max_score) * 100) : 0, compliance_gap: r.compliance_gap,
    recommended: !!r.recommended, selected: !!r.selected, shared: JSON.parse(r.shared_tags), pool: r.pool, alternative: !!r.alternative, platform: r.platform,
  }));
  if (s.selection_confirmed_at) { // step 3 needs every profile to choose from
    base.profiles = await query('SELECT id, name, tagline, price, gitlab_account, github_url, profile_url, services, notes, active FROM upwork_profiles ORDER BY active DESC, name');
    // each profile's Loom video that fits this job best, if it has any
    const vids = (await loomVideos('v.active=1')).map((v) => ({ ...v, tags: v.tags.map((t: any) => t.name) }));
    for (const p of base.profiles) {
      const best = pickLoom(base.tags, vids.filter((v) => v.profile_id === p.id));
      p.loom = best ? { id: best.video.id, title: best.video.title, url: best.video.url, shared: best.shared } : null;
    }
  }
  return base;
}

api.get('/screenings/:id', requireRole(), async (req, res) => {
  const id = Number(req.params.id);
  const rows = await query<any>(
    `SELECT s.*, u.name AS user_name, sv.version AS skill_version, pr.name AS profile_name, pr.tagline AS profile_tagline, pr.price AS profile_price, pr.gitlab_account AS profile_gitlab FROM screenings s JOIN users u ON u.id=s.user_id
     LEFT JOIN skill_versions sv ON sv.id=s.skill_version_id LEFT JOIN upwork_profiles pr ON pr.id=s.upwork_profile_id WHERE s.id=?`, [id]);
  const s = rows[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  const ov = await query<any>(`SELECT o.id, o.reason, o.verdict_at_time, o.created_at, u.name AS user_name FROM overrides o JOIN users u ON u.id=o.user_id WHERE o.screening_id=?`, [id]);
  res.json({
    screening: { ...s, raw_input: undefined, report_json: undefined, job_description: s.job_text, job_text: undefined, report: s.report_json ? normalizeReport(JSON.parse(s.report_json)) : null,
      posting_json: undefined, posting: s.posting_json ? JSON.parse(s.posting_json) : null, gate_rules: s.gate_rules ? JSON.parse(s.gate_rules) : null },
    override: ov[0] ?? null,
    matching: await matchingFor(id),
    proposal: await proposalFor(id),
  });
});

api.post('/screenings/:id/retry', requireRole(), async (req, res) => {
  const id = Number(req.params.id);
  const r = await exec(
    `UPDATE screenings SET status='queued', error_code=NULL, error_message=NULL WHERE id=? AND user_id=? AND status='error'`, [id, req.user!.id]);
  if (!r.affectedRows) return void res.status(409).json({ error: 'Only your own failed screenings can be retried' });
  res.json({ ok: true });
});

// Tracking after screening: who proceeded, when the proposal went out, and how it ended.
const trackBody = z.object({
  proceeded: z.enum(['yes', 'no']).nullable().optional(),
  proposal_sent_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-05').refine((d) => !Number.isNaN(Date.parse(d)), 'Not a real date').nullable().optional(),
  outcome: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  connects_spent: z.number().int().min(0).max(1000).nullable().optional(),
  boost_connects: z.number().int().min(0).max(1000).nullable().optional(),
  client_viewed: z.enum(['yes', 'no']).nullable().optional(),
  client_replied: z.enum(['yes', 'no']).nullable().optional(),
  interviewed: z.enum(['yes', 'no']).nullable().optional(),
  outcome_reason: z.string().trim().max(120).nullable().optional(),
  outcome_note: z.string().trim().max(2000).nullable().optional(),
  loom_video_id: z.number().int().positive().nullable().optional(),
});
const TRACK_KEYS = ['proceeded', 'proposal_sent_date', 'outcome', 'notes', 'connects_spent', 'boost_connects', 'client_viewed', 'client_replied', 'interviewed', 'outcome_reason', 'outcome_note', 'loom_video_id'] as const;
/** Every tracked field, so a change can be stored as old value -> new value. */
const TRACKED = [...TRACK_KEYS, 'proposal_sent_at', 'client_viewed_at', 'client_replied_at', 'interviewed_at', 'outcome_at'];
const show = (v: any) => (v == null ? null : v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : String(v));
async function trackSnapshot(id: number): Promise<Record<string, string | null>> {
  const r = (await query<any>(`SELECT ${TRACKED.join(', ')} FROM screenings WHERE id=?`, [id]))[0] ?? {};
  return Object.fromEntries(TRACKED.map((k) => [k, show(r[k])]));
}
/** Nothing is overwritten silently: each changed field is kept with its old and new value, who changed it and how. */
async function recordChanges(id: number, before: Record<string, string | null>, after: Record<string, string | null>, source: string, userId: number) {
  for (const k of TRACKED) if (before[k] !== after[k]) {
    await exec('INSERT INTO field_changes (screening_id, field, old_value, new_value, source, user_id) VALUES (?,?,?,?,?,?)', [id, k, before[k], after[k], source, userId]);
  }
}
api.patch('/screenings/:id/tracking', requireRole(), async (req, res) => {
  const b = trackBody.safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const id = Number(req.params.id);
  const s = (await query<any>('SELECT user_id, status FROM screenings WHERE id=?', [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  if (s.status !== 'done') return void res.status(409).json({ error: 'Wait until the screening is finished' });
  const before = await trackSnapshot(id);
  // a lost outcome needs a reason from the list, so lost jobs can be reported on
  const cfg = await getSettings();
  const outcome = b.data.outcome !== undefined ? b.data.outcome : before.outcome;
  const reason = b.data.outcome_reason !== undefined ? b.data.outcome_reason : before.outcome_reason;
  if (outcome && cfg['tracking.loss_outcomes'].includes(outcome)) {
    if (!reason) return void res.status(400).json({ error: 'Say why the client did not go ahead' });
    if (!cfg['tracking.loss_reasons'].includes(reason)) return void res.status(400).json({ error: 'Pick one of the listed reasons' });
  } else if (b.data.outcome !== undefined) { b.data.outcome_reason = null; } // not lost: no loss reason
  // the same order as the status button: sent only once the proposal is finished; viewed, chat, interview and outcomes only once it is sent
  const changed = <K extends keyof typeof before>(k: K, v: any) => v !== undefined && (v === '' ? null : v) !== before[k];
  const becomesSent = changed('proposal_sent_date', b.data.proposal_sent_date) && b.data.proposal_sent_date;
  const becomesMilestone = (['client_viewed', 'client_replied', 'interviewed'] as const).some((k) => changed(k, b.data[k]) && b.data[k] === 'yes')
    || (changed('outcome', b.data.outcome) && b.data.outcome && b.data.outcome !== 'Pending');
  if (becomesSent || becomesMilestone) {
    const stage = (await query<any>(`SELECT (${stageSql}) AS stage FROM screenings s LEFT JOIN proposals p ON p.screening_id=s.id WHERE s.id=?`, [id]))[0]?.stage;
    const sentAfter = b.data.proposal_sent_date !== undefined ? b.data.proposal_sent_date : before.proposal_sent_date;
    if (becomesSent && !['ready', 'submitted', 'closed'].includes(stage)) return void res.status(409).json({ error: 'Finish the proposal before marking it as sent' });
    if (becomesMilestone && !sentAfter && !before.proposal_sent_at) return void res.status(409).json({ error: 'Mark the proposal as sent first' });
  }
  const sets: string[] = []; const p: any[] = [];
  for (const k of TRACK_KEYS) {
    if (b.data[k] !== undefined) { sets.push(`${k}=?`); p.push(b.data[k] === '' ? null : b.data[k]); }
  }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  await exec(`UPDATE screenings SET ${sets.join(',')}, tracking_updated_at=NOW() WHERE id=?`, [...p, id]);
  // keep the video's title with the job, so the job still names it after the video is deleted
  if (b.data.loom_video_id !== undefined) await exec('UPDATE screenings s LEFT JOIN loom_videos v ON v.id=s.loom_video_id SET s.loom_video_title=v.title WHERE s.id=?', [id]);
  // a milestone set through the form gets its date-time too (now, unless it already had one), like the status button
  await exec(`UPDATE screenings SET client_viewed_at=IF(client_viewed='yes', COALESCE(client_viewed_at, NOW()), client_viewed_at),
    client_replied_at=IF(client_replied='yes', COALESCE(client_replied_at, NOW()), client_replied_at), interviewed_at=IF(interviewed='yes', COALESCE(interviewed_at, NOW()), interviewed_at),
    outcome_at=IF(outcome IS NOT NULL, COALESCE(outcome_at, NOW()), outcome_at),
    proposal_sent_at=IF(proposal_sent_date IS NOT NULL AND (proposal_sent_at IS NULL OR DATE(proposal_sent_at)<>proposal_sent_date), proposal_sent_date, proposal_sent_at) WHERE id=?`, [id]);
  const after = await trackSnapshot(id);
  await recordChanges(id, before, after, 'tracking form', req.user!.id);
  // a milestone first set through the form also goes into the status history, like the status button
  const firsts: [string, string, string][] = [['proposal_sent_at', 'Sent', 'proposal_sent_at'], ['client_viewed_at', 'Viewed', 'client_viewed_at'], ['client_replied_at', 'Chat opened', 'client_replied_at'],
    ['interviewed_at', 'Interview', 'interviewed_at'], ['outcome_at', after.outcome ?? '', 'outcome_at']];
  for (const [k, label, col] of firsts) if (label && after[col] && before[k] !== after[k]) {
    await exec('INSERT INTO status_events (screening_id, status, happened_at, user_id, reason, note) VALUES (?,?,?,?,?,?)', [id, label, after[col], req.user!.id, k === 'outcome_at' ? after.outcome_reason : null, k === 'outcome_at' ? after.outcome_note : null]);
  }
  await audit(req.user!.id, 'tracking_update', `screening=${id} fields=${Object.keys(b.data).join(',')}`);
  res.json({ ok: true });
});

// ---------- the Claude plugin: look jobs up before saving, so the same job is not saved twice ----------
const pluginSelect = () => listSelect.replace(listFrom, `, s.upwork_job_id ${listFrom}`);
const pluginRow = (r: any) => ({ id: r.id, title: r.title, source: r.source, job_url: r.source_url, upwork_job_id: r.upwork_job_id, verdict: r.verdict, rule_codes: r.rule_codes,
  stage: r.stage, phase: r.phase, status: r.current_status, status_at: r.status_at, outcome: r.outcome, profile: r.profile_name, by: r.user_name, created_at: r.created_at, url: `/#/s/${r.id}` });
api.get('/plugin/jobs', requireRole(), async (req, res) => {
  const f = z.object({ url: z.string().max(500).optional(), job_id: z.string().regex(/^\d{10,30}$/).optional(), q: z.string().trim().max(100).optional(),
    phase: z.enum(PHASES).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
  const w = listWhere(req, { q: f.q, phase: f.phase });
  const jid = f.job_id ?? (f.url ? jobIdFromUrl(f.url) : null);
  const where = [w.sql ? w.sql.replace(/^WHERE /, '') : '', jid ? 's.upwork_job_id=?' : f.url ? 's.source_url=?' : ''].filter(Boolean);
  const rows = await query<any>(`${pluginSelect()} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.id DESC LIMIT ?`,
    [...w.p, ...(jid ? [jid] : f.url ? [f.url] : []), f.limit]);
  res.json({ jobs: rows.map(pluginRow) });
});
api.get('/plugin/jobs/:id', requireRole(), async (req, res) => {
  const id = Number(req.params.id);
  const r = (await query<any>(`${pluginSelect()} WHERE s.id=?`, [id]))[0];
  if (!r || (!canSeeAll(req.user!.role) && r.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  const cur = (await query<any>('SELECT v.version_no, v.content_html FROM proposal_versions v JOIN proposals p ON p.id=v.proposal_id WHERE p.screening_id=? ORDER BY v.version_no DESC LIMIT 1', [id]))[0];
  const events = await query('SELECT status, happened_at, reason, note FROM status_events WHERE screening_id=? ORDER BY happened_at, id', [id]);
  res.json({ job: { ...pluginRow(r), proposal: cur ? { version: cur.version_no, text: htmlToPlain(cur.content_html) } : null, status_history: events } });
});

// ---------- bulk reads for analysis in Claude: many jobs at once, and the trend numbers ----------
/** The Jobs list filters, plus names instead of ids (Claude knows a profile by its name). */
const analysisFilters = listFilters.extend({ profile_name: z.string().trim().max(120).optional(), person: z.string().trim().max(120).optional() });
async function analysisWhere(req: any, f: z.infer<typeof analysisFilters>) {
  if (f.profile_name) {
    const p = (await query<any>('SELECT id FROM upwork_profiles WHERE name=? LIMIT 1', [f.profile_name]))[0];
    if (!p) throw Object.assign(new Error(`No Upwork profile is called "${f.profile_name}". See plugin_options for the names.`), { status: 400 });
    f.profile = p.id;
  }
  if (f.person) {
    const u = (await query<any>('SELECT id FROM users WHERE name=? LIMIT 1', [f.person]))[0];
    if (!u) throw Object.assign(new Error(`No person is called "${f.person}".`), { status: 400 });
    f.user = u.id;
  }
  return f;
}
const INCLUDES = ['tags', 'signals', 'flags', 'description', 'proposal', 'history', 'client'] as const;
/**
 * Many jobs in one call, for comparing what worked. One row per job as a list of cells (the column names come once, in
 * `columns`), newest first. The answer is cut at a character budget and says whether more are left: ask again with
 * `after` = `next_after` until `more` is false. `include` adds the heavier fields only when they are wanted.
 */
api.get('/plugin/analysis/jobs', requireRole(), async (req, res) => {
  const q = analysisFilters.extend({ include: z.string().max(200).optional(), after: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(500), budget: z.coerce.number().int().min(2000).max(85000).default(80000),
    text_chars: z.coerce.number().int().min(100).max(20000).default(1500) }).safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: q.error.issues[0].message });
  let f: z.infer<typeof analysisFilters>;
  try { f = await analysisWhere(req, q.data); } catch (e: any) { return void res.status(e.status ?? 500).json({ error: e.message }); }
  const inc = new Set((q.data.include ?? '').split(',').map((x) => x.trim()).filter(Boolean));
  const unknown = [...inc].filter((x) => !(INCLUDES as readonly string[]).includes(x));
  if (unknown.length) return void res.status(400).json({ error: `include can be: ${INCLUDES.join(', ')}. Not: ${unknown.join(', ')}` });
  const w = listWhere(req, f, (await getSettings())['tracking.quiet_days']);
  const total = Number((await query<any>(`SELECT COUNT(*) AS n ${listFrom} ${w.sql}`, w.p))[0].n);
  const and = (extra: string) => (w.sql ? `${w.sql} AND ${extra}` : `WHERE ${extra}`);
  const list = await query<any>(`SELECT s.id, s.created_at, u.name AS person, pr.name AS profile, s.source, s.title, s.source_url, s.verdict, s.rule_codes, (${stageSql}) AS stage,
      s.continued_at IS NOT NULL AS continued, o.verdict_at_time AS continued_past, o.reason AS continue_reason, p.template_name, p.template_choice,
      COALESCE(s.proposal_sent_at, s.proposal_sent_date) AS sent_at, s.client_viewed, s.client_viewed_at, s.client_replied, s.client_replied_at, s.interviewed, s.interviewed_at,
      s.outcome, s.outcome_at, s.outcome_reason, s.outcome_note, s.connects_spent, s.boost_connects, s.loom_video_title,
      s.client_country, s.budget, s.job_type, s.experience_level, s.hire_rate, s.total_spent, s.payment_verified, s.client_rating, s.avg_hourly_paid, s.proposals AS proposals_on_job, s.posted,
      TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at) AS secs_to_proposal, s.notes
      ${inc.has('flags') || inc.has('description') ? ', s.report_json, s.posting_json, s.job_text' : ''}
    ${listFrom} ${q.data.after ? and('s.id < ?') : w.sql} ORDER BY s.id DESC LIMIT ?`, [...w.p, ...(q.data.after ? [q.data.after] : []), q.data.limit]);
  const ids = list.map((r) => r.id);
  const group = (rows: any[]) => { const m = new Map<number, any[]>(); for (const r of rows) (m.get(r.screening_id) ?? m.set(r.screening_id, []).get(r.screening_id)!).push(r); return m; };
  const projects = group(ids.length ? await query<any>('SELECT screening_id, project_name FROM job_matches WHERE selected=1 AND screening_id IN (?) ORDER BY rank_no', [ids]) : []);
  const tags = group(ids.length ? await query<any>('SELECT screening_id, tag_name, category_name FROM job_tags WHERE screening_id IN (?) ORDER BY category_name, tag_name', [ids]) : []);
  const signals = group(ids.length && inc.has('signals') ? await query<any>('SELECT screening_id, signal_name, value_name FROM job_signals WHERE is_fallback=0 AND screening_id IN (?) ORDER BY signal_number', [ids]) : []);
  const history = group(ids.length && inc.has('history') ? await query<any>('SELECT screening_id, status, happened_at, reason FROM status_events WHERE screening_id IN (?) ORDER BY happened_at, id', [ids]) : []);
  const proposals = new Map<number, string>();
  if (ids.length) for (const v of await query<any>(`SELECT p.screening_id, v.content_html FROM proposals p JOIN proposal_versions v ON v.proposal_id=p.id
      WHERE p.screening_id IN (?) AND v.version_no=(SELECT MAX(v2.version_no) FROM proposal_versions v2 WHERE v2.proposal_id=p.id)`, [ids])) proposals.set(v.screening_id, htmlToPlain(v.content_html).trim());
  const cut = (t: string | null | undefined) => { const x = (t ?? '').trim(); return x.length > q.data.text_chars ? x.slice(0, q.data.text_chars) + ' [cut]' : x; };
  const yes = (v: any) => (v === 'yes' ? 1 : 0), when = (v: any) => (v ? String(v).slice(0, 16) : null);
  const columns = ['id', 'screened', 'person', 'profile', 'written_in', 'title', 'stage', 'gate_result', 'rule_codes', 'continued', 'continued_past', 'proposal_type', 'type_chosen', 'projects', 'industry',
    'proposal_words', 'loom_video', 'connects', 'boost', 'sent_at', 'viewed', 'viewed_at', 'chat_opened', 'chat_at', 'interview', 'interview_at', 'outcome', 'outcome_at', 'loss_reason',
    'client_country', 'budget', 'job_type', 'experience_level', 'secs_to_proposal',
    ...(inc.has('client') ? ['hire_rate', 'total_spent', 'payment_verified', 'client_rating', 'avg_hourly_paid', 'proposals_on_job', 'posted'] : []),
    ...(inc.has('tags') ? ['tags'] : []), ...(inc.has('signals') ? ['signals'] : []), ...(inc.has('flags') ? ['flags'] : []), ...(inc.has('history') ? ['status_history', 'continue_reason', 'outcome_note', 'notes'] : []),
    ...(inc.has('description') ? ['description'] : []), ...(inc.has('proposal') ? ['proposal'] : [])];
  const rows = list.map((r) => {
    const t = tags.get(r.id) ?? [], prop = proposals.get(r.id) ?? '';
    let rep: any = null, post: any = null;
    if (inc.has('flags') || inc.has('description')) { try { rep = r.report_json ? normalizeReport(JSON.parse(r.report_json)).jobs[0] : null; } catch { rep = null; } try { post = r.posting_json ? JSON.parse(r.posting_json) : null; } catch { post = null; } }
    return [r.id, when(r.created_at), r.person, r.profile, r.source === 'claude_plugin' ? 'Claude plugin' : 'Upwork Pro', (r.title ?? '').slice(0, 90), r.stage, r.verdict, r.rule_codes, Number(r.continued), r.continued_past,
      r.template_name, r.template_name ? r.template_choice : null, (projects.get(r.id) ?? []).map((x) => x.project_name).join('; ') || null, t.filter((x) => /^industry$/i.test(x.category_name)).map((x) => x.tag_name).join('; ') || null,
      prop ? prop.split(/\s+/).length : null, r.loom_video_title, r.connects_spent, r.boost_connects, when(r.sent_at), yes(r.client_viewed), when(r.client_viewed_at), yes(r.client_replied), when(r.client_replied_at),
      yes(r.interviewed), when(r.interviewed_at), r.outcome, when(r.outcome_at), r.outcome_reason, r.client_country, r.budget, r.job_type, r.experience_level, r.secs_to_proposal,
      ...(inc.has('client') ? [r.hire_rate, r.total_spent, r.payment_verified, r.client_rating, r.avg_hourly_paid, r.proposals_on_job, r.posted] : []),
      ...(inc.has('tags') ? [t.filter((x) => !/^industry$/i.test(x.category_name)).map((x) => x.tag_name).join('; ') || null] : []),
      ...(inc.has('signals') ? [(signals.get(r.id) ?? []).map((x) => `${x.signal_name}: ${x.value_name}`).join('; ') || null] : []),
      ...(inc.has('flags') ? [rep ? [...rep.fails, ...rep.flags].map((x: any) => `${x.code ?? ''} ${x.rule}: ${x.value}`.trim()).join(' | ') || null : null] : []),
      ...(inc.has('history') ? [(history.get(r.id) ?? []).map((x) => `${x.status} ${when(x.happened_at)}${x.reason ? ' (' + x.reason + ')' : ''}`).join('; ') || null, r.continue_reason, r.outcome_note, r.notes] : []),
      ...(inc.has('description') ? [cut(post?.description || r.job_text)] : []), ...(inc.has('proposal') ? [cut(prop) || null] : [])];
  });
  const packed = packRows(rows, q.data.budget);
  const last = packed.rows.length ? (packed.rows[packed.rows.length - 1][0] as number) : null;
  const more = packed.more || (list.length === q.data.limit && total > list.length && packed.rows.length === rows.length && rows.length > 0 && (await query<any>(`SELECT 1 ${listFrom} ${and('s.id < ?')} LIMIT 1`, [...w.p, last])).length > 0);
  await audit(req.user!.id, 'analysis_read', `jobs=${packed.rows.length} of ${total} include=${[...inc].join('+') || 'none'}`);
  res.json({ total, returned: packed.rows.length, more, next_after: more ? last : null, columns, rows: packed.rows,
    note: more ? `There are more jobs. Call again with after=${last} and the same filters, and keep going until more is false. Do not analyse until you have them all.` : 'That is every job these filters match.' });
});
/** The trend numbers themselves (the Reports page), so Claude does not have to count: the funnel for every group of every report. */
api.get('/plugin/analysis/report', requireRole(), async (req, res) => {
  const q = analysisFilters.extend({ reports: z.string().max(400).optional(), top: z.coerce.number().int().min(1).max(100).default(15) }).safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: q.error.issues[0].message });
  let f: z.infer<typeof analysisFilters>;
  try { f = await analysisWhere(req, q.data); } catch (e: any) { return void res.status(e.status ?? 500).json({ error: e.message }); }
  const r = await reportFor(req, f);
  const want = new Set((q.data.reports ?? '').split(',').map((x) => x.trim()).filter(Boolean));
  const slim = (x: any) => ({ name: x.name, jobs: x.jobs, continued: x.continued, written: x.written, sent: x.sent, viewed: x.viewed, chat_opened: x.chat, interview: x.interview, hired: x.hired, lost: x.lost, connects: x.connects });
  res.json({ jobs: r.jobs, capped: r.capped, totals: slim(r.totals), timing: r.timing, available_reports: r.dims.map((d) => d.key),
    how_to_read: 'Each group is counted from screened to hired. Rates are of sent proposals: view rate = viewed / sent, chat rate = chat_opened / sent, hire rate = hired / sent. A job with several tags, projects, rules or signals counts under each. Groups with few sent proposals swing a lot: say the sample size.',
    reports: r.dims.filter((d) => !want.size || want.has(d.key)).map((d) => ({ key: d.key, name: d.label, what: d.help, groups: d.rows.slice(0, q.data.top).map(slim), groups_left_out: Math.max(0, d.rows.length - q.data.top) })) });
});

// The gate's fails and flags for one job, with each rule and the value behind it: the Result column's detail.
api.get('/screenings/:id/flags', requireRole(), async (req, res) => {
  const id = Number(req.params.id);
  const s = (await query<any>('SELECT user_id, verdict, report_json FROM screenings WHERE id=?', [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  const rep = s.report_json ? normalizeReport(JSON.parse(s.report_json)) : null;
  const j: any = rep?.jobs?.[0] ?? null;
  res.json({ verdict: s.verdict, fails: j?.fails ?? [], flags: j?.flags ?? [], override_note: j?.override_note || null });
});

// Read (or read again) the job post into fields, e.g. for jobs pasted before this existed.
api.post('/screenings/:id/posting', requireRole(), async (req, res) => {
  const id = Number(req.params.id);
  const s = (await query<any>('SELECT user_id, posting_status FROM screenings WHERE id=?', [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  if (s.posting_status === 'queued' || s.posting_status === 'running') return void res.json({ ok: true, already: true });
  await exec(`UPDATE screenings SET posting_status='queued', posting_error=NULL WHERE id=?`, [id]);
  await audit(req.user!.id, 'posting_extract', `screening=${id}`);
  res.json({ ok: true });
});

// One click from the Jobs list: what happened on Upwork, and when (now unless the person changes it). Every change is kept.
const postStatus = async (req: any, res: any) => {
  const cfg = await getSettings(); const outcomes = cfg['tracking.outcomes'];
  const b = z.object({ status: z.string().trim().min(1).max(60), at: z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, 'Pick a date and time'),
    reason: z.string().trim().max(120).nullish(), note: z.string().trim().max(2000).nullish() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const st = b.data.status === 'Replied' ? 'Chat opened' : b.data.status, at = b.data.at.replace('T', ' ').slice(0, 16) + ':00';
  const lost = cfg['tracking.loss_outcomes'].includes(st);
  if (lost && !b.data.reason) return void res.status(400).json({ error: 'Say why the client did not go ahead' });
  if (lost && !cfg['tracking.loss_reasons'].includes(b.data.reason!)) return void res.status(400).json({ error: 'Pick one of the listed reasons' });
  if (Number.isNaN(Date.parse(at.replace(' ', 'T')))) return void res.status(400).json({ error: 'Not a real date' });
  const id = Number(req.params.id);
  const s = (await query<any>('SELECT user_id, status FROM screenings WHERE id=?', [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  if (s.status !== 'done') return void res.status(409).json({ error: 'Wait until the screening is finished' });
  const sets: Record<string, string> = {
    Sent: `proceeded='yes', proposal_sent_date=DATE(?), proposal_sent_at=?`,
    Viewed: `client_viewed='yes', client_viewed_at=?`, 'Chat opened': `client_replied='yes', client_replied_at=?`, Interview: `interviewed='yes', interviewed_at=?`,
  };
  if (!sets[st] && !outcomes.includes(st)) return void res.status(400).json({ error: 'Unknown status' });
  // the Upwork statuses follow the proposal: it must be finished before it is sent, and sent before anything else
  const ph = (await query<any>(`SELECT (${stageSql}) AS stage FROM screenings s LEFT JOIN proposals p ON p.screening_id=s.id WHERE s.id=?`, [id]))[0]?.stage;
  if (st === 'Sent' && !['ready', 'submitted', 'closed'].includes(ph)) return void res.status(409).json({ error: 'Finish the proposal before marking it as sent' });
  if (st !== 'Sent' && !['submitted', 'closed'].includes(ph)) return void res.status(409).json({ error: 'Mark the proposal as sent first' });
  const before = await trackSnapshot(id);
  if (sets[st]) await exec(`UPDATE screenings SET ${sets[st]}, tracking_updated_at=NOW() WHERE id=?`, [...(st === 'Sent' ? [at, at] : [at]), id]);
  else await exec('UPDATE screenings SET outcome=?, outcome_at=?, outcome_reason=?, outcome_note=?, tracking_updated_at=NOW() WHERE id=?', [st, at, lost ? b.data.reason : null, b.data.note || null, id]);
  await recordChanges(id, before, await trackSnapshot(id), 'status', req.user!.id);
  await exec('INSERT INTO status_events (screening_id, status, happened_at, user_id, reason, note) VALUES (?,?,?,?,?,?)', [id, st, at, req.user!.id, lost ? b.data.reason : null, b.data.note || null]);
  await audit(req.user!.id, 'status_update', `screening=${id} status=${st} at=${at}`);
  res.json({ ok: true });
};
api.post('/screenings/:id/status', requireRole(), postStatus);
api.post('/plugin/jobs/:id/status', requireRole(), postStatus); // the same rules for the Claude plugin
const getStatus = async (req: any, res: any) => {
  const id = Number(req.params.id);
  const s = (await query<any>(`SELECT s.user_id, ${statusSql} AS current_status, ${stageSql} AS stage FROM screenings s LEFT JOIN proposals p ON p.screening_id=s.id WHERE s.id=?`, [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  const events = await query('SELECT e.status, e.happened_at, e.created_at, e.reason, e.note, u.name AS user_name FROM status_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.screening_id=? ORDER BY e.happened_at DESC, e.id DESC', [id]);
  const cfg = await getSettings();
  res.json({ current: s.current_status, stage: s.stage, events, choices: s.stage === 'ready' ? ['Sent'] : ['Sent', 'Viewed', 'Chat opened', 'Interview', ...cfg['tracking.outcomes']], loss_outcomes: cfg['tracking.loss_outcomes'], loss_reasons: cfg['tracking.loss_reasons'] });
};
api.get('/screenings/:id/status', requireRole(), getStatus);
api.get('/plugin/jobs/:id/status', requireRole(), getStatus); // the same rules for the Claude plugin

// ---------- step 2: continue, tag the job, match projects ----------
const ownedDone = async (req: any, res: any) => {
  const id = Number(req.params.id);
  const s = (await query<any>('SELECT id, user_id, status, verdict, continued_at, tagging_status, selection_confirmed_at, proposal_profile_id FROM screenings WHERE id=?', [id]))[0];
  if (!s || s.user_id !== req.user.id) { res.status(404).json({ error: 'Not found' }); return null; }
  if (s.status !== 'done') { res.status(409).json({ error: 'Wait until the screening is finished' }); return null; }
  return s;
};

// PASS: continue straight to project matching. (FLAG and FAIL continue through /override, which needs a reason.)
api.post('/screenings/:id/continue', requireRole(), async (req, res) => {
  const s = await ownedDone(req, res); if (!s) return;
  if (s.verdict !== 'PASS') return void res.status(409).json({ error: 'A ' + s.verdict + ' job needs a reason to continue' });
  const r = await exec(
    `UPDATE screenings SET continued_at=NOW(), proceeded='yes', tagging_status=COALESCE(tagging_status, 'queued') WHERE id=? AND continued_at IS NULL`, [s.id]);
  if (r.affectedRows) await audit(req.user!.id, 'continue', `screening=${s.id}`);
  res.json({ ok: true, already: !r.affectedRows });
});

// Start (or restart after an error) the tagging and matching. Also covers records continued before this step existed.
api.post('/screenings/:id/matching/start', requireRole(), async (req, res) => {
  const s = await ownedDone(req, res); if (!s) return;
  const r = await exec(
    `UPDATE screenings SET tagging_status='queued', tagging_error_code=NULL, tagging_error_message=NULL
     WHERE id=? AND continued_at IS NOT NULL AND (tagging_status IS NULL OR tagging_status='error')`, [s.id]);
  if (!r.affectedRows) return void res.status(409).json({ error: s.continued_at ? 'Matching is already running or finished' : 'Continue with this job first' });
  await audit(req.user!.id, 'matching_start', `screening=${s.id}`);
  res.json({ ok: true });
});

// Small and cheap, so the page can poll it without rebuilding itself.
api.get('/screenings/:id/matching', requireRole(), async (req, res) => {
  const id = Number(req.params.id);
  const s = (await query<any>('SELECT user_id FROM screenings WHERE id=?', [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  res.json({ matching: await matchingFor(id) });
});

// Confirm the projects (how many is an admin setting) from those shown.
api.put('/screenings/:id/selection', requireRole(), async (req, res) => {
  const b = z.object({ project_ids: z.array(z.number().int().positive()).min(1, 'Select at least one project').max(10) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const s = await ownedDone(req, res); if (!s) return;
  if (s.tagging_status !== 'done') return void res.status(409).json({ error: 'Project matching is not finished yet' });
  const matches = await query<any>('SELECT project_id, recommended FROM job_matches WHERE screening_id=?', [s.id]);
  const cfg = await getSettings();
  const bad = validSelection(b.data.project_ids, matches, cfg['selection.min'], cfg['selection.max']);
  if (bad) return void res.status(400).json({ error: bad });
  const rec = new Set(matches.filter((m) => m.recommended).map((m) => m.project_id));
  const sameAsRecommended = b.data.project_ids.every((i) => rec.has(i));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE job_matches SET selected = (project_id IN (?)) WHERE screening_id=?', [b.data.project_ids, s.id]);
    await conn.query('UPDATE screenings SET selection_confirmed_at=NOW(), selection_confirmed_by=? WHERE id=?', [req.user!.id, s.id]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  await audit(req.user!.id, 'selection_confirm', `screening=${s.id} projects=${b.data.project_ids.join(',')} recommended=${sameAsRecommended ? 'yes' : 'changed'}`);
  res.json({ ok: true });
});

// Step 3: after the projects are confirmed, pick the one Upwork profile the proposal will be sent from.
api.put('/screenings/:id/proposal-profile', requireRole(), async (req, res) => {
  const b = z.object({ profile_id: z.number().int().positive('Choose a profile') }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const s = await ownedDone(req, res); if (!s) return;
  if (!s.selection_confirmed_at) return void res.status(409).json({ error: 'Confirm the projects first' });
  const prof = (await query<any>('SELECT id, active FROM upwork_profiles WHERE id=?', [b.data.profile_id]))[0];
  if (!prof) return void res.status(400).json({ error: 'That profile does not exist' });
  if (!prof.active) return void res.status(400).json({ error: 'That profile is disabled' });
  await exec('UPDATE screenings SET proposal_profile_id=?, upwork_profile_id=?, proposal_profile_confirmed_at=NOW(), proposal_profile_confirmed_by=? WHERE id=?', [prof.id, prof.id, req.user!.id, s.id]);
  // nothing is written yet: the person chooses the proposal type next (Proposal tab), and that starts the writing
  const existing = (await query<any>('SELECT id, profile_id, status FROM proposals WHERE screening_id=?', [s.id]))[0];
  const started = false;
  await audit(req.user!.id, 'proposal_profile', `screening=${s.id} profile=${prof.id}`);
  // a profile changed after the proposal was written: the sign-off is out of date, the person decides whether to write again
  res.json({ ok: true, started, needs_rewrite: !!existing && existing.profile_id !== null && existing.profile_id !== prof.id });
});

// Continue anyway on FAIL or FLAG: a reason is required and kept.
api.post('/screenings/:id/override', requireRole(), async (req, res) => {
  const minReason = (await getSettings())['override.min_reason'];
  const b = z.object({ reason: z.string().trim().min(minReason, `Give a reason of at least ${minReason} characters`).max(2000) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const id = Number(req.params.id);
  const rows = await query<any>('SELECT user_id, status, verdict FROM screenings WHERE id=?', [id]);
  const s = rows[0];
  if (!s || s.user_id !== req.user!.id) return void res.status(404).json({ error: 'Not found' });
  if (s.status !== 'done' || (s.verdict !== 'FAIL' && s.verdict !== 'FLAG')) {
    return void res.status(409).json({ error: 'Only a finished FAIL or FLAG screening needs an override' });
  }
  try {
    await exec('INSERT INTO overrides (screening_id, user_id, verdict_at_time, reason) VALUES (?,?,?,?)', [id, req.user!.id, s.verdict, b.data.reason]);
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') return void res.status(409).json({ error: 'Already continued with a reason' });
    throw e;
  }
  await exec(`UPDATE screenings SET proceeded='yes', continued_at=COALESCE(continued_at, NOW()), tagging_status=COALESCE(tagging_status, 'queued') WHERE id=?`, [id]);
  await audit(req.user!.id, 'override', `screening=${id} verdict=${s.verdict}`);
  res.status(201).json({ ok: true });
});

// ---------- admin: users ----------
const admin = requireRole('admin');
api.get('/admin/users', admin, async (_req, res) => {
  res.json({ users: await query('SELECT id, name, email, role, active, created_at FROM users ORDER BY id') });
});
api.post('/admin/users', admin, async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(1).max(120), email: z.string().email().max(190),
    password: z.string().min(10, 'Password must be at least 10 characters').max(200),
    role: z.enum(['admin', 'manager', 'employee']),
  }).safeParse(req.body);
  if (!b.success) return void res.status(400).json(wrap(b.error));
  try {
    const r = await exec('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)',
      [b.data.name, b.data.email.toLowerCase(), await hashPassword(b.data.password), b.data.role]);
    await audit(req.user!.id, 'user_create', `id=${r.insertId} role=${b.data.role}`);
    res.status(201).json({ id: r.insertId });
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') return void res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});
api.patch('/admin/users/:id', admin, async (req, res) => {
  const id = Number(req.params.id);
  const b = z.object({
    role: z.enum(['admin', 'manager', 'employee']).optional(), active: z.boolean().optional(),
    password: z.string().min(10).max(200).optional(),
  }).safeParse(req.body);
  if (!b.success) return void res.status(400).json(wrap(b.error));
  if (id === req.user!.id && (b.data.active === false || (b.data.role && b.data.role !== 'admin'))) {
    return void res.status(400).json({ error: 'You cannot demote or disable your own account' });
  }
  const sets: string[] = []; const p: any[] = [];
  if (b.data.role) { sets.push('role=?'); p.push(b.data.role); }
  if (b.data.active !== undefined) { sets.push('active=?'); p.push(b.data.active ? 1 : 0); }
  if (b.data.password) { sets.push('password_hash=?'); p.push(await hashPassword(b.data.password)); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  const r = await exec(`UPDATE users SET ${sets.join(',')} WHERE id=?`, [...p, id]);
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  if (b.data.active === false || b.data.password) await exec('DELETE FROM sessions WHERE user_id=?', [id]);
  await audit(req.user!.id, 'user_update', `id=${id} fields=${Object.keys(b.data).join(',')}`);
  res.json({ ok: true });
});

// ---------- admin: skill ----------
api.get('/admin/skill', admin, async (_req, res) => {
  res.json({ versions: await query('SELECT id, version, change_note, is_active, created_at, created_by FROM skill_versions ORDER BY version DESC') });
});
api.get('/admin/skill/:id', admin, async (req, res) => {
  const r = await query('SELECT id, version, content, change_note, is_active, created_at FROM skill_versions WHERE id=?', [Number(req.params.id)]);
  if (!r[0]) return void res.status(404).json({ error: 'Not found' });
  res.json({ skill: r[0] });
});

const skillBody = z.object({
  content: z.string().min(200, 'The gate instructions look too short').max(100_000),
  change_note: z.string().trim().max(250).optional(),
});

// Saving never overwrites: it creates a new version. Activate it separately, after testing.
api.post('/admin/skill', admin, async (req, res) => {
  const b = skillBody.safeParse(req.body);
  if (!b.success) return void res.status(400).json(wrap(b.error));
  const next = (await query<any>('SELECT COALESCE(MAX(version),0)+1 AS v FROM skill_versions'))[0].v;
  const r = await exec('INSERT INTO skill_versions (version, content, change_note, created_by) VALUES (?,?,?,?)',
    [next, b.data.content, b.data.change_note ?? null, req.user!.id]);
  await audit(req.user!.id, 'skill_save', `version=${next}`);
  res.status(201).json({ id: r.insertId, version: Number(next) });
});
api.post('/admin/skill/:id/activate', admin, async (req, res) => {
  const id = Number(req.params.id);
  if (!(await query('SELECT id FROM skill_versions WHERE id=?', [id])).length) return void res.status(404).json({ error: 'Not found' });
  await exec('UPDATE skill_versions SET is_active = (id=?)', [id]);
  await audit(req.user!.id, 'skill_activate', `id=${id}`);
  res.json({ ok: true });
});
// The full text the model gets for a job: these instructions, the active rules and the fixed output format.
api.post('/admin/skill/preview', admin, async (req, res) => {
  const b = skillBody.pick({ content: true }).safeParse(req.body);
  if (!b.success) return void res.status(400).json(wrap(b.error));
  const ctx = await loadContext();
  res.json({ prompt: gatePrompt(b.data.content, ctx.rules, ctx.projects), rules: ctx.rules.length, projects: ctx.projects.length });
});
// Dry run of draft text against sample job text. Nothing is saved.
api.post('/admin/skill/test', admin, async (req, res) => {
  const b = skillBody.pick({ content: true }).extend({ sample: z.string().min(120).max(60_000) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json(wrap(b.error));
  try {
    res.json({ report: normalizeReport(await withCallContext({ kind: 'gate_test' }, async () => screenJobText(b.data.sample, b.data.content, await loadContext()))) });
  } catch {
    res.status(502).json({ error: 'The test run failed. Check the AI service settings.' });
  }
});

// ---------- logs: who did what (audit), and every model call (llm_calls) ----------
const logDates = (col: string, f: { from?: string; to?: string }, where: string[], p: any[]) => {
  if (f.from) { where.push(`${col} >= ?`); p.push(f.from + ' 00:00:00'); }
  if (f.to) { where.push(`${col} < DATE_ADD(?, INTERVAL 1 DAY)`); p.push(f.to); }
};
api.get('/admin/audit', admin, async (req, res) => {
  const f = z.object({ page: z.coerce.number().int().min(1).default(1), action: z.string().max(40).optional(), user: z.coerce.number().int().positive().optional(),
    from: day.optional(), to: day.optional(), q: z.string().trim().max(100).optional() }).parse(req.query);
  const where: string[] = []; const p: any[] = [];
  if (f.action) { where.push('a.action=?'); p.push(f.action); }
  if (f.user) { where.push('a.user_id=?'); p.push(f.user); }
  if (f.q) { where.push('a.detail LIKE ?'); p.push(`%${likeEsc(f.q)}%`); }
  logDates('a.created_at', f, where, p);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = Number((await query<any>(`SELECT COUNT(*) AS n FROM audit_log a ${w}`, p))[0].n);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const log = await query(
    `SELECT a.id, a.action, a.detail, a.created_at, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [...p, PAGE_SIZE, (page - 1) * PAGE_SIZE]);
  const actions = (await query<any>('SELECT DISTINCT action FROM audit_log ORDER BY action')).map((r) => r.action);
  res.json({ log, total, page, pages, page_size: PAGE_SIZE, actions });
});
api.get('/admin/calls', admin, async (req, res) => {
  const f = z.object({ page: z.coerce.number().int().min(1).default(1), kind: z.string().max(30).optional(), ok: z.enum(['0', '1']).optional(),
    model: z.string().max(80).optional(), from: day.optional(), to: day.optional(), job: z.coerce.number().int().positive().optional() }).parse(req.query);
  const where: string[] = []; const p: any[] = [];
  if (f.kind) { where.push('c.kind=?'); p.push(f.kind); }
  if (f.ok) { where.push('c.ok=?'); p.push(Number(f.ok)); }
  if (f.model) { where.push('c.model=?'); p.push(f.model); }
  if (f.job) { where.push('c.screening_id=?'); p.push(f.job); }
  logDates('c.created_at', f, where, p);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = Number((await query<any>(`SELECT COUNT(*) AS n FROM llm_calls c ${w}`, p))[0].n);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const calls = await query(`SELECT c.*, s.title FROM llm_calls c LEFT JOIN screenings s ON s.id=c.screening_id ${w} ORDER BY c.id DESC LIMIT ? OFFSET ?`, [...p, PAGE_SIZE, (page - 1) * PAGE_SIZE]);
  const summary = await query<any>(`SELECT c.kind, c.step, c.model, COUNT(*) AS calls, SUM(c.ok=0) AS errors, ROUND(AVG(c.ms)) AS avg_ms, MAX(c.ms) AS max_ms
    FROM llm_calls c ${w} GROUP BY c.kind, c.step, c.model ORDER BY calls DESC`, p);
  const facets = { kinds: (await query<any>('SELECT DISTINCT kind FROM llm_calls ORDER BY kind')).map((r) => r.kind), models: (await query<any>('SELECT DISTINCT model FROM llm_calls WHERE model IS NOT NULL ORDER BY model')).map((r) => r.model) };
  res.json({ calls, total, page, pages, page_size: PAGE_SIZE, summary: summary.map((r) => ({ ...r, calls: Number(r.calls), errors: Number(r.errors), avg_ms: Number(r.avg_ms) })), ...facets });
});

// One job's history in time order: every step, who did it, and every model call it made.
api.get('/screenings/:id/timeline', requireRole(), async (req, res) => {
  const id = Number(req.params.id);
  const s = (await query<any>(`SELECT s.*, u.name AS user_name, cu.name AS sel_by, pu.name AS prof_by, pr.name AS profile_name FROM screenings s JOIN users u ON u.id=s.user_id
    LEFT JOIN users cu ON cu.id=s.selection_confirmed_by LEFT JOIN users pu ON pu.id=s.proposal_profile_confirmed_by LEFT JOIN upwork_profiles pr ON pr.id=s.proposal_profile_id WHERE s.id=?`, [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  const o = (await query<any>('SELECT o.created_at, o.verdict_at_time, u.name FROM overrides o JOIN users u ON u.id=o.user_id WHERE o.screening_id=?', [id]))[0];
  const p = (await query<any>('SELECT p.*, fu.name AS fin_by FROM proposals p LEFT JOIN users fu ON fu.id=p.finalized_by WHERE p.screening_id=?', [id]))[0];
  const versions = p ? await query<any>('SELECT v.version_no, v.source, v.created_at, u.name FROM proposal_versions v LEFT JOIN users u ON u.id=v.created_by WHERE v.proposal_id=? ORDER BY v.version_no', [p.id]) : [];
  const calls = await query<any>('SELECT kind, step, model, ms, ok, error, created_at FROM llm_calls WHERE screening_id=? ORDER BY id', [id]);
  const statuses = await query<any>('SELECT e.status, e.happened_at, e.reason, e.note, u.name FROM status_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.screening_id=? ORDER BY e.id', [id]);
  const changes = await query<any>('SELECT c.field, c.old_value, c.new_value, c.source, c.created_at, u.name FROM field_changes c LEFT JOIN users u ON u.id=c.user_id WHERE c.screening_id=? ORDER BY c.id', [id]);
  const ev: { at: any; what: string; who?: string | null; detail?: string | null; kind: string }[] = [];
  const add = (at: any, what: string, kind: string, who?: string | null, detail?: string | null) => { if (at) ev.push({ at, what, who: who ?? null, detail: detail ?? null, kind }); };
  add(s.created_at, 'Job pasted', 'step', s.user_name);
  add(s.finished_at, s.status === 'error' ? 'Screening failed' : `Screened: ${s.verdict ?? ''}`, s.status === 'error' ? 'error' : 'step', null, s.rule_codes);
  add(o?.created_at, `Continued past the ${o?.verdict_at_time ?? ''}`, 'step', o?.name);
  if (!o) add(s.continued_at, 'Continued', 'step', s.user_name);
  add(s.tagged_at, 'Projects matched', 'step');
  add(s.selection_confirmed_at, 'Projects confirmed', 'step', s.sel_by);
  add(s.proposal_profile_confirmed_at, `Profile chosen: ${s.profile_name ?? ''}`, 'step', s.prof_by);
  for (const v of versions) add(v.created_at, `Proposal version ${v.version_no} (${v.source === 'ai' ? 'written by AI' : v.source})`, 'step', v.name);
  add(p?.finalized_at, 'Proposal finished', 'step', p?.fin_by);
  add(s.tracking_updated_at, `Tracking saved${s.outcome ? ': ' + s.outcome : ''}`, 'step');
  for (const e of statuses) add(e.happened_at, `Status: ${e.status}`, 'step', e.name, [e.reason, e.note].filter(Boolean).join(' · ') || null);
  for (const c of changes) add(c.created_at, `Changed ${c.field.replace(/_/g, ' ')}`, 'change', c.name, `${c.old_value ?? 'empty'} → ${c.new_value ?? 'empty'} (${c.source})`);
  for (const c of calls) add(c.created_at, `AI call: ${c.kind}${c.step ? ' / ' + c.step : ''}`, c.ok ? 'call' : 'error', null, `${c.model ?? ''} · ${(c.ms / 1000).toFixed(1)} s${c.ok ? '' : ' · ' + (c.error ?? 'failed')}`);
  ev.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  res.json({ events: ev });
});

// ---------- settings (read by every screen, changed by admins) ----------
api.get('/settings', requireRole(), async (_req, res) => {
  res.json({ settings: await getSettings(), meta: Object.fromEntries(Object.entries(SETTINGS).map(([k, d]) => [k, { label: d.label, help: d.help }])) });
});
// ---- which AI does the work (admin) ----
const aiBody = z.object({ provider: z.enum(PROVIDER_IDS), model: SETTINGS['ai.model.glm'].schema });
const aiState = async () => {
  const cur = await currentChoice(); const s = await getSettings();
  return { mock: !realCallsEnabled(), current: cur,
    providers: PROVIDER_IDS.map((id) => ({ id, label: PROVIDERS[id].label, note: PROVIDERS[id].note, key_env: PROVIDERS[id].keyEnv, key_present: keyPresent(id), models: PROVIDERS[id].models, model: s[`ai.model.${id}` as const] })) };
};
api.get('/admin/ai', admin, async (_req, res) => res.json(await aiState()));
api.put('/admin/ai', admin, async (req, res) => {
  const b = aiBody.safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Not a valid choice: ' + b.error.issues[0].message });
  const p = b.data.provider as ProviderId;
  if (!keyPresent(p)) return void res.status(409).json({ error: `The key for ${PROVIDERS[p].label} is not on the server. Add ${PROVIDERS[p].keyEnv} to the .env file, restart, then choose it.` });
  await setSetting(`ai.model.${p}` as SettingKey, b.data.model, req.user!.id);
  await setSetting('ai.provider', p, req.user!.id);
  await audit(req.user!.id, 'setting_change', `ai.provider=${p} model=${b.data.model}`);
  res.json(await aiState());
});
api.post('/admin/ai/test', admin, async (req, res) => {
  const b = aiBody.safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Not a valid choice' });
  if (!realCallsEnabled()) return void res.json({ ok: false, message: 'The server is in mock mode (LLM_PROVIDER=mock in .env), so no real AI is called.' });
  if (!keyPresent(b.data.provider)) return void res.json({ ok: false, message: `The key is not set. Add ${PROVIDERS[b.data.provider].keyEnv} to the .env file and restart.` });
  try { const r = await testCall(b.data); res.json({ ok: true, ms: r.ms, message: `Works. Answered in ${(r.ms / 1000).toFixed(1)} s.` }); }
  catch (e) {
    const st = (e as any)?.status;
    res.json({ ok: false, message: st === 401 || st === 403 ? 'The provider rejected the key.' : st === 404 ? 'The provider does not know that model name.' : st === 429 ? 'The provider says busy or out of quota.' : /^timeout/.test((e as Error).message) ? 'No answer in 60 seconds.' : 'The call failed. Check the key and the model name.' });
  }
});
api.put('/admin/settings/:key', admin, async (req, res) => {
  const key = req.params.key as SettingKey;
  if (!(key in SETTINGS)) return void res.status(404).json({ error: 'Unknown setting' });
  if (key.startsWith('ai.')) return void res.status(400).json({ error: 'Change the AI on the AI card: it checks the key first' });
  try {
    // settings that depend on each other (how many are shown, recommended, and may be picked) must still agree after this change
    const cur = await getSettings(); const value = SETTINGS[key].schema.parse(req.body?.value);
    const conflict = settingsConflict({ ...cur, [key]: value } as any);
    if (conflict) return void res.status(400).json({ error: conflict });
    const v = await setSetting(key, value, req.user!.id);
    await audit(req.user!.id, 'setting_change', `${key}=${JSON.stringify(v).slice(0, 300)}`);
    res.json({ ok: true, value: v });
  } catch (e) {
    if (e instanceof z.ZodError) return void res.status(400).json({ error: 'Not a valid value: ' + e.issues[0].message });
    throw e;
  }
});

// ---------- rules: codes are never renumbered or reused, only reworded or retired ----------
// Every active rule, with its "how to apply" details, is added to the gate instructions for every job (see gatePrompt).
const ruleDetails = z.string().trim().max(1000).optional();
api.get('/admin/rules', admin, async (_req, res) => {
  const rules = await query<any>("SELECT code, type, rule, details, active, created_at, updated_at FROM rules ORDER BY type='flag', CAST(SUBSTRING(code, 2) AS UNSIGNED)");
  // how many jobs each code fired on, so a retire decision can be made with the history in view
  const fired = new Map<string, number>();
  for (const r of await query<any>('SELECT rule_codes FROM screenings WHERE rule_codes IS NOT NULL')) {
    for (const c of String(r.rule_codes).split(/\s*,\s*/).filter(Boolean)) fired.set(c, (fired.get(c) ?? 0) + 1);
  }
  res.json({ rules: rules.map((r) => ({ ...r, active: !!r.active, fired: fired.get(r.code) ?? 0 })) });
});
api.post('/admin/rules', admin, async (req, res) => {
  const b = z.object({ type: z.enum(['fail', 'flag']), rule: z.string().trim().min(5, 'Describe the rule').max(300), details: ruleDetails }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const prefix = b.data.type === 'fail' ? 'F' : 'G';
  // the next number after every code ever used, retired ones included, so an old code never means something new
  const last = (await query<any>('SELECT MAX(CAST(SUBSTRING(code, 2) AS UNSIGNED)) AS n FROM rules WHERE code LIKE ?', [prefix + '%']))[0].n;
  const code = prefix + (Number(last || 0) + 1);
  await exec('INSERT INTO rules (code, type, rule, details, active) VALUES (?,?,?,?,1)', [code, b.data.type, b.data.rule, b.data.details || null]);
  await audit(req.user!.id, 'rule_add', `${code} ${b.data.rule.slice(0, 200)}`);
  res.status(201).json({ code });
});
api.patch('/admin/rules/:code', admin, async (req, res) => {
  const b = z.object({ rule: z.string().trim().min(5).max(300).optional(), details: ruleDetails, active: z.boolean().optional() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const r = (await query<any>('SELECT code FROM rules WHERE code=?', [req.params.code]))[0];
  if (!r) return void res.status(404).json({ error: 'Not found' });
  if (b.data.rule !== undefined) await exec('UPDATE rules SET rule=? WHERE code=?', [b.data.rule, r.code]);
  if (b.data.details !== undefined) await exec('UPDATE rules SET details=? WHERE code=?', [b.data.details || null, r.code]);
  if (b.data.active !== undefined) await exec('UPDATE rules SET active=? WHERE code=?', [b.data.active ? 1 : 0, r.code]);
  await audit(req.user!.id, 'rule_change', `${r.code}${b.data.rule !== undefined ? ' reworded' : ''}${b.data.details !== undefined ? ' details' : ''}${b.data.active !== undefined ? (b.data.active ? ' restored' : ' retired') : ''}`);
  res.json({ ok: true });
});
