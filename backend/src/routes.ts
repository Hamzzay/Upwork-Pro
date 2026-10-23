import { Router } from 'express';
import { z } from 'zod';
import { audit, exec, pool, query } from './db';
import { attachZone, teamZone } from './zone';
import { cheapFacts, DEEP_INCLUDES, deepDetails, deepText } from './deepdata';
import { convertWall, fromDb, wallClock, DB_ZONE, dayBounds, isZone, shiftMinutes, todayIn, ZONES, zoneLabel } from './tz';
import { attachUser, checkPassword, currentSessionHash, hashPassword, login, loginThrottled, logout, requireRole, setSessionCookie } from './auth';
import { detectInput, InputError, jobIdFromUrl } from './screening/jobsource';
import { loadContext } from './screening/context';
import { gatePrompt, normalizeReport } from './screening/contract';
import { screenJobText } from './screening/service';
import { library, loomVideos } from './routes_library';
import { proposals, proposalFor, reviewOf } from './routes_proposals';
import { imports } from './routes_import';
import { pickLoom, validSelection } from './screening/matching';
import { queueFitReasons, readFitReasons } from './screening/fit_reasons';
import { addMatches } from './screening/more_matches';
import { openingLabel } from './proposal/openings';
import { EXPORT_LIMIT, exportRows, toCsv, toXlsx } from './export';
import { getSettings, setSetting, SETTINGS, settingsConflict, type SettingKey } from './settings';
import { plugin } from './routes_plugin';
import { writing } from './routes_writing';
import { setup } from './routes_setup';
import { reviewer } from './routes_reviewer';
import { feedback } from './routes_feedback';
import { attachments, attachmentList } from './routes_attachments';
import { uploads } from './screening/uploads';
import { dropPrepared, prepareFiles, recordFiles, uploadBody } from './screening/attachments';
import { oauthApi } from './oauth';
import { htmlToPlain } from './html';
import { separate, splitText } from './proposal/answers';
import { buildFlagReview, picksOf } from './flagreview';
import { applySendParts, queueEarlyDraft, queueParts, sendPartsNow } from './proposal/pipeline';
import { buildReport, membersOf, packRows } from './reports';
import { ChangedSince, KINDS, raw, record as recordChange, recordSetupChanges, revert } from './changesets';
import { withCallContext } from './llm/context';
import { diff, snapshot } from './changes';
import { testCall } from './llm';
import { inviteSql, looksInvited } from './invite';
import { clientFor, clientProfile, mergeClients, separateJob } from './clients';
import { PROVIDERS, PROVIDER_IDS, currentChoice, keyPresent, realCallsEnabled, type ProviderId } from './llm/providers';

