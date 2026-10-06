import { Router } from 'express';
import { z } from 'zod';
import { audit, exec, pool, query } from './db';
import { attachUser, hashPassword, login, loginThrottled, logout, requireRole, setSessionCookie } from './auth';
import { detectInput, InputError, jobIdFromUrl } from './screening/jobsource';
import { loadContext } from './screening/context';
import { normalizeReport } from './screening/contract';
import { screenJobText } from './screening/service';
import { library } from './routes_library';
import { proposals, proposalFor } from './routes_proposals';
import { validSelection } from './screening/matching';
import { EXPORT_LIMIT, exportRows, toCsv, toXlsx } from './export';
import { getSettings, setSetting, SETTINGS, type SettingKey } from './settings';
import { withCallContext } from './llm/context';

export const api = Router();
api.use(attachUser);
api.use(library);
api.use(proposals);

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
  if (!b.success) return void res.status(400).json({ error: 'input is required' });
  let parsed;
  try { parsed = detectInput(b.data.input); }
  catch (e) { if (e instanceof InputError) return void res.status(400).json({ error: e.message, code: e.code }); throw e; }

  let sourceUrl: string | null = parsed.type === 'link' ? parsed.url : null;
  if (parsed.type === 'text' && b.data.job_url) {
    if (!/^https?:\/\/(?:[a-z0-9-]+\.)?upwork\.com\/\S+$/i.test(b.data.job_url)) return void res.status(400).json({ error: 'The job link must be an Upwork link' });
    sourceUrl = b.data.job_url;
  }
  const r = await exec(
    `INSERT INTO screenings (user_id, input_type, source_url, upwork_job_id, raw_input, job_text) VALUES (?,?,?,?,?,?)`,
    [req.user!.id, parsed.type, sourceUrl, parsed.type === 'link' ? parsed.jobId : (sourceUrl ? jobIdFromUrl(sourceUrl) : null),
     b.data.input.trim(), parsed.type === 'text' ? parsed.text : null],
  );
  res.status(202).json({ id: r.insertId, status: 'queued', input_type: parsed.type });
});

/** Where a job stands, as one word. The order is the journey; "skipped" and "failed" sit outside it. */
export const STAGES = ['screening', 'decide', 'projects', 'profile', 'proposal', 'tracking', 'complete', 'skipped', 'failed'] as const;
export const NEEDS_ACTION = ['decide', 'projects', 'profile', 'proposal', 'tracking'];
const stageSql = `CASE
    WHEN s.status IN ('queued','running') THEN 'screening'
    WHEN s.status = 'error' THEN 'failed'
    WHEN s.proceeded = 'no' THEN 'skipped'
    WHEN s.continued_at IS NULL THEN 'decide'
    WHEN s.selection_confirmed_at IS NULL THEN 'projects'
    WHEN s.proposal_profile_confirmed_at IS NULL THEN 'profile'
    WHEN p.finalized_at IS NULL THEN 'proposal'
    WHEN s.tracking_updated_at IS NULL THEN 'tracking'
    ELSE 'complete' END`;
const listFrom = `FROM screenings s JOIN users u ON u.id=s.user_id LEFT JOIN overrides o ON o.screening_id=s.id
  LEFT JOIN upwork_profiles pr ON pr.id=s.upwork_profile_id LEFT JOIN proposals p ON p.screening_id=s.id`;
const listSelect = `SELECT s.id, s.input_type, s.source_url, s.title, s.status, s.verdict, s.error_code, s.error_message, s.created_at,
  s.rule_codes, s.proceeded, s.outcome, s.tagging_status, s.selection_confirmed_at, s.continued_at IS NOT NULL AS continued,
  s.client_country, s.budget, s.job_type, s.hire_rate, s.connects_spent, s.boost_connects, s.client_viewed, s.client_replied, s.interviewed, s.proposal_sent_date,
  u.name AS user_name, pr.name AS profile_name, o.id IS NOT NULL AS overridden,
  p.status AS proposal_status, p.finalized_at AS proposal_finalized_at, p.template_name,
  TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at) AS secs_to_proposal, ${stageSql} AS stage
  ${listFrom}`;