export const api = Router();
api.use(attachUser);
api.use(attachZone); // which time zone this request counts days in (zone.ts)
api.use(recordSetupChanges); // every change to the setup is kept as a change set (changesets.ts)
api.use(library);
api.use(proposals);
api.use(imports);
api.use(plugin);
api.use(writing);
api.use(setup);
api.use(reviewer); // the Reviewer page (R61)
api.use(feedback); // experience gaps and proposal feedback (R67)
api.use(attachments); // documents attached to jobs (R74)
api.use(uploads); // R123: files in pieces, so no size limit in front of the app stops them
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
api.get('/me', async (req, res) => {
  if (!req.user) return void res.json({ user: null });
  // the person's own view settings (R85), with the user
  const row = (await query<any>('SELECT prefs_json, avatar_v, avatar IS NOT NULL AS has_avatar FROM users WHERE id=?', [req.user.id]))[0];
  let prefs: Record<string, unknown> = {};
  try { prefs = JSON.parse(row?.prefs_json || '{}') || {}; } catch { prefs = {}; }
  // R94: the main admin (the first admin account) may discard many jobs at once
  res.json({ user: { ...req.user, prefs, avatar_v: Number(row?.has_avatar) ? Number(row.avatar_v) : null, main_admin: req.user.role === 'admin' && (await mainAdminId()) === req.user.id } });
});
// Your own account (R87): your name, and your picture. Your email is how you sign in, so only an admin changes it (Users page).
api.put('/me/name', requireRole(), async (req, res) => {
  const b = z.object({ name: z.string().trim().min(2, 'Enter your name').max(120) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  await exec('UPDATE users SET name=? WHERE id=?', [b.data.name, req.user!.id]);
  await audit(req.user!.id, 'name_change');
  res.json({ ok: true, name: b.data.name });
});
api.put('/me/avatar', requireRole(), async (req, res) => {
  const b = z.object({ data: z.string().min(20).max(500_000) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Choose a picture' });
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(b.data.data);
  if (!m) return void res.status(400).json({ error: 'The picture must be a JPEG, PNG or WebP image' });
  const buf = Buffer.from(m[2], 'base64');
  const ok = (buf[0] === 0xff && buf[1] === 0xd8) || (buf[0] === 0x89 && buf[1] === 0x50) || buf.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!ok || buf.length > 350_000) return void res.status(400).json({ error: 'That picture could not be used. Try another one.' });
  await exec('UPDATE users SET avatar=?, avatar_type=?, avatar_v=avatar_v+1 WHERE id=?', [buf, m[1], req.user!.id]);
  await audit(req.user!.id, 'avatar_change');
  const v = (await query<any>('SELECT avatar_v FROM users WHERE id=?', [req.user!.id]))[0].avatar_v;
  res.json({ ok: true, avatar_v: Number(v) });
});
api.delete('/me/avatar', requireRole(), async (req, res) => {
  await exec('UPDATE users SET avatar=NULL, avatar_type=NULL, avatar_v=avatar_v+1 WHERE id=?', [req.user!.id]);
  res.json({ ok: true });
});
// A person's picture, for anyone signed in (the sidebar, the Users page). Cached by the browser; a new picture has a new address.
api.get('/users/:id/avatar', requireRole(), async (req, res) => {
  const u = (await query<any>('SELECT avatar, avatar_type FROM users WHERE id=?', [Number(req.params.id)]))[0];
  if (!u || !u.avatar) return void res.status(404).json({ error: 'No picture' });
  res.setHeader('Content-Type', u.avatar_type || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(u.avatar);
});
// Your time zone: the app shows you times and counts your days in it (Pakistan time unless you choose another). Stored times stay Pakistan time.
api.put('/me/time-zone', requireRole(), async (req, res) => {
  const b = z.object({ time_zone: z.string().trim().max(64) }).safeParse(req.body);
  if (!b.success || !isZone(b.data.time_zone)) return void res.status(400).json({ error: 'Choose a time zone' });
  const row = (await query<any>('SELECT prefs_json FROM users WHERE id=?', [req.user!.id]))[0];
  let prefs: Record<string, unknown> = {}; try { prefs = JSON.parse(row?.prefs_json || '{}') || {}; } catch { prefs = {}; }
  if (b.data.time_zone === DB_ZONE) delete prefs.time_zone; else prefs.time_zone = b.data.time_zone;
  await exec('UPDATE users SET prefs_json=? WHERE id=?', [JSON.stringify(prefs), req.user!.id]);
  await audit(req.user!.id, 'time_zone_change', zoneLabel(b.data.time_zone));
  res.json({ ok: true, time_zone: b.data.time_zone });
});
api.get('/time-zones', requireRole(), async (_req, res) => { res.json({ zones: ZONES.map(([id, name]) => ({ id, name })), default: DB_ZONE, team: await teamZone() }); });
// One view setting of the person's own (R85): the Jobs list's columns of one tab, shown and in order. null puts the tab's own back.
const PREF_KEY = /^jobs_cols\.(all|in_progress|submitted|closed|not_pursued)$/;
api.put('/me/prefs', requireRole(), async (req, res) => {
  const b = z.object({ key: z.string().regex(PREF_KEY, 'Not a setting that can be kept'), value: z.array(z.string().trim().regex(/^[a-z_]{1,30}$/)).max(40).nullable() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const row = (await query<any>('SELECT prefs_json FROM users WHERE id=?', [req.user!.id]))[0];
  let prefs: Record<string, unknown> = {}; try { prefs = JSON.parse(row?.prefs_json || '{}') || {}; } catch { prefs = {}; }
  if (b.data.value === null) delete prefs[b.data.key]; else prefs[b.data.key] = [...new Set(b.data.value)];
  await exec('UPDATE users SET prefs_json=? WHERE id=?', [JSON.stringify(prefs), req.user!.id]);
  res.json({ ok: true, prefs });
});
// Rows per page in every list (R82): kept with the person's account.
api.put('/me/page-size', requireRole(), async (req, res) => {
  const b = z.object({ size: z.coerce.number().int().refine((n) => (PAGE_SIZES as readonly number[]).includes(n), 'Pick 20, 50, 100 or 200') }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  await exec('UPDATE users SET page_size=? WHERE id=?', [b.data.size, req.user!.id]);
  res.json({ ok: true, size: b.data.size });
});
// Change your own password: needs the current one. Every other session of yours is signed out; this one stays.
api.post('/me/password', requireRole(), async (req, res) => {
  if (req.viaToken) return void res.status(403).json({ error: 'Sign in on the website to change your password' });
  const b = z.object({ current: z.string().min(1, 'Enter your current password'), password: z.string().min(10, 'The new password must be at least 10 characters').max(200) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  if (loginThrottled(`pw|${req.user!.id}`)) return void res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const u = (await query<any>('SELECT password_hash FROM users WHERE id=?', [req.user!.id]))[0];
  if (!u || !(await checkPassword(b.data.current, u.password_hash))) return void res.status(400).json({ error: 'The current password is not right' });
  if (b.data.current === b.data.password) return void res.status(400).json({ error: 'The new password is the same as the current one' });
  await exec('UPDATE users SET password_hash=? WHERE id=?', [await hashPassword(b.data.password), req.user!.id]);
  await exec('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', [req.user!.id, currentSessionHash(req) ?? '']);
  await audit(req.user!.id, 'password_change');
  res.json({ ok: true });
});

// ---------- screenings ----------
const canSeeAll = (role: string) => role === 'admin' || role === 'manager';

api.post('/screenings', requireRole(), async (req, res) => {
  const b = z.object({
    input: z.string(),
    job_url: z.string().trim().max(500).nullish(),
    files: uploadBody.shape.files.optional(), // documents the client attached to the job (R74)
    auto: z.boolean().optional(), // auto mode (R75): screened and written with no questions in between
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
  // the files are read first; the job and its files are then saved together, so the worker never screens it without them
  const { ready, errors } = b.data.files?.length ? await prepareFiles(b.data.files, 0, req.user!.id) : { ready: [], errors: [] };
  const conn = await pool.getConnection();
  let id: number;
  try {
    await conn.beginTransaction();
    const [r]: any = await conn.query(
      `INSERT INTO screenings (user_id, input_type, source_url, upwork_job_id, raw_input, job_text, posting_status, auto_mode, auto_state, invited) VALUES (?,?,?,?,?,?,'queued',?,?,?)`,
      [req.user!.id, parsed.type, sourceUrl, parsed.type === 'link' ? parsed.jobId : (sourceUrl ? jobIdFromUrl(sourceUrl) : null),
       b.data.input.trim(), parsed.type === 'text' ? parsed.text : null, b.data.auto ? 1 : 0, b.data.auto ? 'running' : null,
       looksInvited(b.data.input, sourceUrl) ? 'yes' : null]); // R105: an invitation pasted is an invite
    id = Number(r.insertId);
    await recordFiles((sql, p) => conn.query(sql, p as any[]), id, req.user!.id, ready, false);
    await conn.commit();
  } catch (e) { await conn.rollback(); dropPrepared(ready); throw e; } finally { conn.release(); }
  if (ready.length || errors.length) await audit(req.user!.id, 'attachments_add', `screening=${id} files=${ready.length}${errors.length ? ' refused=' + errors.length : ''}`);
  res.status(202).json({ id, status: 'queued', input_type: parsed.type, files: { saved: ready.length, errors } });
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
/** Where one job stands, with the words the Jobs list uses. For the plugin's saves, so Claude can say what the app now shows. */
const STAGE_LABEL: Record<string, string> = { screening: 'Screening', failed: 'Screening failed', skipped: 'Skipped', closed: 'Closed', submitted: 'Submitted', decide: 'Decision pending', projects: 'Projects pending',
  profile: 'Profile pending', type: 'Proposal type pending', writing: 'Writing', review: 'Review pending', ready: 'Ready to send' };
export async function jobStage(id: number): Promise<{ stage: string; label: string } | null> {
  const r = (await query<any>(`SELECT (${stageSql}) AS stage FROM screenings s LEFT JOIN proposals p ON p.screening_id=s.id WHERE s.id=?`, [id]))[0];
  return r ? { stage: r.stage, label: STAGE_LABEL[r.stage] ?? r.stage } : null;
}
const phaseSql = `CASE WHEN (${stageSql}) IN ('skipped','failed') THEN 'not_pursued' WHEN (${stageSql}) IN ('submitted','closed') THEN (${stageSql}) ELSE 'in_progress' END`;
/** The latest thing that happened on Upwork after the proposal: outcome, then interview, replied, viewed, sent. */
const statusSql = `CASE WHEN s.outcome IS NOT NULL THEN s.outcome WHEN s.interviewed='yes' THEN 'Interview' WHEN s.client_replied='yes' THEN 'Chat opened'
  WHEN s.client_viewed='yes' THEN 'Viewed' WHEN s.proposal_sent_date IS NOT NULL OR s.proposal_sent_at IS NOT NULL THEN 'Sent' ELSE NULL END`;
const statusAtSql = `CASE WHEN s.outcome IS NOT NULL THEN s.outcome_at WHEN s.interviewed='yes' THEN s.interviewed_at WHEN s.client_replied='yes' THEN s.client_replied_at
  WHEN s.client_viewed='yes' THEN s.client_viewed_at ELSE COALESCE(s.proposal_sent_at, s.proposal_sent_date) END`;
export const listFrom = `FROM screenings s JOIN users u ON u.id=s.user_id LEFT JOIN overrides o ON o.screening_id=s.id
  LEFT JOIN upwork_profiles pr ON pr.id=s.upwork_profile_id LEFT JOIN proposals p ON p.screening_id=s.id`;
const listSelect = `SELECT s.id, s.user_id, s.notes, s.skip_reason, s.skip_note, s.source, s.input_type, s.source_url, s.title, s.status, s.verdict, s.error_code, s.error_message, s.created_at,
  s.rule_codes, s.proceeded, s.outcome, s.tagging_status, s.selection_confirmed_at, s.continued_at IS NOT NULL AS continued,
  s.client_country, s.budget, s.job_type, s.hire_rate, s.connects_spent, s.boost_connects, s.client_viewed, s.client_replied, s.interviewed, s.proposal_sent_date, s.discarded_at, s.discard_reason,
  u.name AS user_name, pr.name AS profile_name, o.id IS NOT NULL AS overridden,
  p.status AS proposal_status, p.finalized_at AS proposal_finalized_at, p.template_name,
  IF(s.source = 'claude_plugin', NULL, TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at)) AS secs_to_proposal, ${stageSql} AS stage, ${phaseSql} AS phase,
  TIMESTAMPDIFF(DAY, COALESCE(${statusAtSql}, s.created_at), NOW()) AS days_since_update,
  TIMESTAMPDIFF(DAY, COALESCE(s.proposal_sent_at, s.proposal_sent_date), s.outcome_at) AS days_to_close, s.outcome_reason, s.proposal_sent_at,
  ${statusSql} AS current_status, ${statusAtSql} AS status_at, ${inviteSql} AS invite, s.client_id,
  IF(s.client_id IS NULL, 0, (SELECT COUNT(*) FROM screenings c2 WHERE c2.client_id=s.client_id AND c2.id<>s.id AND c2.discarded_at IS NULL)) AS client_jobs
  ${listFrom}`;

/** Rows per page in the lists: each person's own choice (R82), 20 unless they picked another. */
const PAGE_SIZES = [20, 50, 100, 200] as const;
const ps = (req: any): number => (PAGE_SIZES as readonly number[]).includes(Number(req.user?.page_size)) ? Number(req.user.page_size) : 20;
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
  invite: z.enum(['yes', 'no']).optional(), // R105: invites only, or proposals only (the Reports default)
  client: z.coerce.number().int().positive().optional(), // R110: one client's jobs
  // R118: more ways to find jobs: hourly or fixed, the client's country, auto mode, attached files, how far it got on Upwork
  job_type: z.enum(['hourly', 'fixed']).optional(), country: z.string().trim().max(80).optional(), auto: z.enum(['yes', 'no']).optional(),
  docs: z.enum(['yes', 'no']).optional(), reached: z.enum(['continued', 'written', 'sent', 'viewed', 'chat', 'interview', 'hired']).optional(), industry: z.string().trim().max(120).optional(),
  // R117: the jobs behind one line of a report (and one of its numbers): the report, the line and the part (sent, viewed...)
  rdim: z.string().trim().max(40).optional(), rkey: z.string().max(300).optional(),
  rpart: z.enum(['all', 'continued', 'written', 'sent', 'viewed', 'chat', 'interview', 'hired', 'lost']).optional(),
  idlist: z.array(z.number().int()).optional(), // worked out from the three above, never sent by a page
  discarded: z.enum(['1']).optional(), // admins only: the discarded jobs instead of the live ones
});
export type ListFilters = z.infer<typeof listFilters>;

/**
 * R117 (Hamza): a line of a report opens exactly its jobs. The report is worked out again with the same filters (the period, the
 * profile, the person...), and the jobs it counted on that line (all of them, or only those sent, viewed, hired...) become the list.
 * "funnel" is the totals line, for the funnel and the summary numbers.
 */
export async function withReportRow<F extends ListFilters>(req: any, f: F): Promise<F> {
  if (!f.rdim || f.rkey == null) return f;
  const { rdim, rkey, rpart, ...base } = f;
  const rep = await reportFor(req, { ...base, phase: undefined, stage: undefined, q: undefined, idlist: undefined } as ListFilters);
  const row = rdim === 'funnel' ? rep.totals : rep.dims.find((d) => d.key === rdim)?.rows.find((r) => r.key === rkey);
  return { ...f, idlist: row ? membersOf(row, rpart ?? 'all') : [] };
}
/** Shared by the list, the counters and the export: which jobs this person may see, and the filters. */
export function listWhere(req: any, f: ListFilters, quietDays = 5) {
  const where: string[] = []; const p: any[] = [];
  // a discarded job is in no list, count, report or export; only an admin can ask for the discarded ones
  where.push(f.discarded === '1' && req.user.role === 'admin' ? 's.discarded_at IS NOT NULL' : 's.discarded_at IS NULL');
  if (!canSeeAll(req.user.role) || f.mine === '1') { where.push('s.user_id=?'); p.push(req.user.id); }
  if (f.verdict) { where.push('s.verdict=?'); p.push(f.verdict); }
  const cq = f.q ? /^c-?(\d{1,9})$/i.exec(f.q.trim()) : null; // R110: "C-12" finds that client's jobs
  if (cq) { where.push('s.client_id=?'); p.push(Number(cq[1])); }
  else if (f.q) {
    const like = `%${likeEsc(f.q)}%`;
    where.push(`(s.title LIKE ? OR u.name LIKE ? OR pr.name LIKE ? OR s.rule_codes LIKE ? OR s.source_url LIKE ? OR s.client_country LIKE ?)`);
    p.push(like, like, like, like, like, like);
  }
  // days are the person's (or, for Claude's updates, the team's) days, turned into stored Pakistan times
  const zone = req.zone ?? DB_ZONE, cr = dayBounds(f.from, f.to, zone), sr = dayBounds(f.sent_from, f.sent_to, zone);
  if (cr.start) { where.push('s.created_at >= ?'); p.push(cr.start); }
  if (cr.end) { where.push('s.created_at < ?'); p.push(cr.end); }
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
  if (f.invite) where.push(f.invite === 'yes' ? inviteSql : `NOT ${inviteSql}`);
  if (f.client) { where.push('s.client_id=?'); p.push(f.client); }
  if (f.job_type) where.push(f.job_type === 'hourly' ? `s.job_type LIKE 'hour%'` : `s.job_type LIKE 'fixed%'`); // what it starts with: a note after it may name the other
  if (f.country) { where.push('s.client_country LIKE ?'); p.push(`%${likeEsc(f.country)}%`); }
  if (f.industry) { where.push(`EXISTS (SELECT 1 FROM job_tags ji WHERE ji.screening_id=s.id AND ji.category_name='Industry' AND ji.tag_name=?)`); p.push(f.industry); }
  if (f.auto) where.push(f.auto === 'yes' ? 's.auto_mode=1' : 'COALESCE(s.auto_mode, 0)=0');
  if (f.docs) where.push(`${f.docs === 'yes' ? '' : 'NOT '}EXISTS (SELECT 1 FROM job_attachments ja WHERE ja.screening_id=s.id)`);
  // how far it got, as the reports count it: a view, a chat, an interview or a hire counts only once the proposal was sent (R119)
  if (f.reached) where.push({ continued: 's.continued_at IS NOT NULL', written: 'p.finished_at IS NOT NULL', sent: sentSql, viewed: `(${sentSql} AND s.client_viewed='yes')`,
    chat: `(${sentSql} AND s.client_replied='yes')`, interview: `(${sentSql} AND s.interviewed='yes')`, hired: `(${sentSql} AND s.outcome='Hired')` }[f.reached]);
  if (f.idlist) where.push(f.idlist.length ? `s.id IN (${f.idlist.map((n) => Number(n)).join(',')})` : '1=0');
  if (sr.start) { where.push('COALESCE(s.proposal_sent_at, s.proposal_sent_date) >= ?'); p.push(sr.start); }
  if (sr.end) { where.push('COALESCE(s.proposal_sent_at, s.proposal_sent_date) < ?'); p.push(sr.end); }
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
  const f = await withReportRow(req, listFilters.extend({ page: z.coerce.number().int().min(1).default(1), sort: z.string().max(20).optional(), dir: z.enum(['asc', 'desc']).optional() }).parse(req.query));
  const w = listWhere(req, f, (await getSettings())['tracking.quiet_days']);
  const total = Number((await query<any>(`SELECT COUNT(*) AS n ${listFrom} ${w.sql}`, w.p))[0].n);
  const pages = Math.max(1, Math.ceil(total / ps(req)));
  const page = Math.min(f.page, pages);
  const rows = await query(`${listSelect} ${w.sql} ${orderBy(f.sort, f.dir)} LIMIT ? OFFSET ?`, [...w.p, ps(req), (page - 1) * ps(req)]);
  res.json({ screenings: rows, total, page, pages, page_size: ps(req) });
});

// Counts for the summary tiles: every filter applies except the verdict, so the tiles can switch between verdicts.
api.get('/screenings/stats', requireRole(), async (req, res) => {
  const f = await withReportRow(req, listFilters.parse(req.query));
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
/** The Dashboard's numbers: the page, and Claude (get_dashboard). */
const dashboard = async (req: any, res: any) => {
  const f = listFilters.pick({ from: true, to: true, profile: true, user: true, mine: true }).parse(req.query);
  const w = listWhere(req, f);
  const one = async (sql: string, p: any[] = []) => (await query<any>(sql, [...p, ...w.p]))[0];
  const n = (v: any) => Number(v || 0);
  const c = await one(`SELECT COUNT(*) AS screened, SUM(s.verdict='PASS') AS pass_n, SUM(s.verdict='FLAG') AS flag_n, SUM(s.verdict='FAIL') AS fail_n,
      SUM(s.status='error') AS failed, SUM(s.continued_at IS NOT NULL) AS continued, SUM(o.id IS NOT NULL) AS overridden,
      SUM(p.finished_at IS NOT NULL) AS proposals, SUM(p.finalized_at IS NOT NULL) AS finalized,
      -- R105: the funnel after sending counts proposals only; an invite opens the chat itself, so invites are counted apart
      SUM(s.proposal_sent_date IS NOT NULL AND NOT ${inviteSql}) AS sent, SUM(s.client_viewed='yes' AND NOT ${inviteSql}) AS viewed, SUM(s.client_replied='yes' AND NOT ${inviteSql}) AS replied,
      SUM(s.interviewed='yes' AND NOT ${inviteSql}) AS interviewed, SUM(s.outcome='Hired' AND NOT ${inviteSql}) AS hired,
      SUM(s.proposal_sent_date IS NOT NULL AND ${inviteSql}) AS inv_sent, SUM(s.interviewed='yes' AND ${inviteSql}) AS inv_interviewed, SUM(s.outcome='Hired' AND ${inviteSql}) AS inv_hired,
      SUM(s.connects_spent) + COALESCE(SUM(s.boost_connects), 0) AS connects,
      AVG(IF(s.source='claude_plugin', NULL, TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at))) AS avg_to_proposal, MIN(IF(s.source='claude_plugin', NULL, TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at))) AS min_to_proposal,
      MAX(IF(s.source='claude_plugin', NULL, TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at))) AS max_to_proposal,
      AVG(IF(s.source='claude_plugin', NULL, TIMESTAMPDIFF(SECOND, COALESCE(s.started_at, s.created_at), s.finished_at))) AS avg_screening,
      AVG(TIMESTAMPDIFF(SECOND, s.continued_at, s.tagged_at)) AS avg_matching,
      AVG(IF(s.source='claude_plugin', NULL, TIMESTAMPDIFF(SECOND, p.created_at, p.finished_at))) AS avg_writing,
      SUM(s.auto_mode=1) AS auto_n, SUM(s.auto_mode=1 AND p.finished_at IS NOT NULL) AS auto_written, SUM(s.auto_mode=1 AND s.auto_state='stopped') AS auto_stopped,
      AVG(IF(p.finished_at IS NOT NULL, JSON_EXTRACT(p.review_json, '$.score'), NULL)) AS avg_review, SUM(p.finished_at IS NOT NULL AND JSON_EXTRACT(p.review_json, '$.score') IS NOT NULL) AS reviewed,
      SUM(JSON_EXTRACT(p.openings_json, '$.used') IS NOT NULL) AS opening_used,
      SUM((SELECT COUNT(*) FROM job_attachments ja WHERE ja.screening_id=s.id) > 0) AS with_docs,
      SUM((SELECT COUNT(*) FROM proposal_feedback fb WHERE fb.screening_id=s.id)) AS feedback_n,
      SUM((SELECT COUNT(*) FROM proposal_gaps g WHERE g.screening_id=s.id AND g.status='open')) AS gaps_open,
      SUM((SELECT COUNT(*) FROM proposal_gaps g WHERE g.screening_id=s.id AND g.status='yes')) AS gaps_yes
    ${listFrom} ${w.sql}`);
  const stages = await query<any>(`SELECT (${stageSql}) AS stage, COUNT(*) AS n ${listFrom} ${w.sql} GROUP BY 1`, w.p);
  const waiting = await query<any>(`SELECT s.id, s.title, s.user_id, u.name AS user_name, s.created_at, (${stageSql}) AS stage ${listFrom} ${w.sql ? w.sql + ' AND' : 'WHERE'} (${stageSql}) IN (?)
    ORDER BY s.created_at LIMIT 8`, [...w.p, NEEDS_ACTION]);
  // per day in the request's time zone (the stored time moved to that zone's clock)
  const shift = shiftMinutes(req.zone ?? DB_ZONE);
  const daily = await query<any>(`SELECT DATE(DATE_ADD(s.created_at, INTERVAL ? MINUTE)) AS d, COUNT(*) AS screened, SUM(s.continued_at IS NOT NULL) AS continued, SUM(p.finished_at IS NOT NULL) AS proposals
    ${listFrom} ${w.sql} GROUP BY 1 ORDER BY d DESC LIMIT 31`, [shift, ...w.p]);
  // what happened in the period, by when it happened (not by when the job was screened): what a daily update needs
  const zone = req.zone ?? DB_ZONE, b = dayBounds(f.from, f.to, zone);
  const inP = (col: string) => `(${col} IS NOT NULL${b.start ? ` AND ${col} >= ?` : ''}${b.end ? ` AND ${col} < ?` : ''})`;
  const bp = [b.start, b.end].filter(Boolean);
  const wAll = listWhere(req, { ...f, from: undefined, to: undefined });
  const happenedRow = (await query<any>(`SELECT SUM(${inP('s.created_at')}) AS screened, SUM(${inP('s.continued_at')}) AS continued, SUM(${inP('p.finished_at')}) AS written,
      SUM(${inP('p.finalized_at')}) AS finished, SUM(${inP('COALESCE(s.proposal_sent_at, s.proposal_sent_date)')} AND NOT ${inviteSql}) AS sent,
      SUM(${inP('COALESCE(s.proposal_sent_at, s.proposal_sent_date)')} AND ${inviteSql}) AS invites_sent,
      SUM(${inP('s.client_viewed_at')}) AS viewed, SUM(${inP('s.client_replied_at')}) AS chats, SUM(${inP('s.interviewed_at')}) AS interviews,
      SUM(${inP('s.outcome_at')} AND s.outcome='Hired') AS hired,
      SUM(IF(${inP('COALESCE(s.proposal_sent_at, s.proposal_sent_date)')}, COALESCE(s.connects_spent, 0) + COALESCE(s.boost_connects, 0), 0)) AS connects
    ${listFrom} ${wAll.sql}`, [...bp, ...bp, ...bp, ...bp, ...bp, ...bp, ...bp, ...bp, ...bp, ...bp, ...bp, ...wAll.p]))[0] ?? {};
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
      proposals: n(c.proposals), finalized: n(c.finalized), sent: n(c.sent), viewed: n(c.viewed), replied: n(c.replied), interviewed: n(c.interviewed), hired: n(c.hired), connects: n(c.connects),
      invites: { sent: n(c.inv_sent), interviewed: n(c.inv_interviewed), hired: n(c.inv_hired) } },
    timings: { avg_to_proposal: c.avg_to_proposal == null ? null : Math.round(c.avg_to_proposal), min_to_proposal: c.min_to_proposal, max_to_proposal: c.max_to_proposal,
      avg_screening: c.avg_screening == null ? null : Math.round(c.avg_screening), avg_matching: c.avg_matching == null ? null : Math.round(c.avg_matching),
      avg_writing: c.avg_writing == null ? null : Math.round(c.avg_writing) },
    // R82: how proposals are made now, and how good the review judged them
    quality: { auto: n(c.auto_n), auto_written: n(c.auto_written), auto_stopped: n(c.auto_stopped), avg_review: c.avg_review == null ? null : Math.round(Number(c.avg_review) * 10) / 10,
      reviewed: n(c.reviewed), opening_used: n(c.opening_used), with_docs: n(c.with_docs), feedback: n(c.feedback_n), gaps_open: n(c.gaps_open), gaps_yes: n(c.gaps_yes) },
    // the days counted, said plainly, so a "today" or "yesterday" can never be read in the wrong time zone
    period: { from: f.from ?? null, to: f.to ?? null, time_zone: zone, time_zone_name: zoneLabel(zone), today_there: todayIn(zone),
      starts_pakistan_time: b.start, ends_pakistan_time: b.end },
    happened: Object.fromEntries(Object.entries(happenedRow).map(([k, v]) => [k, n(v)])),
    stages: Object.fromEntries(stages.map((r) => [r.stage, n(r.n)])), needs_action: NEEDS_ACTION, waiting,
    daily: daily.reverse().map((r) => ({ day: String(r.d instanceof Date ? r.d.toLocaleDateString('sv') : r.d).slice(0, 10), screened: n(r.screened), continued: n(r.continued), proposals: n(r.proposals) })),
    by_user: canSeeAll(req.user!.role) ? await by('s.user_id', 'u.name') : [], by_profile: await by('s.upwork_profile_id', 'pr.name'),
    rules: [...rules.values()].sort((a, b) => b.fired - a.fired).slice(0, 12).map((r) => ({ ...r, type: ruleText.get(r.code)?.type ?? null, rule: ruleText.get(r.code)?.rule ?? null })),
  });
};
api.get('/dashboard', requireRole(), dashboard);
api.get('/plugin/dashboard', requireRole(), dashboard);

/**
 * One job's whole proposal record for Claude (R82): every version with its text and how it was made, the screening answers, the
 * independent review in full, the openings offered and the one used, the experience questions and their answers, the feedback
 * left on it, the comparisons made, and the client's documents (what the AI reads from them).
 */
api.get('/plugin/proposal-record/:id', requireRole(), async (req, res) => {
  const id = Number(req.params.id);
  const s = (await query<any>('SELECT id, user_id, title, auto_mode, auto_state, auto_note FROM screenings WHERE id=? AND discarded_at IS NULL', [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  const p = (await query<any>('SELECT id, status, template_name, template_choice, review_json, review_version, openings_json, finished_at, finalized_at FROM proposals WHERE screening_id=?', [id]))[0];
  const docs = await query<any>(`SELECT file_name, kind, status, read_by, text_content FROM job_attachments WHERE screening_id=? ORDER BY id`, [id]);
  // R114: everything else kept about the job (deepdata.ts): what the gate wrote, the shortlist with reasons, the types ranked, the chats with
  // the AI, the AI's work per step, every hand change, every review, and why it was skipped
  const zw: (v: any) => string | null = (v) => (!v ? null : String(v).length <= 10 ? String(v) : fromDb(String(v), (req as any).zone ?? DB_ZONE).slice(0, 16));
  const fact = (await cheapFacts([id])).get(id) ?? null;
  const more = { ...(fact ?? {}), ...((await deepDetails([id], new Set(DEEP_INCLUDES), zw)).get(id) ?? {}), times: `Times are in ${zoneLabel((req as any).zone ?? DB_ZONE)}` };
  if (!p) return void res.json({ job: { id: s.id, title: s.title, auto_mode: !!Number(s.auto_mode) }, proposal: null, documents: docs, more });
  const versions = (await query<any>(`SELECT v.version_no, v.source, v.note, v.created_at, v.content_html, v.answers_json, u.name AS by_name FROM proposal_versions v LEFT JOIN users u ON u.id=v.created_by
    WHERE v.proposal_id=? ORDER BY v.version_no`, [p.id])).map((v) => { const sp = separate(v.content_html, v.answers_json);
    return { version: v.version_no, made_by: v.source, by: v.by_name, note: v.note, at: v.created_at, text: htmlToPlain(sp.html), screening_answers: sp.answers }; });
  const parse = (x: string | null) => { try { return x ? JSON.parse(x) : null; } catch { return null; } };
  const gaps = await query<any>(`SELECT g.skill, g.ask, g.quote, g.status, g.note, g.library, (SELECT GROUP_CONCAT(pr.name SEPARATOR ', ') FROM proposal_gap_projects gp JOIN projects pr ON pr.id=gp.project_id WHERE gp.gap_id=g.id) AS projects
    FROM proposal_gaps g WHERE g.proposal_id=? ORDER BY g.id`, [p.id]);
  const feedback = await query<any>('SELECT f.version_no, f.category, f.feedback, f.excerpt, f.created_at, u.name AS by_name FROM proposal_feedback f LEFT JOIN users u ON u.id=f.user_id WHERE f.screening_id=? ORDER BY f.id', [id]);
  const comparisons = (await query<any>(`SELECT version_a, version_b, result_json FROM proposal_comparisons WHERE proposal_id=? AND status='done' ORDER BY id`, [p.id])).map((c) => ({ left: c.version_a, right: c.version_b, ...parse(c.result_json) }));
  await audit(req.user!.id, 'analysis_read', `proposal record of job #${id}`);
  res.json({ more, job: { id: s.id, title: s.title, auto_mode: !!Number(s.auto_mode), auto_state: s.auto_state, auto_note: s.auto_note },
    proposal: { status: p.status, type: p.template_name, type_chosen: p.template_choice, written_at: p.finished_at, finished_at: p.finalized_at, versions,
      review: p.review_json ? { of_version: p.review_version, ...parse(p.review_json) } : null, openings: parse(p.openings_json), experience: gaps, feedback, comparisons },
    documents: docs.map((d) => ({ file: d.file_name, kind: d.kind, status: d.status, read_by: d.read_by, text: d.text_content })) });
});

/**
 * Activity for Claude (managers and admins, R82): the AI calls of a period by step and model (how many, failures, average time),
 * the latest failures, and what people did, counted by action and person.
 */
api.get('/plugin/activity', requireRole('admin', 'manager'), async (req, res) => {
  const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: 'from and to are YYYY-MM-DD' });
  const zone = (req as any).zone ?? DB_ZONE, today = todayIn(zone);
  const from = q.data.from ?? new Date(Date.parse(today + 'T00:00:00Z') - 29 * 86400000).toISOString().slice(0, 10), to = q.data.to ?? today;
  const bd = dayBounds(from, to, zone);
  const range = (t: string) => `${t}.created_at >= ? AND ${t}.created_at < ?`;
  const calls = await query<any>(`SELECT kind, step, model, COUNT(*) AS calls, SUM(ok=0) AS failed, ROUND(AVG(ms)) AS avg_ms FROM llm_calls c WHERE ${range('c')} GROUP BY kind, step, model ORDER BY calls DESC LIMIT 200`, [bd.start, bd.end]);
  const failures = await query<any>(`SELECT c.created_at, c.kind, c.step, c.model, c.error, c.screening_id FROM llm_calls c WHERE c.ok=0 AND ${range('c')} ORDER BY c.id DESC LIMIT 50`, [bd.start, bd.end]);
  const actions = await query<any>(`SELECT a.action, u.name AS person, COUNT(*) AS times FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE ${range('a')} GROUP BY a.action, u.name ORDER BY times DESC LIMIT 300`, [bd.start, bd.end]);
  res.json({ from, to, time_zone: zone, time_zone_name: zoneLabel(zone), ai_calls: calls.map((r) => ({ ...r, calls: Number(r.calls), failed: Number(r.failed), avg_ms: Number(r.avg_ms) })), latest_failures: failures, actions: actions.map((r) => ({ ...r, times: Number(r.times) })) });
});

/** Which opening a proposal went out with (R73): the style of the one used, "As written" when openings were offered and none used. */
/** The opening a proposal went out with (R104: named by its template, and marked when edited). */
export const openingUsed = openingLabel;
/** The jobs the filters match, as the reports read them, with their tags, projects and signals. Shared by the Reports page and the plugin. */
export const REPORT_LIMIT = 10000;
export async function reportFor(req: any, f: ListFilters) {
  const zone = String(req.zone ?? DB_ZONE);
  const w = listWhere(req, f);
  const jobs = await query<any>(`SELECT s.id, s.user_id, u.name AS user_name, s.upwork_profile_id AS profile_id, pr.name AS profile_name, s.source, s.verdict, s.rule_codes,
      o.id IS NOT NULL AS overridden, o.verdict_at_time AS override_verdict, s.continued_at IS NOT NULL AS continued, p.finished_at IS NOT NULL AS written, p.template_name, p.template_choice,
      ${sentSql} AS sent, COALESCE(s.proposal_sent_at, s.proposal_sent_date) AS sent_at, s.client_viewed='yes' AS viewed, s.client_replied='yes' AS chat, s.interviewed='yes' AS interview,
      s.outcome, s.outcome_reason, s.outcome_at, s.client_viewed_at AS viewed_at, s.client_replied_at AS chat_at, s.connects_spent, s.boost_connects, s.created_at, s.skip_reason, s.proceeded,
      s.client_country, s.job_type, s.experience_level, s.loom_video_id, s.loom_video_title,
      TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at) AS secs_to_proposal,
      (SELECT pv.content_html FROM proposal_versions pv WHERE pv.proposal_id=p.id ORDER BY pv.version_no DESC LIMIT 1) AS html,
      s.auto_mode, JSON_EXTRACT(p.review_json, '$.score') AS review_score, p.openings_json, (SELECT name FROM opening_templates WHERE id=p.final_opening_id) AS final_opening_name, p.sent_version_no, ${inviteSql} AS invite,
      (SELECT COUNT(*) FROM proposal_versions pv2 WHERE pv2.proposal_id=p.id) AS versions,
      (SELECT COUNT(*) FROM job_attachments ja WHERE ja.screening_id=s.id) AS docs,
      (SELECT COUNT(*) FROM proposal_gaps g WHERE g.screening_id=s.id) AS gaps_asked, (SELECT COUNT(*) FROM proposal_gaps g WHERE g.screening_id=s.id AND g.status='yes') AS gaps_yes,
      (SELECT COUNT(*) FROM proposal_feedback fb WHERE fb.screening_id=s.id) AS feedback_n
    ${listFrom} ${w.sql} ORDER BY s.id DESC LIMIT ?`, [...w.p, REPORT_LIMIT + 1]);
  const capped = jobs.length > REPORT_LIMIT; if (capped) jobs.pop();
  for (const j of jobs) { const t = j.html ? splitText(htmlToPlain(j.html)).letter.trim() : ''; j.words = t ? t.split(/\s+/).length : null; delete j.html; j.opening = openingUsed(j.openings_json, j.final_opening_name); delete j.openings_json; delete j.final_opening_name; } // the cover letter's words; the opening sent
  const ids = jobs.map((j) => j.id);
  const extra = ids.length ? {
    tags: await query<any>('SELECT screening_id, tag_name, category_name FROM job_tags WHERE screening_id IN (?)', [ids]),
    projects: await query<any>('SELECT screening_id, project_name FROM job_matches WHERE selected=1 AND screening_id IN (?)', [ids]),
    signals: await query<any>('SELECT screening_id, signal_number, signal_name, value_name, is_fallback FROM job_signals WHERE screening_id IN (?)', [ids]),
  } : { tags: [], projects: [], signals: [] };
  return { ...buildReport(jobs, extra, (await getSettings())['tracking.loss_outcomes'], zone), capped, limit: REPORT_LIMIT, time_zone: zone, time_zone_name: zoneLabel(zone) };
}
// Reports: every trend we can count, for the jobs the filters match. Every row carries the Jobs list link that shows its jobs.
// Flag review (R63): per gate rule, what people did when it fired and how those jobs went (flagreview.ts). Managers and admins.
export async function flagReview() {
  const cfg = await getSettings();
  const jobs = await query<any>(`SELECT s.id, s.verdict, s.rule_codes, s.proceeded, s.continued_at IS NOT NULL AS continued, s.skip_reason, s.skip_note,
      o.reason AS override_reason, o.reason_picks, ${sentSql} AS sent, s.client_viewed='yes' AS viewed, s.client_replied='yes' AS chat, s.interviewed='yes' AS interview, s.outcome
    FROM screenings s LEFT JOIN overrides o ON o.screening_id=s.id WHERE s.discarded_at IS NULL AND s.status='done' AND s.verdict IS NOT NULL`);
  const rules = await query<any>('SELECT code, type, rule, active FROM rules ORDER BY code');
  return buildFlagReview(jobs, rules, cfg['override.reasons'], cfg['tracking.loss_outcomes']);
}
api.get('/reports/flag-review', requireRole('admin', 'manager'), async (_req, res) => { res.json(await flagReview()); });

api.get('/reports', requireRole(), async (req, res) => {
  const f = listFilters.safeParse(req.query);
  if (!f.success) return void res.status(400).json({ error: f.error.issues[0].message });
  res.json(await reportFor(req, f.data));
});

// Everything about every job the filters match, as CSV or Excel. Same filters and order as the Jobs list.
api.get('/screenings/export', requireRole(), async (req, res) => {
  const f = await withReportRow(req, listFilters.extend({ format: z.enum(['csv', 'xlsx']).default('csv'), sort: z.string().max(20).optional(), dir: z.enum(['asc', 'desc']).optional() }).parse(req.query));
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
    outcomes: (await query<any>('SELECT DISTINCT outcome FROM screenings WHERE outcome IS NOT NULL AND discarded_at IS NULL ORDER BY outcome')).map((r) => r.outcome),
    types: (await query<any>('SELECT DISTINCT template_name FROM proposals WHERE template_name IS NOT NULL ORDER BY template_name')).map((r) => r.template_name),
    // R118: what the other filters can offer: the industries and tags jobs have, the projects shown, the clients' countries
    industries: (await query<any>(`SELECT DISTINCT tag_name FROM job_tags WHERE category_name='Industry' ORDER BY tag_name`)).map((r) => r.tag_name),
    tags: (await query<any>(`SELECT tag_name, MIN(category_name) AS category, COUNT(DISTINCT screening_id) AS n FROM job_tags WHERE category_name<>'Industry' GROUP BY tag_name ORDER BY n DESC, tag_name LIMIT 400`)).map((r) => ({ name: r.tag_name, category: r.category })),
    projects: (await query<any>(`SELECT DISTINCT project_name FROM job_matches WHERE selected=1 ORDER BY project_name`)).map((r) => r.project_name),
    countries: (await query<any>(`SELECT DISTINCT TRIM(SUBSTRING_INDEX(client_country, ',', 1)) AS c FROM screenings WHERE client_country IS NOT NULL AND client_country NOT LIKE 'not %' AND discarded_at IS NULL ORDER BY c`)).map((r) => r.c).filter((c: string) => c && c.length < 60),
    // R110: the clients with more than one job, for the client filter (one job is not a client worth filtering by)
    clients: (await query<any>(`SELECT c.id, COALESCE(c.name, c.company, c.contact_name) AS name, COUNT(s.id) AS jobs FROM clients c JOIN screenings s ON s.client_id=c.id AND s.discarded_at IS NULL
      ${all ? '' : 'AND s.user_id=' + Number(req.user!.id)} WHERE c.merged_into IS NULL GROUP BY c.id HAVING jobs > 1 ORDER BY MAX(s.id) DESC LIMIT 300`)).map((r) => ({ id: r.id, name: r.name, jobs: Number(r.jobs) })),
    stages: STAGES, needs_action: NEEDS_ACTION, in_progress: IN_PROGRESS, phases: PHASES,
  });
});


/** Switch "Skip tech stack tags" for one job and queue the matching again. Refused while matching runs or once a proposal exists
 *  (its projects would change under it). Used by the Projects step and by the Claude plugin. */
export async function setSkipTechStack(id: number, skip: boolean, source: string, userId: number): Promise<{ error?: string; changed: boolean }> {
  const s = (await query<any>('SELECT skip_tech_stack, tagging_status FROM screenings WHERE id=?', [id]))[0];
  if (!s) return { error: 'Not found', changed: false };
  if (!!s.skip_tech_stack === skip) return { changed: false };
  if (s.tagging_status !== 'done' && s.tagging_status !== 'error') return { error: 'Wait until project matching has finished', changed: false };
  if ((await query<any>('SELECT 1 FROM proposals WHERE screening_id=? LIMIT 1', [id])).length) return { error: 'A proposal is already written with the projects picked, so the matching can no longer change', changed: false };
  const r = await exec(`UPDATE screenings SET skip_tech_stack=?, rematch_only=1, tagging_status='queued', tagging_error_code=NULL, tagging_error_message=NULL
    WHERE id=? AND tagging_status IN ('done', 'error')`, [skip ? 1 : 0, id]);
  if (!r.affectedRows) return { error: 'Wait until project matching has finished', changed: false };
  await exec('INSERT INTO field_changes (screening_id, field, old_value, new_value, source, user_id) VALUES (?,?,?,?,?,?)', [id, 'skip tech stack', skip ? 'no' : 'yes', skip ? 'yes' : 'no', source, userId]);
  await audit(userId, 'skip_tech_stack', `screening=${id} skip=${skip ? 'yes' : 'no'} from ${source}`);
  return { changed: true };
}

/** Everything the page needs for step 2: tags with reasons, the 5 matches with scores, and the confirmed selection. */
async function matchingFor(id: number) {
  const s = (await query<any>(
    `SELECT s.verdict, s.status, s.continued_at, s.tagging_status, s.tagging_error_message, s.tagged_at, s.selection_confirmed_at, s.job_needs, s.matching_order, s.skip_tech_stack, u.name AS confirmed_by,
       EXISTS(SELECT 1 FROM proposals p WHERE p.screening_id=s.id) AS has_proposal
     FROM screenings s LEFT JOIN users u ON u.id=s.selection_confirmed_by WHERE s.id=?`, [id]))[0];
  if (!s) return null;
  const pp = (await query<any>(
    `SELECT s.proposal_profile_id AS id, pr.name, pr.tagline, pr.price, pr.gitlab_account, pr.profile_url, s.proposal_profile_confirmed_at AS confirmed_at, u.name AS confirmed_by
     FROM screenings s LEFT JOIN upwork_profiles pr ON pr.id=s.proposal_profile_id LEFT JOIN users u ON u.id=s.proposal_profile_confirmed_by WHERE s.id=?`, [id]))[0];
  const base = { continued: !!s.continued_at, continued_at: s.continued_at, status: s.tagging_status as string | null, error: s.tagging_error_message as string | null,
    tags: [] as any[], matches: [] as any[], confirmed_at: s.selection_confirmed_at as string | null, confirmed_by: s.confirmed_by as string | null,
    proposal_profile: pp && pp.id ? { id: pp.id, name: pp.name, tagline: pp.tagline, price: pp.price, gitlab_account: pp.gitlab_account, profile_url: pp.profile_url, confirmed_at: pp.confirmed_at, confirmed_by: pp.confirmed_by } : null,
    profiles: [] as any[], job_needs: s.job_needs as string | null, order: s.matching_order as string | null,
    skip_tech_stack: !!s.skip_tech_stack, has_proposal: !!s.has_proposal };
  if (s.tagging_status !== 'done') return base;
  base.tags = await query(
    `SELECT jt.tag_id AS id, jt.tag_name AS name, jt.category_name AS category, jt.weight, jt.reason, jt.core_rank, COALESCE(c.is_compliance, 0) AS compliance, (SELECT practice FROM tags WHERE id=jt.tag_id) AS practice FROM job_tags jt LEFT JOIN tag_categories c ON c.name=jt.category_name
     WHERE jt.screening_id=? ORDER BY COALESCE(c.sort_order, 999), jt.weight DESC, jt.tag_name`, [id]);
  const rows = await query<any>('SELECT project_id, project_name, rank_no, score, max_score, compliance_gap, recommended, shared_tags, selected, pool, alternative, platform, proves_work, named_in_screening, extra, ai_reason, ai_fits, added FROM job_matches WHERE screening_id=? ORDER BY rank_no', [id]);
  base.matches = rows.map((r) => ({
    project_id: r.project_id, project_name: r.project_name, rank: r.rank_no, score: r.score, max_score: r.max_score,
    percent: r.max_score ? Math.round((r.score / r.max_score) * 100) : 0, compliance_gap: r.compliance_gap,
    recommended: !!r.recommended, selected: !!r.selected, shared: JSON.parse(r.shared_tags), pool: r.pool, alternative: !!r.alternative, platform: r.platform,
    proves_work: !!r.proves_work, named_in_screening: !!r.named_in_screening, extra: !!r.extra, ai_reason: r.ai_reason, ai_fits: r.ai_fits == null ? null : !!r.ai_fits, added: !!r.added,
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
  if (s.discarded_at && req.user!.role !== 'admin') return void res.status(404).json({ error: 'Not found' }); // discarded: gone for everyone but an admin
  if (s.discarded_by) s.discarded_by_name = (await query<any>('SELECT name FROM users WHERE id=?', [s.discarded_by]))[0]?.name ?? null;
  // R105: whether it counts as an invite, and why (said on the job, or written with the Invite type)
  const inv = (await query<any>(`SELECT ${inviteSql} AS on_, p.template_name LIKE '%Invite%' AS by_type FROM screenings s LEFT JOIN proposals p ON p.screening_id=s.id WHERE s.id=?`, [id]))[0];
  s.invite = !!Number(inv?.on_); s.invite_by_type = s.invited == null && !!Number(inv?.by_type);
  const ov = await query<any>(`SELECT o.id, o.reason, o.verdict_at_time, o.created_at, u.name AS user_name FROM overrides o JOIN users u ON u.id=o.user_id WHERE o.screening_id=?`, [id]);
  res.json({
    screening: { ...s, raw_input: undefined, report_json: undefined, job_description: s.job_text, job_text: undefined, report: s.report_json ? normalizeReport(JSON.parse(s.report_json)) : null,
      posting_json: undefined, posting: s.posting_json ? JSON.parse(s.posting_json) : null, gate_rules: s.gate_rules ? JSON.parse(s.gate_rules) : null,
      fit_reasons_json: undefined, fit_reasons: readFitReasons(s.fit_reasons_json),
      // R99: how long the screening has been going, for its loading screen
      ...(s.status === 'queued' || s.status === 'running' ? { run_elapsed_seconds: Number((await query<any>('SELECT TIMESTAMPDIFF(SECOND, COALESCE(started_at, created_at), NOW()) AS d FROM screenings WHERE id=?', [id]))[0]?.d ?? 0) } : {}),
      // R97: while auto mode runs, how long it has been going and how long a job in auto mode usually takes, paste to proposal
      ...(Number(s.auto_mode) && s.auto_state === 'running' ? {
        auto_elapsed_seconds: Number((await query<any>('SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS d FROM screenings WHERE id=?', [id]))[0]?.d ?? 0),
        auto_typical_seconds: Number((await query<any>(`SELECT ROUND(AVG(d)) AS t FROM (SELECT TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at) AS d FROM screenings s JOIN proposals p ON p.screening_id=s.id
          WHERE s.auto_mode=1 AND s.auto_state='done' AND p.finished_at IS NOT NULL ORDER BY s.id DESC LIMIT 20) x WHERE d BETWEEN 30 AND 3600`))[0]?.t) || null } : {}) },
    override: ov[0] ?? null,
    client: await clientView(req, id), // R106: a client we have seen before
    matching: await matchingFor(id),
    proposal: await proposalFor(id),
    attachments: await attachmentList(id),
  });
});

// ---------- R106 (Hamza): returning clients ----------
/** A job's client for the person looking: everyone sees that the client is known and how those jobs went; a job opens only if they may see it. */
async function clientView(req: any, id: number) {
  const c = await clientFor(id); if (!c) return null;
  const all = canSeeAll(req.user.role);
  return { ...c, jobs: c.jobs.map((j: any) => ({ ...j, can_open: all || (j.user_id ?? null) === req.user.id })) };
}
// R107 (Hamza): every client in one place, the returning ones first; no rates, only what happened
api.get('/clients', requireRole(), async (req, res) => {
  const q = z.object({ q: z.string().trim().max(100).optional() }).parse(req.query);
  const like = q.q ? `%${likeEsc(q.q)}%` : null;
  const rows = await query<any>(`SELECT c.id, c.name, c.company, c.contact_name, c.country, c.member_since, c.notes, COUNT(s.id) AS jobs, SUM(${sentSql}) AS sent, SUM(${inviteSql}) AS invites,
      SUM(s.outcome='Hired') AS hired, MIN(s.created_at) AS first_seen, MAX(s.created_at) AS last_seen,
      SUBSTRING_INDEX(GROUP_CONCAT(s.title ORDER BY s.id DESC SEPARATOR '\n'), '\n', 1) AS last_title,
      GROUP_CONCAT(DISTINCT pr.name ORDER BY pr.name SEPARATOR ', ') AS profiles, GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', ') AS people
    FROM clients c JOIN screenings s ON s.client_id=c.id AND s.discarded_at IS NULL JOIN users u ON u.id=s.user_id
      LEFT JOIN upwork_profiles pr ON pr.id=s.upwork_profile_id LEFT JOIN proposals p ON p.screening_id=s.id
    WHERE c.merged_into IS NULL ${like ? 'AND (c.name LIKE ? OR c.company LIKE ? OR c.contact_name LIKE ? OR c.country LIKE ? OR c.notes LIKE ? OR s.title LIKE ?)' : ''}
    GROUP BY c.id ORDER BY COUNT(s.id) > 1 DESC, MAX(s.created_at) DESC LIMIT 2000`, like ? [like, like, like, like, like, like] : []);
  res.json({ clients: rows.map((r) => ({ ...r, jobs: Number(r.jobs), sent: Number(r.sent || 0), invites: Number(r.invites || 0), hired: Number(r.hired || 0) })) });
});
api.get('/clients/:id', requireRole(), async (req, res) => {
  let c = await clientProfile(Number(req.params.id));
  if (c?.merged_into) c = await clientProfile(c.merged_into); // a profile merged into another opens that one
  if (!c) return void res.status(404).json({ error: 'Not found' });
  const all = canSeeAll(req.user!.role);
  const jobs = await query<any>(`SELECT s.id, s.user_id, s.title, s.created_at, s.verdict, s.client_match_json, s.client_manual, ${sentSql} AS sent, COALESCE(s.proposal_sent_at, s.proposal_sent_date) AS sent_at,
      ${stageSql} AS stage, ${statusSql} AS current_status, u.name AS user_name, pr.name AS profile_name, p.template_name, ${inviteSql} AS invite, s.budget, s.job_type
    ${listFrom} WHERE s.client_id=? AND s.discarded_at IS NULL ORDER BY s.id DESC`, [c.id]);
  res.json({ client: c, can_fix: all, jobs: jobs.map((j) => { let why = null; try { why = j.client_match_json ? JSON.parse(j.client_match_json) : null; } catch { why = null; }
    return { ...j, client_match_json: undefined, why, manual: !!Number(j.client_manual), sent: !!Number(j.sent), invite: !!Number(j.invite), can_open: all || j.user_id === req.user!.id }; }) });
});
// R107: fixing a match by hand (managers and admins): a job out of its client, or two profiles that are one client
api.post('/screenings/:id/client/separate', requireRole('admin', 'manager'), async (req, res) => {
  const id = Number(req.params.id);
  if (!(await query<any>('SELECT id FROM screenings WHERE id=?', [id])).length) return void res.status(404).json({ error: 'Not found' });
  const clientId = await separateJob(id);
  await audit(req.user!.id, 'client_separate', `screening=${id} client=${clientId}`);
  res.json({ client_id: clientId });
});
api.post('/clients/:id/merge', requireRole('admin', 'manager'), async (req, res) => {
  const b = z.object({ into: z.number().int().positive() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Pick the client to merge into' });
  const from = Number(req.params.id), into = b.data.into;
  if (from === into) return void res.status(400).json({ error: 'That is the same client' });
  const both = await query<any>('SELECT id FROM clients WHERE id IN (?) AND merged_into IS NULL', [[from, into]]);
  if (both.length !== 2) return void res.status(404).json({ error: 'Not found' });
  await mergeClients(from, into);
  await audit(req.user!.id, 'client_merge', `client=${from} into=${into}`);
  res.json({ ok: true, id: into });
});
api.patch('/clients/:id', requireRole(), async (req, res) => {
  const b = z.object({ name: z.string().trim().max(190).nullable().optional(), company: z.string().trim().max(190).nullable().optional(), contact_name: z.string().trim().max(120).nullable().optional(), notes: z.string().trim().max(4000).nullable().optional() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const id = Number(req.params.id);
  if (!(await query<any>('SELECT id FROM clients WHERE id=?', [id])).length) return void res.status(404).json({ error: 'Not found' });
  const sets = Object.entries(b.data).filter(([, v]) => v !== undefined);
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  await exec(`UPDATE clients SET ${sets.map(([k]) => k + '=?').join(', ')} WHERE id=?`, [...sets.map(([, v]) => v || null), id]);
  await audit(req.user!.id, 'client_update', `client=${id} fields=${sets.map(([k]) => k).join(',')}`);
  res.json({ ok: true });
});

/**
 * R99 (Ahmad): what the loading screens show while the AI works, so a wait says what is really being looked at: the rules a screening
 * checks, the tag categories and projects a matching weighs, and how long each step usually takes here (the last 30 of each).
 */
let loaderCache: { at: number; data: unknown } | null = null;
api.get('/loader-facts', requireRole(), async (_req, res) => {
  if (loaderCache && Date.now() - loaderCache.at < 60_000) return void res.json(loaderCache.data);
  const avg = async (sql: string) => Number((await query<any>(`SELECT ROUND(AVG(d)) AS t FROM (${sql}) x WHERE d BETWEEN 3 AND 1800`))[0]?.t) || null;
  const data = {
    rules: (await query<any>("SELECT code, rule FROM rules WHERE active=1 ORDER BY type, CAST(SUBSTRING(code, 2) AS UNSIGNED)")).map((r) => ({ code: r.code, rule: r.rule })),
    categories: (await query<any>('SELECT name FROM tag_categories ORDER BY sort_order, name')).map((r) => r.name as string),
    projects: (await query<any>('SELECT name FROM projects WHERE active=1 ORDER BY name')).map((r) => r.name as string),
    openings: (await query<any>('SELECT name FROM opening_templates WHERE active=1 ORDER BY sort_order, id')).map((r) => r.name as string),
    typical: {
      screening: await avg("SELECT TIMESTAMPDIFF(SECOND, started_at, finished_at) AS d FROM screenings WHERE status='done' AND started_at IS NOT NULL AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 30"),
      matching: await avg('SELECT TIMESTAMPDIFF(SECOND, continued_at, tagged_at) AS d FROM screenings WHERE continued_at IS NOT NULL AND tagged_at > continued_at ORDER BY id DESC LIMIT 30'),
    },
  };
  loaderCache = { at: Date.now(), data };
  res.json(data);
});

// R96: the reasons to continue written from this job's fit summary. A cheap read the decision polls; asking for them queues the
// job for one that has none yet (screened before R96, or its first try failed).
api.get('/screenings/:id/fit-reasons', requireRole(), async (req, res) => {
  const s = (await query<any>('SELECT user_id, fit_reasons_status, fit_reasons_json FROM screenings WHERE id=?', [Number(req.params.id)]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  res.json({ status: s.fit_reasons_status, reasons: readFitReasons(s.fit_reasons_json) });
});
api.post('/screenings/:id/fit-reasons', requireRole(), async (req, res) => {
  const id = Number(req.params.id);
  const s = (await query<any>('SELECT user_id FROM screenings WHERE id=?', [id]))[0];
  if (!s || s.user_id !== req.user!.id) return void res.status(404).json({ error: 'Not found' });
  res.json({ queued: await queueFitReasons(id) });
});

api.post('/screenings/:id/retry', requireRole(), async (req, res) => {
  const id = Number(req.params.id);
  const r = await exec(
    `UPDATE screenings SET status='queued', error_code=NULL, error_message=NULL WHERE id=? AND user_id=? AND status='error'`, [id, req.user!.id]);
  if (!r.affectedRows) return void res.status(409).json({ error: 'Only your own failed screenings can be retried' });
  res.json({ ok: true });
});

// Discard a job (admins only): a test or a mistake. It leaves every list, count, report and export, and Claude cannot see it.
// Nothing is deleted: Restore brings it back exactly as it was.
const discardJob = async (req: any, res: any) => {
  const b = z.object({ reason: z.string().trim().max(300).optional() }).safeParse(req.body ?? {});
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const id = Number(req.params.id);
  const r = await exec('UPDATE screenings SET discarded_at=NOW(), discarded_by=?, discard_reason=? WHERE id=? AND discarded_at IS NULL', [req.user!.id, b.data.reason || null, id]);
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found, or already discarded' });
  await audit(req.user!.id, 'job_discard', `screening=${id}${b.data.reason ? ' reason=' + b.data.reason : ''}`);
  res.json({ ok: true });
};
api.post('/admin/screenings/:id/discard', requireRole('admin'), discardJob);
api.post('/plugin/jobs/:id/discard', requireRole('admin'), discardJob); // R121: Claude, for an admin (restorable in the app)
// R94 (Ahmad): discard many jobs at once, for clearing out the first test jobs. Only the main admin. Each is discarded exactly as
// one at a time would be: nothing is deleted, each can be restored, and the audit log names every job.
api.post('/admin/screenings/discard-many', requireRole('admin'), async (req, res) => {
  if ((await mainAdminId()) !== req.user!.id) return void res.status(403).json({ error: 'Only the main admin can discard many jobs at once' });
  const b = z.object({ ids: z.array(z.number().int().positive()).min(1, 'Pick at least one job').max(500, 'At most 500 jobs at once'), reason: z.string().trim().max(300).optional() }).safeParse(req.body ?? {});
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const ids = [...new Set(b.data.ids)];
  const live = (await query<any>('SELECT id FROM screenings WHERE id IN (?) AND discarded_at IS NULL', [ids])).map((r) => Number(r.id));
  if (!live.length) return void res.status(404).json({ error: 'None of those jobs can be discarded (not found, or already discarded)' });
  await exec('UPDATE screenings SET discarded_at=NOW(), discarded_by=?, discard_reason=? WHERE id IN (?) AND discarded_at IS NULL', [req.user!.id, b.data.reason || null, live]);
  for (const id of live) await audit(req.user!.id, 'job_discard', `screening=${id} (with ${live.length - 1} other${live.length === 2 ? '' : 's'})${b.data.reason ? ' reason=' + b.data.reason : ''}`); // one line per job, as one at a time
  res.json({ ok: true, discarded: live.length, skipped: ids.length - live.length });
});
api.post('/admin/screenings/:id/restore', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const r = await exec('UPDATE screenings SET discarded_at=NULL, discarded_by=NULL, discard_reason=NULL WHERE id=? AND discarded_at IS NOT NULL', [id]);
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found, or not discarded' });
  await audit(req.user!.id, 'job_restore', `screening=${id}`);
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
  skip_reason: z.string().trim().max(120).nullable().optional(),
  skip_note: z.string().trim().max(2000).nullable().optional(),
  invited: z.enum(['yes', 'no']).nullable().optional(), // R105
});
const TRACK_KEYS = ['proceeded', 'proposal_sent_date', 'outcome', 'notes', 'connects_spent', 'boost_connects', 'client_viewed', 'client_replied', 'interviewed', 'outcome_reason', 'outcome_note', 'loom_video_id', 'skip_reason', 'skip_note', 'invited'] as const;
/** Every tracked field, so a change can be stored as old value -> new value. */
const TRACKED = [...TRACK_KEYS, 'proposal_sent_at', 'client_viewed_at', 'client_replied_at', 'interviewed_at', 'outcome_at'];
const show = (v: any) => (v == null ? null : v instanceof Date ? v.toLocaleString('sv', { timeZone: 'Asia/Karachi' }) : String(v));
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
api.patch('/screenings/:id/tracking', requireRole(), (req, res) => applyTracking(req, res, req.body, 'tracking form'));
/** The job's tracked details changed: from the app's forms, or from Claude (R121); each change is kept with where it came from. */
async function applyTracking(req: any, res: any, body: unknown, source: string) {
  const b = trackBody.safeParse(body);
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
  // skipping says why: a quick reason from the list, a note, or both
  if (b.data.proceeded === 'no') {
    if (!b.data.skip_reason && !b.data.skip_note) return void res.status(400).json({ error: 'Say why you skip this job: pick a reason or write a note' });
    if (b.data.skip_reason && !cfg['skip.reasons'].includes(b.data.skip_reason)) return void res.status(400).json({ error: 'Pick one of the listed reasons' });
  }
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
  if (becomesSent) { const { recordSent } = await import('./routes_proposals'); await recordSent(id); } // R104
  const after = await trackSnapshot(id);
  await recordChanges(id, before, after, source, req.user!.id);
  // a milestone first set through the form also goes into the status history, like the status button
  const firsts: [string, string, string][] = [['proposal_sent_at', 'Sent', 'proposal_sent_at'], ['client_viewed_at', 'Viewed', 'client_viewed_at'], ['client_replied_at', 'Chat opened', 'client_replied_at'],
    ['interviewed_at', 'Interview', 'interviewed_at'], ['outcome_at', after.outcome ?? '', 'outcome_at']];
  for (const [k, label, col] of firsts) if (label && after[col] && before[k] !== after[k]) {
    await exec('INSERT INTO status_events (screening_id, status, happened_at, user_id, reason, note) VALUES (?,?,?,?,?,?)', [id, label, after[col], req.user!.id, k === 'outcome_at' ? after.outcome_reason : null, k === 'outcome_at' ? after.outcome_note : null]);
  }
  await audit(req.user!.id, source === 'tracking form' ? 'tracking_update' : 'plugin_details', `screening=${id} fields=${Object.keys(b.data).join(',')}`);
  res.json({ ok: true });
}

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
  const r = (await query<any>(`${pluginSelect()} WHERE s.id=? AND s.discarded_at IS NULL`, [id]))[0];
  if (!r || (!canSeeAll(req.user!.role) && r.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  const cur0 = (await query<any>('SELECT v.version_no, v.content_html, v.answers_json FROM proposal_versions v JOIN proposals p ON p.id=v.proposal_id WHERE p.screening_id=? ORDER BY v.version_no DESC LIMIT 1', [id]))[0];
  const cur = cur0 ? { version_no: cur0.version_no, ...separate(cur0.content_html, cur0.answers_json) } : null;
  const events = await query('SELECT status, happened_at, reason, note FROM status_events WHERE screening_id=? ORDER BY happened_at, id', [id]);
  // everything each step saved, so a job left halfway can be continued from where it stopped (in Claude or in the app)
  const s2 = (await query<any>(`SELECT s.proceeded, s.continued_at, s.skip_note, s.skip_tech_stack, s.proposal_rate, s.chosen_template_name, s.loom_video_title, s.selection_confirmed_at, s.proposal_profile_confirmed_at, s.connects_spent, s.boost_connects, s.notes,
      o.reason AS continue_reason, p.template_name, p.finalized_at, (SELECT COUNT(*) FROM proposal_versions v WHERE v.proposal_id=p.id) AS versions
    FROM screenings s LEFT JOIN overrides o ON o.screening_id=s.id LEFT JOIN proposals p ON p.screening_id=s.id WHERE s.id=?`, [id]))[0];
  const tags = await query<any>('SELECT tag_name, category_name, reason, core_rank FROM job_tags WHERE screening_id=? ORDER BY core_rank IS NULL, core_rank, category_name, tag_name', [id]);
  const signals = await query<any>('SELECT signal_number, signal_name, value_name, evidence FROM job_signals WHERE screening_id=? AND is_fallback=0 ORDER BY signal_number', [id]);
  const matches = await query<any>('SELECT project_name, recommended, selected, ai_reason FROM job_matches WHERE screening_id=? ORDER BY rank_no', [id]);
  const done = { decision: !!(s2.continued_at || s2.proceeded), read: tags.length > 0, profile: !!s2.proposal_profile_confirmed_at, projects: !!s2.selection_confirmed_at, type: !!(s2.template_name || s2.chosen_template_name),
    draft: Number(s2.versions) > 0, final: !!s2.finalized_at };
  // the plugin's own order of steps: the first one not done yet is where to continue
  const order: [keyof typeof done, string][] = [['decision', 'the decision (continue or skip)'], ['read', 'reading the job (tags and signals)'], ['profile', 'the profile and rate'], ['projects', 'the projects'],
    ['type', 'the proposal type'], ['draft', 'the Loom video, then the first draft'], ['final', 'the approval of the draft']];
  const next = s2.proceeded === 'no' ? null : order.find(([k]) => !done[k]);
  const rvw = (await query<any>('SELECT review_status, review_json, review_version, review_error, reviewed_at FROM proposals WHERE screening_id=?', [id]))[0];
  // R106: a client we have seen before, so Claude can tell the person before writing
  const cl = await clientFor(id);
  const returning = cl && cl.jobs.length ? { client_id: cl.id, name: cl.name, earlier_jobs: cl.jobs.map((j: any) => ({ id: j.id, title: j.title, screened: j.created_at, by: j.user_name, profile: j.profile_name,
    status: j.outcome || (j.interviewed === 'yes' ? 'Interview' : j.client_replied === 'yes' ? 'Chat opened' : j.client_viewed === 'yes' ? 'Viewed' : j.sent_at ? 'Sent' : j.proceeded === 'no' ? 'Skipped' : j.continued ? 'In progress' : 'Screened'), why: j.why ?? undefined })) } : null;
  res.json({ job: { ...pluginRow(r), returning_client: returning, proposal: cur ? { version: cur.version_no, text: htmlToPlain(cur.html), screening_answers: cur.answers.length ? cur.answers : undefined, finished: !!s2.finalized_at } : null, review: rvw ? reviewOf(rvw) : null, status_history: events,
    saved: { decision: s2.proceeded === 'no' ? { continue: false, reason: s2.skip_note } : s2.continued_at ? { continue: true, reason: s2.continue_reason ?? null } : null,
      tags: tags.map((t) => ({ name: t.tag_name, category: t.category_name, reason: t.reason || undefined, core_rank: t.core_rank ?? undefined })),
      signals: signals.map((g) => ({ signal: `${g.signal_number}. ${g.signal_name}`, value: g.value_name, evidence: g.evidence || undefined })),
      profile: s2.proposal_profile_confirmed_at ? r.profile_name : null, rate: s2.proposal_rate == null ? null : Number(s2.proposal_rate),
      shortlist: matches.map((m) => ({ name: m.project_name, reason: m.ai_reason || undefined, recommended: !!m.recommended, picked: !!m.selected })), picked: s2.selection_confirmed_at ? matches.filter((m) => m.selected).map((m) => m.project_name) : [], skip_tech_stack: !!s2.skip_tech_stack,
      type: s2.template_name ?? s2.chosen_template_name ?? null, loom_video: s2.loom_video_title ?? null, drafts: Number(s2.versions), finished: !!s2.finalized_at,
      connects: s2.connects_spent, boost: s2.boost_connects, notes: s2.notes },
    steps_done: done, continue_from: next ? next[1] : s2.proceeded === 'no' ? 'nothing: this job was skipped' : 'nothing: the proposal is finished. Record what happens on Upwork with update_status.' } });
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
const INCLUDES = ['tags', 'signals', 'flags', 'description', 'proposal', 'history', 'client', 'review', 'feedback', 'experience', 'documents', 'openings', ...DEEP_INCLUDES] as const;
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
      TIMESTAMPDIFF(SECOND, s.created_at, p.finished_at) AS secs_to_proposal, s.notes,
      s.auto_mode, s.auto_state, JSON_EXTRACT(p.review_json, '$.score') AS review_score, p.openings_json, (SELECT name FROM opening_templates WHERE id=p.final_opening_id) AS final_opening_name, p.sent_version_no, ${inviteSql} AS invite,
      (SELECT COUNT(*) FROM proposal_versions pv2 WHERE pv2.proposal_id=p.id) AS versions,
      (SELECT COUNT(*) FROM job_attachments ja WHERE ja.screening_id=s.id) AS docs,
      (SELECT COUNT(*) FROM proposal_gaps g WHERE g.screening_id=s.id AND g.status='yes') AS gaps_yes, (SELECT COUNT(*) FROM proposal_gaps g WHERE g.screening_id=s.id AND g.status='open') AS gaps_open,
      (SELECT COUNT(*) FROM proposal_feedback fb WHERE fb.screening_id=s.id) AS feedback_n
      ${inc.has('flags') || inc.has('description') ? ', s.report_json, s.posting_json, s.job_text' : ''}${inc.has('review') ? ', p.review_json' : ''}
    ${listFrom} ${q.data.after ? and('s.id < ?') : w.sql} ORDER BY s.id DESC LIMIT ?`, [...w.p, ...(q.data.after ? [q.data.after] : []), q.data.limit]);
  const ids = list.map((r) => r.id);
  const group = (rows: any[]) => { const m = new Map<number, any[]>(); for (const r of rows) (m.get(r.screening_id) ?? m.set(r.screening_id, []).get(r.screening_id)!).push(r); return m; };
  const projects = group(ids.length ? await query<any>('SELECT screening_id, project_name FROM job_matches WHERE selected=1 AND screening_id IN (?) ORDER BY rank_no', [ids]) : []);
  const tags = group(ids.length ? await query<any>('SELECT screening_id, tag_name, category_name FROM job_tags WHERE screening_id IN (?) ORDER BY category_name, tag_name', [ids]) : []);
  const signals = group(ids.length && inc.has('signals') ? await query<any>('SELECT screening_id, signal_name, value_name FROM job_signals WHERE is_fallback=0 AND screening_id IN (?) ORDER BY signal_number', [ids]) : []);
  const history = group(ids.length && inc.has('history') ? await query<any>('SELECT screening_id, status, happened_at, reason FROM status_events WHERE screening_id IN (?) ORDER BY happened_at, id', [ids]) : []);
  const proposals = new Map<number, string>();
  if (ids.length) for (const v of await query<any>(`SELECT p.screening_id, v.content_html FROM proposals p JOIN proposal_versions v ON v.proposal_id=p.id
      WHERE p.screening_id IN (?) AND v.version_no=(SELECT MAX(v2.version_no) FROM proposal_versions v2 WHERE v2.proposal_id=p.id)`, [ids])) proposals.set(v.screening_id, splitText(htmlToPlain(v.content_html)).letter.trim());
  const cut = (t: string | null | undefined) => { const x = (t ?? '').trim(); return x.length > q.data.text_chars ? x.slice(0, q.data.text_chars) + ' [cut]' : x; };
  // R82: the feedback, the experience questions and the client's documents, each only when asked for
  const fbs = group(ids.length && inc.has('feedback') ? await query<any>('SELECT screening_id, category, feedback, excerpt, version_no FROM proposal_feedback WHERE screening_id IN (?) ORDER BY id', [ids]) : []);
  const gapRows = group(ids.length && inc.has('experience') ? await query<any>(`SELECT g.screening_id, g.skill, g.ask, g.status, g.note, (SELECT GROUP_CONCAT(pr.name SEPARATOR ', ') FROM proposal_gap_projects gp JOIN projects pr ON pr.id=gp.project_id WHERE gp.gap_id=g.id) AS projects
    FROM proposal_gaps g WHERE g.screening_id IN (?) ORDER BY g.id`, [ids]) : []);
  // R114: the rest of what Upwork Pro keeps (deepdata.ts): small facts on every row, the heavier details when asked for
  const facts = await cheapFacts(ids);
  const deepWhen: (v: any) => string | null = (v) => (!v ? null : String(v).length <= 10 ? String(v) : fromDb(String(v), (req as any).zone ?? DB_ZONE).slice(0, 16));
  const deep = await deepDetails(ids, inc, deepWhen);
  const docRows = group(ids.length && inc.has('documents') ? await query<any>(`SELECT screening_id, file_name, kind, text_content FROM job_attachments WHERE status='done' AND screening_id IN (?) ORDER BY id`, [ids]) : []);
  const review = (r: any) => { try { const v = JSON.parse(r.review_json || 'null'); return v ? `${v.score}/10: ${v.verdict ?? ''}${(v.suggestions ?? []).length ? ' | Suggestions: ' + v.suggestions.map((x: any) => x.title).join('; ') : ''}${(v.problems ?? []).length ? ' | Hurts it: ' + v.problems.join('; ') : ''}` : null; } catch { return null; } };
  const openingsOf = (r: any) => { try { const o = JSON.parse(r.openings_json || 'null'); return o?.items?.length ? o.items.map((x: any, i: number) => `${x.style || 'Opening ' + (i + 1)}${o.used === i ? ' (used)' : ''}: ${x.text}`).join(' || ') : null; } catch { return null; } };
  // every time in the rows is on the clock of the zone the days are counted in (said in the answer); a date without a time stays a date
  const tzone: string = (req as any).zone ?? DB_ZONE;
  const yes = (v: any) => (v === 'yes' ? 1 : 0), when = (v: any) => (!v ? null : String(v).length <= 10 ? String(v) : fromDb(String(v), tzone).slice(0, 16));
  const columns = ['id', 'screened', 'person', 'profile', 'written_in', 'title', 'stage', 'gate_result', 'rule_codes', 'continued', 'continued_past', 'proposal_type', 'type_chosen', 'projects', 'industry',
    'proposal_words', 'loom_video', 'connects', 'boost', 'invite', 'sent_at', 'viewed', 'viewed_at', 'chat_opened', 'chat_at', 'interview', 'interview_at', 'outcome', 'outcome_at', 'loss_reason',
    'client_country', 'budget', 'job_type', 'experience_level', 'secs_to_proposal',
    'mode', 'review_score', 'opening_sent', 'versions', 'documents', 'experience_confirmed', 'experience_waiting', 'feedback_count',
    'skip_reason', 'job_needs', 'core_work', 'type_suggested', 'version_sent', 'ai_calls', 'ai_seconds',
    ...(inc.has('client') ? ['hire_rate', 'total_spent', 'payment_verified', 'client_rating', 'avg_hourly_paid', 'proposals_on_job', 'posted'] : []),
    ...(inc.has('tags') ? ['tags'] : []), ...(inc.has('signals') ? ['signals'] : []), ...(inc.has('flags') ? ['flags'] : []), ...(inc.has('history') ? ['status_history', 'continue_reason', 'outcome_note', 'notes'] : []),
    ...(inc.has('description') ? ['description'] : []), ...(inc.has('proposal') ? ['proposal'] : []),
    ...(inc.has('review') ? ['review'] : []), ...(inc.has('feedback') ? ['feedback'] : []), ...(inc.has('experience') ? ['experience'] : []), ...(inc.has('documents') ? ['documents'] : []), ...(inc.has('openings') ? ['openings'] : []),
    ...DEEP_INCLUDES.filter((k) => inc.has(k)).map((k) => ({ gate: 'gate_notes', shortlist: 'project_shortlist', types: 'type_ranking', chats: 'ai_chats', ai: 'ai_steps', changes: 'field_changes', reviews: 'all_reviews' } as Record<string, string>)[k])];
  const rows = list.map((r) => {
    const t = tags.get(r.id) ?? [], prop = proposals.get(r.id) ?? '';
    let rep: any = null, post: any = null;
    if (inc.has('flags') || inc.has('description')) { try { rep = r.report_json ? normalizeReport(JSON.parse(r.report_json)).jobs[0] : null; } catch { rep = null; } try { post = r.posting_json ? JSON.parse(r.posting_json) : null; } catch { post = null; } }
    return [r.id, when(r.created_at), r.person, r.profile, r.source === 'claude_plugin' ? 'Claude plugin' : 'Upwork Pro', (r.title ?? '').slice(0, 90), r.stage, r.verdict, r.rule_codes, Number(r.continued), r.continued_past,
      r.template_name, r.template_name ? r.template_choice : null, (projects.get(r.id) ?? []).map((x) => x.project_name).join('; ') || null, t.filter((x) => /^industry$/i.test(x.category_name)).map((x) => x.tag_name).join('; ') || null,
      prop ? prop.split(/\s+/).length : null, r.loom_video_title, r.connects_spent, r.boost_connects, Number(r.invite) ? 1 : 0, when(r.sent_at), yes(r.client_viewed), when(r.client_viewed_at), yes(r.client_replied), when(r.client_replied_at),
      yes(r.interviewed), when(r.interviewed_at), r.outcome, when(r.outcome_at), r.outcome_reason, r.client_country, r.budget, r.job_type, r.experience_level, r.secs_to_proposal,
      Number(r.auto_mode) ? 'auto' + (r.auto_state === 'stopped' ? ' (stopped)' : '') : 'steps', r.review_score == null ? null : Number(r.review_score), openingUsed(r.openings_json, r.final_opening_name),
      Number(r.versions) || null, Number(r.docs) || 0, Number(r.gaps_yes) || 0, Number(r.gaps_open) || 0, Number(r.feedback_n) || 0,
      ...(() => { const x = facts.get(r.id); return [x?.skip ?? null, x?.job_needs ?? null, x?.core_work ?? null, x?.suggested_type ?? null, x?.sent_version ?? null, x?.ai_calls ?? 0, x?.ai_seconds ?? 0]; })(),
      ...(inc.has('client') ? [r.hire_rate, r.total_spent, r.payment_verified, r.client_rating, r.avg_hourly_paid, r.proposals_on_job, r.posted] : []),
      ...(inc.has('tags') ? [t.filter((x) => !/^industry$/i.test(x.category_name)).map((x) => x.tag_name).join('; ') || null] : []),
      ...(inc.has('signals') ? [(signals.get(r.id) ?? []).map((x) => `${x.signal_name}: ${x.value_name}`).join('; ') || null] : []),
      ...(inc.has('flags') ? [rep ? [...rep.fails, ...rep.flags].map((x: any) => `${x.code ?? ''} ${x.rule}: ${x.value}`.trim()).join(' | ') || null : null] : []),
      ...(inc.has('history') ? [(history.get(r.id) ?? []).map((x) => `${x.status} ${when(x.happened_at)}${x.reason ? ' (' + x.reason + ')' : ''}`).join('; ') || null, r.continue_reason, r.outcome_note, r.notes] : []),
      ...(inc.has('description') ? [cut(post?.description || r.job_text)] : []), ...(inc.has('proposal') ? [cut(prop) || null] : []),
      ...(inc.has('review') ? [cut(review(r)) || null] : []),
      ...(inc.has('feedback') ? [(fbs.get(r.id) ?? []).map((x) => `[${x.category}, v${x.version_no ?? '-'}] ${x.feedback} (on: "${String(x.excerpt).slice(0, 160)}")`).join(' || ') || null] : []),
      ...(inc.has('experience') ? [(gapRows.get(r.id) ?? []).map((x) => `${x.skill}: ${x.status}${x.projects ? ' in ' + x.projects : ''}${x.note ? ' (' + x.note + ')' : ''}`).join('; ') || null] : []),
      ...(inc.has('documents') ? [cut((docRows.get(r.id) ?? []).map((x) => `[${x.file_name}] ${x.text_content}`).join('\n')) || null] : []),
      ...(inc.has('openings') ? [cut(openingsOf(r)) || null] : []),
      ...DEEP_INCLUDES.filter((k) => inc.has(k)).map((k) => { const t = deepText(k, deep.get(r.id)?.[k]); return k === 'chats' || k === 'reviews' ? (t ? cut(t) : null) : t; })];
  });
  const packed = packRows(rows, q.data.budget);
  const last = packed.rows.length ? (packed.rows[packed.rows.length - 1][0] as number) : null;
  const more = packed.more || (list.length === q.data.limit && total > list.length && packed.rows.length === rows.length && rows.length > 0 && (await query<any>(`SELECT 1 ${listFrom} ${and('s.id < ?')} LIMIT 1`, [...w.p, last])).length > 0);
  await audit(req.user!.id, 'analysis_read', `jobs=${packed.rows.length} of ${total} include=${[...inc].join('+') || 'none'}`);
  res.json({ time_zone: tzone, time_zone_name: zoneLabel(tzone), times_note: `Days and times are in ${zoneLabel(tzone)}`, total, returned: packed.rows.length, more, next_after: more ? last : null, columns, rows: packed.rows,
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

/** The Upwork steps in order (an outcome comes after all of them), and the column that records each one after Sent. */
const STEPS = ['Sent', 'Viewed', 'Chat opened', 'Interview'] as const;
const STEP_COLS = ['', 'client_viewed', 'client_replied', 'interviewed'];
const NOT_SENT = 'Not sent';
// One click from the Jobs list: what happened on Upwork, and when (now unless the person changes it). Every change is kept.
const postStatus = async (req: any, res: any) => {
  const cfg = await getSettings(); const outcomes = cfg['tracking.outcomes'];
  const b = z.object({ status: z.string().trim().min(1).max(60), at: z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, 'Pick a date and time').nullish(),
    reason: z.string().trim().max(120).nullish(), note: z.string().trim().max(2000).nullish(),
    connects: z.number().int().min(0).max(1000).nullish(), boost: z.number().int().min(0).max(1000).nullish(), notes: z.string().trim().max(4000).nullish(),
    invited: z.boolean().nullish() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const st = b.data.status === 'Replied' ? 'Chat opened' : b.data.status;
  // the time as the person said it (in their zone; for Claude, the team's working day unless it says otherwise), stored as Pakistan time; none: now
  let at = b.data.at ? convertWall(b.data.at.replace('T', ' ').slice(0, 16) + ':00', req.zone ?? DB_ZONE, DB_ZONE) : wallClock(new Date(), DB_ZONE).slice(0, 16) + ':00';
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
  if (st !== NOT_SENT && !sets[st] && !outcomes.includes(st)) return void res.status(400).json({ error: 'Unknown status' });
  // the Upwork statuses follow the proposal: it must be finished before it is sent, and sent before anything else
  const ph = (await query<any>(`SELECT (${stageSql}) AS stage FROM screenings s LEFT JOIN proposals p ON p.screening_id=s.id WHERE s.id=?`, [id]))[0]?.stage;
  // R124: a send that was taken back ("Not sent") can be recorded again, wherever the job's own steps stand
  const wasSent = st === 'Sent' && !['ready', 'submitted', 'closed'].includes(ph) && (await query<any>(`SELECT 1 FROM status_events WHERE screening_id=? AND status='Sent' LIMIT 1`, [id])).length > 0;
  if (st === 'Sent' && !wasSent && !['ready', 'submitted', 'closed'].includes(ph)) return void res.status(409).json({ error: 'Finish the proposal before marking it as sent' });
  if (st !== 'Sent' && !['submitted', 'closed'].includes(ph)) return void res.status(409).json({ error: 'Mark the proposal as sent first' });
  const before = await trackSnapshot(id);
  // R124 (Hamza): a status picked by mistake can be undone. Picking an earlier step takes back the steps after it (and any outcome);
  // "Not sent" takes back the send itself. Nothing is lost: the old values stay in the job's history and the status history.
  const later = st === NOT_SENT ? 0 : STEPS.indexOf(st as any) >= 0 ? STEPS.indexOf(st as any) + 1 : -1;
  if (later >= 0) {
    if (!b.data.at && st !== NOT_SENT) { // back to a step that already happened, with no time given: it keeps the time it had
      const col = st === 'Sent' ? 'COALESCE(proposal_sent_at, proposal_sent_date)' : `IF(${STEP_COLS[later - 1]}='yes', ${STEP_COLS[later - 1]}_at, NULL)`;
      const had = (await query<any>(`SELECT ${col} AS t FROM screenings WHERE id=?`, [id]))[0]?.t; if (had) at = String(had).slice(0, 19);
    }
    const undo = [`outcome=NULL, outcome_at=NULL, outcome_reason=NULL, outcome_note=NULL`, ...STEP_COLS.slice(Math.max(later, 1)).map((c) => `${c}='no', ${c}_at=NULL`),
      ...(st === NOT_SENT ? [`proposal_sent_date=NULL, proposal_sent_at=NULL`] : [])];
    await exec(`UPDATE screenings SET ${undo.join(', ')}, tracking_updated_at=NOW() WHERE id=?`, [id]);
    if (st === NOT_SENT) await exec('UPDATE proposals SET sent_version_no=NULL WHERE screening_id=?', [id]); // sent again later: that version is recorded
  }
  if (st === NOT_SENT) { /* taken back above */ }
  else if (sets[st]) await exec(`UPDATE screenings SET ${sets[st]}, tracking_updated_at=NOW() WHERE id=?`, [...(st === 'Sent' ? [at, at] : [at]), id]);
  else await exec('UPDATE screenings SET outcome=?, outcome_at=?, outcome_reason=?, outcome_note=?, tracking_updated_at=NOW() WHERE id=?', [st, at, lost ? b.data.reason : null, b.data.note || null, id]);
  // what it cost and any note, when sent along (the plugin records them with the status)
  const more: [string, any][] = [['connects_spent', b.data.connects], ['boost_connects', b.data.boost], ['notes', b.data.notes], ['invited', b.data.invited == null ? null : b.data.invited ? 'yes' : 'no']].filter(([, v]) => v !== undefined && v !== null) as [string, any][];
  if (more.length) await exec(`UPDATE screenings SET ${more.map(([k]) => k + '=?').join(', ')} WHERE id=?`, [...more.map(([, v]) => v), id]);
  if (st === 'Sent') { const { recordSent } = await import('./routes_proposals'); await recordSent(id); } // R104: the version that went out
  await recordChanges(id, before, await trackSnapshot(id), 'status', req.user!.id);
  await exec('INSERT INTO status_events (screening_id, status, happened_at, user_id, reason, note) VALUES (?,?,?,?,?,?)', [id, st, at, req.user!.id, lost ? b.data.reason : null, b.data.note || null]);
  await audit(req.user!.id, 'status_update', `screening=${id} status=${st} at=${at}`);
  res.json({ ok: true });
};
api.post('/screenings/:id/status', requireRole(), postStatus);
api.post('/plugin/jobs/:id/status', requireRole(), postStatus); // the same rules for the Claude plugin
/**
 * R121 (Hamza): Claude corrects a job's details without recording a status again (it checked Upwork against Upwork Pro): Connects,
 * boost, the Loom video, whether it was an invite, and a note added to the job's notes (never replacing them). The app's Edit details,
 * with the same rules; every change is kept in the job's history as made by the Claude plugin.
 */
api.post('/plugin/jobs/:id/details', requireRole(), async (req, res) => {
  const b = z.object({ connects: z.number().int().min(0).max(1000).nullable().optional(), boost: z.number().int().min(0).max(1000).nullable().optional(),
    loom_video: z.string().trim().max(300).nullable().optional(), invited: z.boolean().optional(), add_note: z.string().trim().min(2).max(2000).optional() }).safeParse(req.body ?? {});
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const d = b.data, id = Number(req.params.id);
  const s = (await query<any>('SELECT notes, discarded_at FROM screenings WHERE id=?', [id]))[0];
  if (!s || s.discarded_at) return void res.status(404).json({ error: 'Not found' });
  const patch: Record<string, unknown> = {};
  if (d.connects !== undefined) patch.connects_spent = d.connects;
  if (d.boost !== undefined) patch.boost_connects = d.boost;
  if (d.invited !== undefined) patch.invited = d.invited ? 'yes' : 'no';
  if (d.loom_video !== undefined) {
    if (d.loom_video === null) patch.loom_video_id = null;
    else { const v = (await query<any>('SELECT id FROM loom_videos WHERE title=? ORDER BY active DESC, id DESC LIMIT 1', [d.loom_video]))[0];
      if (!v) return void res.status(400).json({ error: `No Loom video is called "${d.loom_video}". See plugin_options for the titles.` }); patch.loom_video_id = v.id; }
  }
  if (d.add_note) { // added under the notes there, dated and signed, so nothing written before is lost
    const stamp = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    patch.notes = [s.notes, `${stamp}, ${req.user!.name} (Claude): ${d.add_note}`].filter(Boolean).join('\n\n').slice(-4000);
  }
  if (!Object.keys(patch).length) return void res.status(400).json({ error: 'Nothing to change: send connects, boost, loom_video, invited or add_note' });
  return applyTracking(req, res, patch, 'Claude plugin');
});
const getStatus = async (req: any, res: any) => {
  const id = Number(req.params.id);
  const s = (await query<any>(`SELECT s.user_id, ${statusSql} AS current_status, ${stageSql} AS stage FROM screenings s LEFT JOIN proposals p ON p.screening_id=s.id WHERE s.id=?`, [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  const events = await query('SELECT e.status, e.happened_at, e.created_at, e.reason, e.note, u.name AS user_name FROM status_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.screening_id=? ORDER BY e.happened_at DESC, e.id DESC', [id]);
  const cfg = await getSettings();
  // when each step that already happened was recorded, so going back to one keeps its time
  const t = (await query<any>(`SELECT COALESCE(proposal_sent_at, proposal_sent_date) AS sent, IF(client_viewed='yes', client_viewed_at, NULL) AS viewed, IF(client_replied='yes', client_replied_at, NULL) AS chat,
    IF(interviewed='yes', interviewed_at, NULL) AS interview, outcome, outcome_at FROM screenings WHERE id=?`, [id]))[0] ?? {};
  const times: Record<string, string> = {}; for (const [k, v] of [['Sent', t.sent], ['Viewed', t.viewed], ['Chat opened', t.chat], ['Interview', t.interview], [t.outcome, t.outcome_at]]) if (k && v) times[k] = v;
  res.json({ current: s.current_status, stage: s.stage, events, times, choices: s.stage === 'ready' ? ['Sent'] : ['Sent', 'Viewed', 'Chat opened', 'Interview', ...cfg['tracking.outcomes'], ...(s.current_status ? [NOT_SENT] : [])], not_sent: NOT_SENT, loss_outcomes: cfg['tracking.loss_outcomes'], loss_reasons: cfg['tracking.loss_reasons'] });
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
    `UPDATE screenings SET continued_at=NOW(), proceeded='yes', tagging_status=COALESCE(tagging_status, 'queued'), auto_state=IF(auto_mode=1, 'running', auto_state), auto_note=IF(auto_mode=1, NULL, auto_note) WHERE id=? AND continued_at IS NULL`, [s.id]);
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

// "Skip tech stack tags": match this job's projects again without its Tech stack tags (or with them again). The tags stay as they
// are; the worker only scores them again (and the AI orders the new shortlist), so the person confirms the projects again.
api.put('/screenings/:id/skip-tech-stack', requireRole(), async (req, res) => {
  const b = z.object({ skip: z.boolean() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Say whether to skip the tech stack tags' });
  const s = await ownedDone(req, res); if (!s) return;
  const r = await setSkipTechStack(s.id, b.data.skip, 'projects step', req.user!.id);
  if (r.error) return void res.status(409).json({ error: r.error });
  res.json({ ok: true, changed: r.changed });
});

/**
 * R95 (Ahmad): add tags the job has to a project, from the job's Projects step: the compliance tag a project was missing, or any other
 * job tag it really has. It is a change to the library (recorded and revertible like an edit on the Projects page), so every later
 * job benefits. Then the projects are matched again; a confirmed choice is kept. Once a proposal exists its projects stay as they
 * are, so only this project's card is brought up to date.
 */
api.post('/screenings/:id/projects/:pid/tags', requireRole(), async (req, res) => {
  const b = z.object({ tag_ids: z.array(z.number().int().positive()).min(1, 'Tick at least one tag').max(30) }).safeParse(req.body ?? {});
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const id = Number(req.params.id), pid = Number(req.params.pid);
  const s = (await query<any>('SELECT id, user_id, tagging_status, selection_confirmed_at, selection_confirmed_by FROM screenings WHERE id=? AND discarded_at IS NULL', [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'employee' && s.user_id !== req.user!.id) return void res.status(403).json({ error: 'Only the person who submitted this job can add tags from it' });
  if (!['done', 'queued', 'running'].includes(s.tagging_status)) return void res.status(409).json({ error: 'Wait until project matching has finished' }); // R100: also while it is matched again
  const row = (await query<any>('SELECT id, shared_tags, score, compliance_gap FROM job_matches WHERE screening_id=? AND project_id=?', [id, pid]))[0];
  if (!row) return void res.status(404).json({ error: 'That project is not one of this job\'s matches' });
  const jobTags = await query<any>(`SELECT jt.tag_id, jt.tag_name, jt.category_name, jt.weight, jt.core_rank, COALESCE(c.is_compliance, 0) AS compliance FROM job_tags jt
    LEFT JOIN tag_categories c ON c.name=jt.category_name WHERE jt.screening_id=? AND jt.tag_id IN (?)`, [id, b.data.tag_ids]);
  if (jobTags.length !== new Set(b.data.tag_ids).size) return void res.status(400).json({ error: 'Only this job\'s own tags can be added from here' });
  const before = await raw('project', pid); if (!before) return void res.status(404).json({ error: 'That project is no longer in the library' });
  await exec('INSERT IGNORE INTO project_tags (project_id, tag_id) VALUES ?', [jobTags.map((t) => [pid, t.tag_id])]);
  // R102: an industry is the project's industry (the Industries page), which is what matching compares: link it too
  const indNames = jobTags.filter((t) => t.category_name === 'Industry').map((t) => t.tag_name);
  if (indNames.length) { const inds = await query<any>('SELECT id FROM industries WHERE name IN (?)', [indNames]); if (inds.length) await exec('INSERT IGNORE INTO project_industries (project_id, industry_id) VALUES ?', [inds.map((i) => [pid, i.id])]); }
  await recordChange({ userId: req.user!.id, source: 'app', kind: 'project', id: pid, before, after: await raw('project', pid), reason: `Tags added on the Projects step of job #${id}` });
  await audit(req.user!.id, 'project_tags_from_job', `screening=${id} project=${pid} tags=${jobTags.map((t) => t.tag_name).join(', ')}`);
  const hasProposal = (await query<any>('SELECT 1 FROM proposals WHERE screening_id=? LIMIT 1', [id])).length > 0;
  if (hasProposal) { // this card only: the shared tags, the score and the compliance gap
    const shared: any[] = JSON.parse(row.shared_tags || '[]'), have = new Set(shared.map((t) => t.id));
    const added = jobTags.filter((t) => !have.has(t.tag_id) && t.category_name !== 'Industry'); // an industry is the pool, not a shared tag (R102)
    shared.push(...added.map((t) => ({ id: t.tag_id, name: t.tag_name, category: t.category_name, weight: Number(t.weight), compliance: !!Number(t.compliance), core: t.core_rank })));
    if (indNames.length) await exec("UPDATE job_matches SET pool='same' WHERE id=?", [row.id]); // R102
    await exec('UPDATE job_matches SET shared_tags=?, score=score+?, compliance_gap=GREATEST(0, compliance_gap-?) WHERE id=?',
      [JSON.stringify(shared), added.reduce((n, t) => n + Number(t.weight), 0), added.filter((t) => Number(t.compliance)).length, row.id]);
    return void res.json({ ok: true, rematch: false });
  }
  // R100: already being matched again: one more pass when it ends picks these up too (a pass not started yet sees them anyway)
  if (s.tagging_status === 'running') { await exec('UPDATE screenings SET rematch_pending=1 WHERE id=?', [id]); return void res.json({ ok: true, rematch: true }); }
  if (s.tagging_status === 'queued') return void res.json({ ok: true, rematch: true });
  const keep = s.selection_confirmed_at ? JSON.stringify({ ids: (await query<any>('SELECT project_id FROM job_matches WHERE screening_id=? AND selected=1', [id])).map((r) => r.project_id), by: s.selection_confirmed_by, at: s.selection_confirmed_at }) : null;
  await exec(`UPDATE screenings SET rematch_only=1, rematch_keep=?, tagging_status='queued', tagging_error_code=NULL, tagging_error_message=NULL WHERE id=? AND tagging_status='done'`, [keep, id]);
  res.json({ ok: true, rematch: true });
});

// R100 (Ahmad): the right project is not in the list: the next ten best from the library, or one found with the search
api.post('/screenings/:id/matches/more', requireRole(), async (req, res) => {
  const b = z.object({ project_id: z.number().int().positive().optional() }).safeParse(req.body ?? {});
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const id = Number(req.params.id);
  const s = (await query<any>('SELECT user_id, tagging_status FROM screenings WHERE id=? AND discarded_at IS NULL', [id]))[0];
  if (!s || (!canSeeAll(req.user!.role) && s.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  if (s.user_id !== req.user!.id && req.user!.role === 'employee') return void res.status(403).json({ error: 'Only the person who submitted this job can change its projects' });
  if (s.tagging_status !== 'done') return void res.status(409).json({ error: 'Wait until project matching has finished' });
  if (b.data.project_id) {
    const p = (await query<any>('SELECT name FROM projects WHERE id=? AND active=1', [b.data.project_id]))[0];
    if (!p) return void res.status(404).json({ error: 'That project is not in the library, or it is switched off' });
    if ((await query<any>('SELECT 1 FROM job_matches WHERE screening_id=? AND project_id=?', [id, b.data.project_id])).length) return void res.json({ added: 0, already: true });
  }
  const r = await addMatches(id, b.data.project_id ? [b.data.project_id] : null, 10, b.data.project_id ? 'Added from the library search' : null);
  await audit(req.user!.id, 'matches_more', `screening=${id} ${b.data.project_id ? 'project=' + b.data.project_id : 'next ' + r.added}`);
  res.json(r);
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
  await queueParts(s.id); // a written proposal gets only its project blocks redone (PLAN-SPEED point 1)
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
  const before = s.proposal_profile_id ? await sendPartsNow(s.id) : null;
  await exec('UPDATE screenings SET proposal_profile_id=?, upwork_profile_id=?, proposal_profile_confirmed_at=NOW(), proposal_profile_confirmed_by=? WHERE id=?', [prof.id, prof.id, req.user!.id, s.id]);
  // a Loom video belongs to one profile: a video of the profile it was before does not go with the new one
  await exec('UPDATE screenings SET loom_video_id=NULL, loom_video_title=NULL WHERE id=? AND loom_video_id IS NOT NULL AND loom_video_id NOT IN (SELECT id FROM loom_videos WHERE profile_id=?)', [s.id, prof.id]);
  // nothing is written yet: the person chooses the proposal type next (Proposal tab), and that starts the writing
  const existing = (await query<any>('SELECT id, profile_id, status FROM proposals WHERE screening_id=?', [s.id]))[0];
  const started = false;
  await audit(req.user!.id, 'proposal_profile', `screening=${s.id} profile=${prof.id}`);
  // a profile changed after the proposal was written: only the sign off is redone (PLAN-SPEED point 1); the letter stays, and
  // "Write it again" is there for the new profile's voice. Before any proposal, an early draft starts now if none was guessed.
  // R78: a written proposal gets the new sign off (and loses a video of the old profile) where it stands, at once, as no new version
  let updated: string | null = null;
  if (existing) { updated = before ? await applySendParts(s.id, before) : 'offer'; if (updated === 'offer') await queueParts(s.id); }
  else await queueEarlyDraft(s.id).catch(() => undefined);
  res.json({ ok: true, started, needs_rewrite: false, updated });
});

// Continue anyway on FAIL or FLAG: a reason is required and kept.
api.post('/screenings/:id/override', requireRole(), async (req, res) => {
  const minReason = (await getSettings())['override.min_reason'];
  const b = z.object({ reason: z.string().trim().min(minReason, `Give a reason of at least ${minReason} characters`).max(2000), picks: z.array(z.string().trim().min(1).max(160)).max(20).optional() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const id = Number(req.params.id);
  const rows = await query<any>('SELECT user_id, status, verdict FROM screenings WHERE id=?', [id]);
  const s = rows[0];
  if (!s || s.user_id !== req.user!.id) return void res.status(404).json({ error: 'Not found' });
  if (s.status !== 'done' || (s.verdict !== 'FAIL' && s.verdict !== 'FLAG')) {
    return void res.status(409).json({ error: 'Only a finished FAIL or FLAG screening needs an override' });
  }
  try {
    // the quick reasons picked, kept as a list so the Flag review can count them per rule (else found in the text)
    const picks = b.data.picks ?? picksOf(null, b.data.reason, (await getSettings())['override.reasons']);
    await exec('INSERT INTO overrides (screening_id, user_id, verdict_at_time, reason, reason_picks) VALUES (?,?,?,?,?)', [id, req.user!.id, s.verdict, b.data.reason, picks.length ? JSON.stringify(picks) : null]);
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') return void res.status(409).json({ error: 'Already continued with a reason' });
    throw e;
  }
  await exec(`UPDATE screenings SET proceeded='yes', continued_at=COALESCE(continued_at, NOW()), tagging_status=COALESCE(tagging_status, 'queued'), auto_state=IF(auto_mode=1, 'running', auto_state), auto_note=IF(auto_mode=1, NULL, auto_note) WHERE id=?`, [id]);
  await audit(req.user!.id, 'override', `screening=${id} verdict=${s.verdict}`);
  res.status(201).json({ ok: true });
});

// ---------- admin: users ----------
const admin = requireRole('admin');
/** The main admin: the first admin account there is (the one made when Upwork Pro was set up). Only that person can change it. */
const mainAdminId = async (): Promise<number | null> => (await query<any>("SELECT MIN(id) AS id FROM users WHERE role='admin'"))[0]?.id ?? null;
api.get('/admin/users', admin, async (req, res) => {
  const main = await mainAdminId();
  res.json({ main_admin_id: main, i_am_main: main === req.user!.id, users: (await query<any>('SELECT id, name, email, role, active, created_at, IF(avatar IS NULL, NULL, avatar_v) AS avatar_v FROM users ORDER BY id')).map((u) => ({ ...u, main: u.id === main })) });
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
    await audit(req.user!.id, 'user_create', `${b.data.name ?? ''} (id ${r.insertId})`, diff(null, await snapshot('users', r.insertId)));
    res.status(201).json({ id: r.insertId });
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') return void res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});
api.patch('/admin/users/:id', admin, async (req, res) => {
  const id = Number(req.params.id);
  const before = await snapshot('users', id);
  const b = z.object({
    role: z.enum(['admin', 'manager', 'employee']).optional(), active: z.boolean().optional(),
    password: z.string().min(10).max(200).optional(),
  }).safeParse(req.body);
  if (!b.success) return void res.status(400).json(wrap(b.error));
  if (id === req.user!.id && (b.data.active === false || (b.data.role && b.data.role !== 'admin'))) {
    return void res.status(400).json({ error: 'You cannot demote or disable your own account' });
  }
  // the main admin's role, status and password are theirs alone: no other admin can change them
  if (id === (await mainAdminId()) && id !== req.user!.id) return void res.status(403).json({ error: 'Only the main admin can change the main admin account' });
  if (id === req.user!.id && b.data.password) return void res.status(400).json({ error: 'Change your own password with Change password (it asks for the current one)' });
  const sets: string[] = []; const p: any[] = [];
  if (b.data.role) { sets.push('role=?'); p.push(b.data.role); }
  if (b.data.active !== undefined) { sets.push('active=?'); p.push(b.data.active ? 1 : 0); }
  if (b.data.password) { sets.push('password_hash=?'); p.push(await hashPassword(b.data.password)); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  const r = await exec(`UPDATE users SET ${sets.join(',')} WHERE id=?`, [...p, id]);
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  if (b.data.active === false || b.data.password) await exec('DELETE FROM sessions WHERE user_id=?', [id]);
  { const after = await snapshot('users', id); await audit(req.user!.id, 'user_update', `${after?.name ?? ''} (id ${id})`, diff(before, after)); }
  res.json({ ok: true });
});

// ---------- admin: changes to the setup, to review and put back ----------
// Every admin sees the list. Only the main admin marks a change as seen or puts one back.
api.get('/admin/changes', admin, async (req, res) => {
  const f = z.object({ kind: z.string().max(40).optional(), user: z.coerce.number().int().positive().optional(), source: z.enum(['app', 'claude_plugin']).optional(),
    status: z.enum(['review', 'applied', 'reverted']).optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    q: z.string().trim().max(100).optional(), entity_id: z.string().max(80).optional(), page: z.coerce.number().int().min(1).default(1) }).safeParse(req.query);
  if (!f.success) return void res.status(400).json({ error: f.error.issues[0].message });
  const d = f.data, where: string[] = [], p: any[] = [];
  if (d.kind) { where.push('c.entity=?'); p.push(d.kind); } if (d.entity_id) { where.push('c.entity_id=?'); p.push(d.entity_id); }
  if (d.user) { where.push('c.user_id=?'); p.push(d.user); } if (d.source) { where.push('c.source=?'); p.push(d.source); }
  if (d.status === 'review') where.push(`c.needs_review=1 AND c.status='applied'`); else if (d.status) { where.push('c.status=?'); p.push(d.status); }
  { const b = dayBounds(d.from, d.to, (req as any).zone ?? DB_ZONE); if (b.start) { where.push('c.created_at >= ?'); p.push(b.start); } if (b.end) { where.push('c.created_at < ?'); p.push(b.end); } }
  if (d.q) { where.push('(c.entity_name LIKE ? OR c.reason LIKE ?)'); p.push(`%${likeEsc(d.q)}%`, `%${likeEsc(d.q)}%`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = Number((await query<any>(`SELECT COUNT(*) AS n FROM change_sets c ${w}`, p))[0].n);
  const rows = await query<any>(`SELECT c.id, c.user_id, u.name AS user_name, c.source, c.entity, c.entity_id, c.entity_name, c.action, c.changes_json, c.reason, c.status, c.needs_review, c.reviewed_at, ru.name AS reviewed_by_name,
      c.reverted_at, vu.name AS reverted_by_name, c.reverted_by_set, c.reverts_set, c.created_at
    FROM change_sets c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN users ru ON ru.id=c.reviewed_by LEFT JOIN users vu ON vu.id=c.reverted_by ${w} ORDER BY c.id DESC LIMIT ? OFFSET ?`, [...p, ps(req), (d.page - 1) * ps(req)]);
  const main = await mainAdminId();
  res.json({ total, page: d.page, i_am_main: main === req.user!.id, to_review: Number((await query<any>(`SELECT COUNT(*) AS n FROM change_sets WHERE needs_review=1 AND status='applied'`))[0].n),
    kinds: Object.entries(KINDS).map(([k, v]) => ({ key: k, label: v.label })), people: await query('SELECT DISTINCT u.id, u.name FROM change_sets c JOIN users u ON u.id=c.user_id ORDER BY u.name'),
    changes: rows.map((r) => ({ ...r, kind_label: KINDS[r.entity]?.label ?? r.entity, changes: r.changes_json ? JSON.parse(r.changes_json) : [], changes_json: undefined })) });
});
/** How many changes wait for the main admin's look: the number beside "Changes" in the sidebar. */
api.get('/admin/changes/count', admin, async (req, res) => {
  const main = (await mainAdminId()) === req.user!.id;
  res.json({ to_review: main ? Number((await query<any>(`SELECT COUNT(*) AS n FROM change_sets WHERE needs_review=1 AND status='applied'`))[0].n) : 0 });
});
const mainOnly = async (req: any, res: any) => { if ((await mainAdminId()) === req.user.id) return true; res.status(403).json({ error: 'Only the main admin can review changes and put them back' }); return false; };
api.post('/admin/changes/:id/seen', admin, async (req, res) => {
  if (!(await mainOnly(req, res))) return;
  const r = await exec('UPDATE change_sets SET needs_review=0, reviewed_by=?, reviewed_at=NOW() WHERE id=? AND needs_review=1', [req.user!.id, Number(req.params.id)]);
  res.json({ ok: true, changed: r.affectedRows > 0 });
});
api.post('/admin/changes/seen-all', admin, async (req, res) => {
  if (!(await mainOnly(req, res))) return;
  const r = await exec(`UPDATE change_sets SET needs_review=0, reviewed_by=?, reviewed_at=NOW() WHERE needs_review=1`, [req.user!.id]);
  res.json({ ok: true, marked: r.affectedRows });
});
api.post('/admin/changes/:id/revert', admin, async (req, res) => {
  if (!(await mainOnly(req, res))) return;
  const b = z.object({ force: z.boolean().optional() }).safeParse(req.body ?? {});
  try { const r = await revert(Number(req.params.id), req.user!.id, !!b.data?.force); res.json({ ok: true, change_set: r.id, entity: r.entity, name: r.name }); }
  catch (e: any) {
    if (e instanceof ChangedSince) return void res.status(409).json({ error: 'This item was changed again after that change. Putting it back would also undo what came later.', changed_since: e.changes, can_force: true });
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    throw e;
  }
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
  const prev = (await query<any>('SELECT content FROM skill_versions WHERE version<? ORDER BY version DESC LIMIT 1', [next]))[0]?.content ?? null;
  await audit(req.user!.id, 'skill_save', `version ${next}${b.data.change_note ? ': ' + b.data.change_note : ''}`, diff({ instructions: prev }, { instructions: b.data.content }));
  res.status(201).json({ id: r.insertId, version: Number(next) });
});
api.post('/admin/skill/:id/activate', admin, async (req, res) => {
  const id = Number(req.params.id);
  if (!(await query('SELECT id FROM skill_versions WHERE id=?', [id])).length) return void res.status(404).json({ error: 'Not found' });
  const was = (await query<any>('SELECT version FROM skill_versions WHERE is_active=1'))[0]?.version ?? null;
  await exec('UPDATE skill_versions SET is_active = (id=?)', [id]);
  const now = (await query<any>('SELECT version FROM skill_versions WHERE id=?', [id]))[0]?.version ?? null;
  await audit(req.user!.id, 'skill_activate', `version ${now}`, diff({ active_version: was == null ? null : String(was) }, { active_version: now == null ? null : String(now) }));
  res.json({ ok: true });
});
// The full text the model gets for a job: these instructions, the active rules and the fixed output format.
api.post('/admin/skill/preview', admin, async (req, res) => {
  const b = skillBody.pick({ content: true }).safeParse(req.body);
  if (!b.success) return void res.status(400).json(wrap(b.error));
  const ctx = await loadContext();
  await getSettings(); // the company name in the prompt
  res.json({ prompt: gatePrompt(b.data.content, ctx.rules, ctx.projects), rules: ctx.rules.length, projects: ctx.projects.length });
});
// Dry run of draft text against sample job text. Nothing is saved.
api.post('/admin/skill/test', admin, async (req, res) => {
  const b = skillBody.pick({ content: true }).extend({ sample: z.string().min(120).max(60_000) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json(wrap(b.error));
  try {
    await getSettings(); // the company name in the prompt
    res.json({ report: normalizeReport(await withCallContext({ kind: 'gate_test' }, async () => screenJobText(b.data.sample, b.data.content, await loadContext()))) });
  } catch {
    res.status(502).json({ error: 'The test run failed. Check the AI service settings.' });
  }
});

// ---------- logs: who did what (audit), and every model call (llm_calls) ----------
const logDates = (col: string, f: { from?: string; to?: string }, where: string[], p: any[], zone = DB_ZONE) => {
  const b = dayBounds(f.from, f.to, zone); // the person's days
  if (b.start) { where.push(`${col} >= ?`); p.push(b.start); }
  if (b.end) { where.push(`${col} < ?`); p.push(b.end); }
};
api.get('/admin/audit', admin, async (req, res) => {
  const f = z.object({ page: z.coerce.number().int().min(1).default(1), action: z.string().max(40).optional(), user: z.coerce.number().int().positive().optional(),
    from: day.optional(), to: day.optional(), q: z.string().trim().max(100).optional() }).parse(req.query);
  const where: string[] = []; const p: any[] = [];
  if (f.action) { where.push('a.action=?'); p.push(f.action); }
  if (f.user) { where.push('a.user_id=?'); p.push(f.user); }
  if (f.q) { where.push('a.detail LIKE ?'); p.push(`%${likeEsc(f.q)}%`); }
  logDates('a.created_at', f, where, p, (req as any).zone);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = Number((await query<any>(`SELECT COUNT(*) AS n FROM audit_log a ${w}`, p))[0].n);
  const pages = Math.max(1, Math.ceil(total / ps(req)));
  const page = Math.min(f.page, pages);
  const log = await query(
    `SELECT a.id, a.action, a.detail, a.changes, a.created_at, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [...p, ps(req), (page - 1) * ps(req)]);
  const actions = (await query<any>('SELECT DISTINCT action FROM audit_log ORDER BY action')).map((r) => r.action);
  res.json({ log, total, page, pages, page_size: ps(req), actions });
});
api.get('/admin/calls', admin, async (req, res) => {
  const f = z.object({ page: z.coerce.number().int().min(1).default(1), kind: z.string().max(30).optional(), ok: z.enum(['0', '1']).optional(),
    model: z.string().max(80).optional(), from: day.optional(), to: day.optional(), job: z.coerce.number().int().positive().optional() }).parse(req.query);
  const where: string[] = []; const p: any[] = [];
  if (f.kind) { where.push('c.kind=?'); p.push(f.kind); }
  if (f.ok) { where.push('c.ok=?'); p.push(Number(f.ok)); }
  if (f.model) { where.push('c.model=?'); p.push(f.model); }
  if (f.job) { where.push('c.screening_id=?'); p.push(f.job); }
  logDates('c.created_at', f, where, p, (req as any).zone);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = Number((await query<any>(`SELECT COUNT(*) AS n FROM llm_calls c ${w}`, p))[0].n);
  const pages = Math.max(1, Math.ceil(total / ps(req)));
  const page = Math.min(f.page, pages);
  const calls = await query(`SELECT c.*, s.title FROM llm_calls c LEFT JOIN screenings s ON s.id=c.screening_id ${w} ORDER BY c.id DESC LIMIT ? OFFSET ?`, [...p, ps(req), (page - 1) * ps(req)]);
  const summary = await query<any>(`SELECT c.kind, c.step, c.model, COUNT(*) AS calls, SUM(c.ok=0) AS errors, ROUND(AVG(c.ms)) AS avg_ms, MAX(c.ms) AS max_ms
    FROM llm_calls c ${w} GROUP BY c.kind, c.step, c.model ORDER BY calls DESC`, p);
  const facets = { kinds: (await query<any>('SELECT DISTINCT kind FROM llm_calls ORDER BY kind')).map((r) => r.kind), models: (await query<any>('SELECT DISTINCT model FROM llm_calls WHERE model IS NOT NULL ORDER BY model')).map((r) => r.model) };
  res.json({ calls, total, page, pages, page_size: ps(req), summary: summary.map((r) => ({ ...r, calls: Number(r.calls), errors: Number(r.errors), avg_ms: Number(r.avg_ms) })), ...facets });
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
    const old = (cur as any)[key];
    const v = await setSetting(key, value, req.user!.id);
    const show = (x: any) => (Array.isArray(x) ? x.join('\n') : x == null ? null : String(x));
    await audit(req.user!.id, 'setting_change', `${SETTINGS[key].label ?? key}`, diff({ [key]: show(old) }, { [key]: show(v) }));
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
  for (const r of await query<any>('SELECT rule_codes FROM screenings WHERE rule_codes IS NOT NULL AND discarded_at IS NULL')) {
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
  await audit(req.user!.id, 'rule_add', `${code} ${b.data.rule.slice(0, 200)}`, diff(null, await snapshot('rules', code, 'code')));
  res.status(201).json({ code });
});
api.patch('/admin/rules/:code', admin, async (req, res) => {
  const b = z.object({ rule: z.string().trim().min(5).max(300).optional(), details: ruleDetails, active: z.boolean().optional() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const r = (await query<any>('SELECT code FROM rules WHERE code=?', [req.params.code]))[0];
  if (!r) return void res.status(404).json({ error: 'Not found' });
  const before = await snapshot('rules', r.code, 'code');
  if (b.data.rule !== undefined) await exec('UPDATE rules SET rule=? WHERE code=?', [b.data.rule, r.code]);
  if (b.data.details !== undefined) await exec('UPDATE rules SET details=? WHERE code=?', [b.data.details || null, r.code]);
  if (b.data.active !== undefined) await exec('UPDATE rules SET active=? WHERE code=?', [b.data.active ? 1 : 0, r.code]);
  await audit(req.user!.id, 'rule_change', `${r.code}${b.data.rule !== undefined ? ' reworded' : ''}${b.data.details !== undefined ? ' details' : ''}${b.data.active !== undefined ? (b.data.active ? ' restored' : ' retired') : ''}`, diff(before, await snapshot('rules', r.code, 'code')));
  res.json({ ok: true });
});