const PAGE_SIZE = 20;
const likeEsc = (v: string) => v.replace(/[\\%_]/g, (c) => '\\' + c);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const listFilters = z.object({
  verdict: z.enum(['PASS', 'FLAG', 'FAIL']).optional(), mine: z.enum(['0', '1']).optional(), q: z.string().trim().max(100).optional(),
  from: day.optional(), to: day.optional(), rule: z.string().trim().regex(/^[A-Z]\d{1,3}$/).optional(),
  profile: z.coerce.number().int().positive().optional(), user: z.coerce.number().int().positive().optional(),
  outcome: z.string().trim().max(60).optional(), stage: z.enum([...STAGES, 'needs_action']).optional(),
});
export type ListFilters = z.infer<typeof listFilters>;

/** Shared by the list, the counters and the export: which jobs this person may see, and the filters. */
export function listWhere(req: any, f: ListFilters) {
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
  if (f.stage === 'needs_action') { where.push(`(${stageSql}) IN (?)`); p.push(NEEDS_ACTION); }
  else if (f.stage) { where.push(`(${stageSql})=?`); p.push(f.stage); }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', p };
}

/** Columns the list can be sorted by. Anything else falls back to newest first. */
const SORTS: Record<string, string> = {
  created: 's.id', title: 's.title', verdict: `FIELD(s.verdict,'PASS','FLAG','FAIL')`, country: 's.client_country',
  hire_rate: `CAST(REGEXP_SUBSTR(s.hire_rate, '[0-9]+') AS UNSIGNED)`, user: 'u.name', profile: 'pr.name', outcome: 's.outcome',
  stage: `FIELD(${stageSql}, ${STAGES.map((x) => `'${x}'`).join(',')})`, time: 'TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at)',
};
export const orderBy = (sort?: string, dir?: string) => {
  const col = SORTS[sort ?? ''] ?? SORTS.created;
  const d = dir === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY ${col} IS NULL, ${col} ${d}, s.id DESC`; // empty values last, whichever way
};

api.get('/screenings', requireRole(), async (req, res) => {
  const f = listFilters.extend({ page: z.coerce.number().int().min(1).default(1), sort: z.string().max(20).optional(), dir: z.enum(['asc', 'desc']).optional() }).parse(req.query);
  const w = listWhere(req, f);
  const total = Number((await query<any>(`SELECT COUNT(*) AS n ${listFrom} ${w.sql}`, w.p))[0].n);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const rows = await query(`${listSelect} ${w.sql} ${orderBy(f.sort, f.dir)} LIMIT ? OFFSET ?`, [...w.p, PAGE_SIZE, (page - 1) * PAGE_SIZE]);
  res.json({ screenings: rows, total, page, pages, page_size: PAGE_SIZE });
});

// Counts for the summary tiles: every filter applies except the verdict, so the tiles can switch between verdicts.
api.get('/screenings/stats', requireRole(), async (req, res) => {
  const f = listFilters.parse(req.query);
  const w = listWhere(req, { ...f, verdict: undefined });
  const r = (await query<any>(
    `SELECT COUNT(*) AS total, SUM(s.verdict='PASS') AS pass_n, SUM(s.verdict='FLAG') AS flag_n, SUM(s.verdict='FAIL') AS fail_n, SUM(o.id IS NOT NULL) AS overridden,
       SUM((${stageSql}) IN (?)) AS needs_action
     ${listFrom} ${w.sql}`, [NEEDS_ACTION, ...w.p]))[0];
  res.json({ total: Number(r.total), PASS: Number(r.pass_n || 0), FLAG: Number(r.flag_n || 0), FAIL: Number(r.fail_n || 0), overridden: Number(r.overridden || 0), needs_action: Number(r.needs_action || 0) });
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
      AVG(TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at)) AS avg_to_proposal, MIN(TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at)) AS min_to_proposal,
      MAX(TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at)) AS max_to_proposal,
      AVG(TIMESTAMPDIFF(SECOND, COALESCE(s.started_at, s.created_at), s.finished_at)) AS avg_screening,
      AVG(TIMESTAMPDIFF(SECOND, s.continued_at, s.tagged_at)) AS avg_matching,
      AVG(TIMESTAMPDIFF(SECOND, p.created_at, p.finished_at)) AS avg_writing
    ${listFrom} ${w.sql}`);
  const stages = await query<any>(`SELECT (${stageSql}) AS stage, COUNT(*) AS n ${listFrom} ${w.sql} GROUP BY 1`, w.p);
  const waiting = await query<any>(`SELECT s.id, s.title, u.name AS user_name, s.created_at, (${stageSql}) AS stage ${listFrom} ${w.sql ? w.sql + ' AND' : 'WHERE'} (${stageSql}) IN (?)
    ORDER BY s.created_at LIMIT 8`, [...w.p, NEEDS_ACTION]);
  const daily = await query<any>(`SELECT DATE(s.created_at) AS d, COUNT(*) AS screened, SUM(s.continued_at IS NOT NULL) AS continued, SUM(p.finished_at IS NOT NULL) AS proposals
    ${listFrom} ${w.sql} GROUP BY DATE(s.created_at) ORDER BY d DESC LIMIT 31`, w.p);
  const by = (col: string, name: string) => query<any>(`SELECT ${col} AS id, ${name} AS name, COUNT(*) AS screened, SUM(s.continued_at IS NOT NULL) AS continued,
      SUM(p.finished_at IS NOT NULL) AS proposals, SUM(s.proposal_sent_date IS NOT NULL) AS sent, SUM(s.outcome='Hired') AS hired,
      AVG(TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at)) AS avg_to_proposal
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

// Everything about every job the filters match, as CSV or Excel. Same filters and order as the Jobs list.
api.get('/screenings/export', requireRole(), async (req, res) => {
  const f = listFilters.extend({ format: z.enum(['csv', 'xlsx']).default('csv'), sort: z.string().max(20).optional(), dir: z.enum(['asc', 'desc']).optional() }).parse(req.query);
  const w = listWhere(req, f);
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
    stages: STAGES, needs_action: NEEDS_ACTION,
  });
});


/** Everything the page needs for step 2: tags with reasons, the 5 matches with scores, and the confirmed selection. */
async function matchingFor(id: number) {
  const s = (await query<any>(
    `SELECT s.verdict, s.status, s.continued_at, s.tagging_status, s.tagging_error_message, s.tagged_at, s.selection_confirmed_at, u.name AS confirmed_by
     FROM screenings s LEFT JOIN users u ON u.id=s.selection_confirmed_by WHERE s.id=?`, [id]))[0];
  if (!s) return null;
  const pp = (await query<any>(
    `SELECT s.proposal_profile_id AS id, pr.name, pr.tagline, pr.price, pr.gitlab_account, pr.profile_url, s.proposal_profile_confirmed_at AS confirmed_at, u.name AS confirmed_by
     FROM screenings s LEFT JOIN upwork_profiles pr ON pr.id=s.proposal_profile_id LEFT JOIN users u ON u.id=s.proposal_profile_confirmed_by WHERE s.id=?`, [id]))[0];
  const base = { continued: !!s.continued_at, continued_at: s.continued_at, status: s.tagging_status as string | null, error: s.tagging_error_message as string | null,
    tags: [] as any[], matches: [] as any[], confirmed_at: s.selection_confirmed_at as string | null, confirmed_by: s.confirmed_by as string | null,
    proposal_profile: pp && pp.id ? { id: pp.id, name: pp.name, tagline: pp.tagline, price: pp.price, gitlab_account: pp.gitlab_account, profile_url: pp.profile_url, confirmed_at: pp.confirmed_at, confirmed_by: pp.confirmed_by } : null,
    profiles: [] as any[] };
  if (s.tagging_status !== 'done') return base;
  base.tags = await query(
    `SELECT jt.tag_name AS name, jt.category_name AS category, jt.weight, jt.reason FROM job_tags jt LEFT JOIN tag_categories c ON c.name=jt.category_name
     WHERE jt.screening_id=? ORDER BY COALESCE(c.sort_order, 999), jt.weight DESC, jt.tag_name`, [id]);
  const rows = await query<any>('SELECT project_id, project_name, rank_no, score, max_score, compliance_gap, recommended, shared_tags, selected FROM job_matches WHERE screening_id=? ORDER BY rank_no', [id]);
  base.matches = rows.map((r) => ({
    project_id: r.project_id, project_name: r.project_name, rank: r.rank_no, score: r.score, max_score: r.max_score,
    percent: r.max_score ? Math.round((r.score / r.max_score) * 100) : 0, compliance_gap: r.compliance_gap,
    recommended: !!r.recommended, selected: !!r.selected, shared: JSON.parse(r.shared_tags),
  }));
  if (s.selection_confirmed_at) { // step 3 needs every profile to choose from
    base.profiles = await query('SELECT id, name, tagline, price, gitlab_account, profile_url, notes, active FROM upwork_profiles ORDER BY active DESC, name');
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
    screening: { ...s, raw_input: undefined, report_json: undefined, job_description: s.job_text, job_text: undefined, report: s.report_json ? normalizeReport(JSON.parse(s.report_json)) : null },
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
});
const TRACK_KEYS = ['proceeded', 'proposal_sent_date', 'outcome', 'notes', 'connects_spent', 'boost_connects', 'client_viewed', 'client_replied', 'interviewed'] as const;
api.patch('/screenings/:id/tracking', requireRole(), async (req, res) => {
  const b = trackBody.safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const id = Number(req.params.id);
  const s = (await query<any>('SELECT user_id, status FROM screenings WHERE id=?', [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  if (s.status !== 'done') return void res.status(409).json({ error: 'Wait until the screening is finished' });
  const sets: string[] = []; const p: any[] = [];
  for (const k of TRACK_KEYS) {
    if (b.data[k] !== undefined) { sets.push(`${k}=?`); p.push(b.data[k] === '' ? null : b.data[k]); }
  }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  await exec(`UPDATE screenings SET ${sets.join(',')}, tracking_updated_at=NOW() WHERE id=?`, [...p, id]);
  await audit(req.user!.id, 'tracking_update', `screening=${id} fields=${Object.keys(b.data).join(',')}`);
  res.json({ ok: true });
});

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
  // the first time a profile is chosen, the proposal starts by itself: signals, template, writing
  const existing = (await query<any>('SELECT id, profile_id, status FROM proposals WHERE screening_id=?', [s.id]))[0];
  let started = false;
  if (!existing) {
    await exec(`INSERT INTO proposals (screening_id, status, template_choice, created_by) VALUES (?, 'queued', 'auto', ?)`, [s.id, req.user!.id]);
    started = true;
  }
  await audit(req.user!.id, 'proposal_profile', `screening=${s.id} profile=${prof.id}${started ? ' proposal=started' : ''}`);
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
  content: z.string().min(200, 'The gate prompt looks too short').max(100_000),
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
  for (const c of calls) add(c.created_at, `AI call: ${c.kind}${c.step ? ' / ' + c.step : ''}`, c.ok ? 'call' : 'error', null, `${c.model ?? ''} · ${(c.ms / 1000).toFixed(1)} s${c.ok ? '' : ' · ' + (c.error ?? 'failed')}`);
  ev.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  res.json({ events: ev });
});

// ---------- settings (read by every screen, changed by admins) ----------
api.get('/settings', requireRole(), async (_req, res) => {
  res.json({ settings: await getSettings(), meta: Object.fromEntries(Object.entries(SETTINGS).map(([k, d]) => [k, { label: d.label, help: d.help }])) });
});
api.put('/admin/settings/:key', admin, async (req, res) => {
  const key = req.params.key as SettingKey;
  if (!(key in SETTINGS)) return void res.status(404).json({ error: 'Unknown setting' });
  try {
    // the pick range must stay valid: check against the other end before saving
    const cur = await getSettings(); const value = SETTINGS[key].schema.parse(req.body?.value);
    const lo = key === 'selection.min' ? value : cur['selection.min'], hi = key === 'selection.max' ? value : cur['selection.max'];
    if ((key === 'selection.min' || key === 'selection.max') && Number(lo) > Number(hi)) return void res.status(400).json({ error: 'The fewest projects to pick cannot be more than the most' });
    const v = await setSetting(key, value, req.user!.id);
    await audit(req.user!.id, 'setting_change', `${key}=${JSON.stringify(v).slice(0, 300)}`);
    res.json({ ok: true, value: v });
  } catch (e) {
    if (e instanceof z.ZodError) return void res.status(400).json({ error: 'Not a valid value: ' + e.issues[0].message });
    throw e;
  }
});

// ---------- rules: codes are never renumbered or reused, only reworded or retired ----------
api.get('/admin/rules', admin, async (_req, res) => {
  const rules = await query<any>("SELECT code, type, rule, active, created_at, updated_at FROM rules ORDER BY type='flag', CAST(SUBSTRING(code, 2) AS UNSIGNED)");
  // how many jobs each code fired on, so a retire decision can be made with the history in view
  const fired = new Map<string, number>();
  for (const r of await query<any>('SELECT rule_codes FROM screenings WHERE rule_codes IS NOT NULL')) {
    for (const c of String(r.rule_codes).split(/\s*,\s*/).filter(Boolean)) fired.set(c, (fired.get(c) ?? 0) + 1);
  }
  res.json({ rules: rules.map((r) => ({ ...r, active: !!r.active, fired: fired.get(r.code) ?? 0 })) });
});
api.post('/admin/rules', admin, async (req, res) => {
  const b = z.object({ type: z.enum(['fail', 'flag']), rule: z.string().trim().min(5, 'Describe the rule').max(300) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const prefix = b.data.type === 'fail' ? 'F' : 'G';
  // the next number after every code ever used, retired ones included, so an old code never means something new
  const last = (await query<any>('SELECT MAX(CAST(SUBSTRING(code, 2) AS UNSIGNED)) AS n FROM rules WHERE code LIKE ?', [prefix + '%']))[0].n;
  const code = prefix + (Number(last || 0) + 1);
  await exec('INSERT INTO rules (code, type, rule, active) VALUES (?,?,?,1)', [code, b.data.type, b.data.rule]);
  await audit(req.user!.id, 'rule_add', `${code} ${b.data.rule.slice(0, 200)}`);
  res.status(201).json({ code });
});
api.patch('/admin/rules/:code', admin, async (req, res) => {
  const b = z.object({ rule: z.string().trim().min(5).max(300).optional(), active: z.boolean().optional() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const r = (await query<any>('SELECT code FROM rules WHERE code=?', [req.params.code]))[0];
  if (!r) return void res.status(404).json({ error: 'Not found' });
  if (b.data.rule !== undefined) await exec('UPDATE rules SET rule=? WHERE code=?', [b.data.rule, r.code]);
  if (b.data.active !== undefined) await exec('UPDATE rules SET active=? WHERE code=?', [b.data.active ? 1 : 0, r.code]);
  await audit(req.user!.id, 'rule_change', `${r.code}${b.data.rule !== undefined ? ' reworded' : ''}${b.data.active !== undefined ? (b.data.active ? ' restored' : ' retired') : ''}`);
  res.json({ ok: true });
});
