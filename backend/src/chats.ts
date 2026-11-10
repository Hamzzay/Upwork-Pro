/**
 * R149 (Hamza): the Chats page. Every job that reached a chat (a proposal that got a chat, and every invite) in one list with the
 * client's name, so the conversations are followed to the end: Chat opened (questions and answers), Call scheduled, Proposal sent,
 * Client agreed, or Lost. The stages the job already tracks are written to the job (Chat opened, Interview, Hired, a lost outcome), so
 * Reports and the Dashboard stay right; only "Proposal sent" lives here. Chats come to the whole team: anyone may see and move any
 * chat, and every move is kept with who made it and a note. A chat that has not moved for some days is flagged.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from './auth';
import { clientPost } from './clients';
import { audit, exec, query } from './db';
import { inviteSql } from './invite';
import { recordStatus } from './routes';
import { getSettings } from './settings';

export const CHAT_STAGES = ['chat', 'call', 'proposal', 'agreed', 'lost'] as const;
export type ChatStage = typeof CHAT_STAGES[number];
const OPEN: ChatStage[] = ['chat', 'call', 'proposal'];

/** The stage names, from Settings (one per stage, in order). */
export async function stageNames(): Promise<Record<ChatStage, string>> {
  const n = (await getSettings())['chats.stage_names'];
  return Object.fromEntries(CHAT_STAGES.map((k, i) => [k, n[i] ?? k])) as Record<ChatStage, string>;
}

const FROM = `FROM screenings s JOIN users u ON u.id=s.user_id LEFT JOIN upwork_profiles pr ON pr.id=COALESCE(s.upwork_profile_id, s.proposal_profile_id)
  LEFT JOIN proposals p ON p.screening_id=s.id LEFT JOIN clients c ON c.id=s.client_id`;
/** A job is a chat once the client replied, when it is an invite that was sent (Upwork opens the chat itself), or once it was moved here. */
const IS_CHAT = `s.discarded_at IS NULL AND (s.client_replied='yes' OR (${inviteSql} AND s.proposal_sent_date IS NOT NULL) OR s.chat_stage IS NOT NULL)`;
/** Its stage: the job's own outcome and steps decide, and "Proposal sent" is the one kept here. Takes the lost outcomes as a parameter. */
const STAGE = `(CASE WHEN s.outcome IN (?) THEN 'lost' WHEN s.outcome='Hired' THEN 'agreed' WHEN s.chat_stage='proposal' THEN 'proposal' WHEN s.interviewed='yes' THEN 'call' ELSE 'chat' END)`;
const T0 = "'2000-01-01'";
/** When it last moved: a move here, or a step or outcome recorded on the job. */
const LAST = `GREATEST(COALESCE(s.chat_moved_at, ${T0}), COALESCE(s.client_replied_at, ${T0}), COALESCE(s.interviewed_at, ${T0}), COALESCE(s.outcome_at, ${T0}), COALESCE(s.proposal_sent_at, s.proposal_sent_date, ${T0}))`;

export const chatFilters = z.object({ stage: z.string().max(200).optional(), quiet: z.enum(['1']).optional(), q: z.string().trim().max(120).optional(),
  user: z.string().max(200).optional(), profile: z.string().max(200).optional() });

/** The chats, newest movement first, with the counts for the tabs and the Dashboard. */
export async function listChats(f: z.infer<typeof chatFilters> = {}) {
  const cfg = await getSettings(), lost = cfg['tracking.loss_outcomes'], days = cfg['chats.quiet_days'];
  const where = [IS_CHAT], p: unknown[] = [];
  const many = (v?: string) => (v ? v.split('|').filter(Boolean) : []);
  if (many(f.stage).length) { where.push(`${STAGE} IN (?)`); p.push(lost, many(f.stage)); }
  if (f.quiet) { where.push(`${STAGE} IN (?) AND ${LAST} < NOW() - INTERVAL ? DAY`); p.push(lost, OPEN, days); }
  if (f.q) { where.push('(s.title LIKE ? OR c.contact_name LIKE ? OR c.name LIKE ? OR c.company LIKE ?)'); const l = `%${f.q}%`; p.push(l, l, l, l); }
  if (many(f.user).length) { where.push('s.user_id IN (?)'); p.push(many(f.user).map(Number)); }
  if (many(f.profile).length) { where.push('pr.id IN (?)'); p.push(many(f.profile).map(Number)); }
  const rows = await query<any>(`SELECT s.id, s.title, s.client_id, COALESCE(c.contact_name, c.name) AS client_name, c.company, c.country, s.user_id, u.name AS user_name,
      pr.id AS profile_id, pr.name AS profile_name, ${inviteSql} AS invite, ${STAGE} AS stage, ${LAST} AS last_at, s.chat_note AS note,
      COALESCE(s.client_replied_at, s.proposal_sent_at, s.proposal_sent_date) AS opened_at, s.outcome, s.outcome_reason,
      ${STAGE} IN ('chat','call','proposal') AND ${LAST} < NOW() - INTERVAL ? DAY AS quiet
    ${FROM} WHERE ${where.join(' AND ')} ORDER BY quiet DESC, last_at DESC LIMIT 500`, [lost, lost, days, ...p]);
  return { chats: rows.map((r) => ({ ...r, invite: !!Number(r.invite), quiet: !!Number(r.quiet), days_still: Math.max(0, Math.floor((Date.now() - new Date(r.last_at).getTime()) / 86_400_000)) })),
    ...(await chatCounts()), stages: await stageNames(), quiet_days: days, loss_outcomes: lost, loss_reasons: cfg['tracking.loss_reasons'] };
}

/** How many chats are at each stage, and how many went quiet: the tabs and the Dashboard's Chats card. */
export async function chatCounts() {
  const cfg = await getSettings(), lost = cfg['tracking.loss_outcomes'], days = cfg['chats.quiet_days'];
  const rows = await query<any>(`SELECT ${STAGE} AS stage, COUNT(*) AS n, SUM(${STAGE} IN ('chat','call','proposal') AND ${LAST} < NOW() - INTERVAL ? DAY) AS quiet
    FROM screenings s LEFT JOIN proposals p ON p.screening_id=s.id WHERE ${IS_CHAT} GROUP BY 1`, [lost, lost, days]);
  const by = Object.fromEntries(CHAT_STAGES.map((k) => [k, 0])) as Record<ChatStage, number>; let quiet = 0;
  for (const r of rows) { by[r.stage as ChatStage] = Number(r.n); quiet += Number(r.quiet || 0); }
  const total = CHAT_STAGES.reduce((n, k) => n + by[k], 0);
  return { counts: { ...by, open: by.chat + by.call + by.proposal, quiet, total } };
}

/** The client's name (and company) as the chat shows it, kept on the client's profile so every job of theirs has it. */
export async function setClientName(screeningId: number, user: { id: number }, name: string, company?: string | null) {
  const s = (await query<any>('SELECT client_id, posting_json, title FROM screenings WHERE id=?', [screeningId]))[0]; if (!s) return;
  let cid: number | null = s.client_id ?? null;
  if (!cid) { // a job with no client profile yet gets one of its own
    let post: any = null; try { post = s.posting_json ? JSON.parse(s.posting_json) : null; } catch { post = null; }
    const cp = clientPost(s.title, post);
    cid = Number((await exec('INSERT INTO clients (country, member_since) VALUES (?,?)', [cp?.country || null, cp?.memberSince || null])).insertId);
    await exec('UPDATE screenings SET client_id=?, client_checked_at=NOW() WHERE id=?', [cid, screeningId]);
  }
  const fields = ['contact_name', ...(company ? ['company'] : [])];
  await exec(`UPDATE clients SET contact_name=?${company ? ', company=?' : ''} WHERE id=?`, [name, ...(company ? [company] : []), cid]);
  await audit(user.id, 'client_update', `client=${cid} fields=${fields.join(',')}`); // R145: a field a person gave is theirs; the refresh keeps it
}

export const moveBody = z.object({ stage: z.enum(CHAT_STAGES).optional(), note: z.string().trim().max(500).optional(), outcome: z.string().trim().max(60).optional(),
  reason: z.string().trim().max(120).optional(), client_name: z.string().trim().min(2).max(120).optional(), company: z.string().trim().max(190).optional() });

/** A chat moved to a stage (or only a note, or the client's name). The job's own status follows, by the same rules as Update status. */
export async function moveChat(id: number, user: { id: number; role: string }, d: z.infer<typeof moveBody>, zone?: string): Promise<{ code: number; error: string } | { ok: true; stage: ChatStage }> {
  const cfg = await getSettings(), lost = cfg['tracking.loss_outcomes'];
  const s = (await query<any>(`SELECT s.id, ${STAGE} AS stage, s.client_replied, s.interviewed, s.outcome, s.chat_stage FROM screenings s WHERE s.id=? AND s.discarded_at IS NULL`, [lost, id]))[0];
  if (!s) return { code: 404, error: 'Not found' };
  if (!d.stage && !d.note && !d.client_name) return { code: 400, error: 'Nothing to change' };
  const cur = s.stage as ChatStage, to = d.stage ?? cur, names = await stageNames();
  if (to !== cur || (to === 'lost' && d.outcome && d.outcome !== s.outcome)) {
    const status = (st: string, extra: Record<string, unknown> = {}) => recordStatus(id, user, { status: st, note: d.note || null, ...extra }, zone, true);
    let r: Awaited<ReturnType<typeof recordStatus>> | null = null;
    if (to === 'chat') r = await status('Chat opened');
    else if (to === 'call') r = await status('Interview');
    else if (to === 'proposal') { if (s.outcome || s.client_replied !== 'yes') r = await status(s.interviewed === 'yes' ? 'Interview' : 'Chat opened'); } // its outcome taken back; the steps stay
    else if (to === 'agreed') r = await status('Hired');
    else { const o = d.outcome || lost[0]; if (!lost.includes(o)) return { code: 400, error: 'Pick one of the lost outcomes' }; r = await status(o, { reason: d.reason }); }
    if (r && 'error' in r) return r;
    await exec('UPDATE screenings SET chat_stage=?, chat_moved_at=NOW(), chat_note=? WHERE id=?', [to, d.note || null, id]);
    await exec('INSERT INTO field_changes (screening_id, field, old_value, new_value, source, user_id) VALUES (?,?,?,?,?,?)', [id, 'chat_stage', names[cur], names[to], 'chat', user.id]);
  } else if (d.note) await exec('UPDATE screenings SET chat_moved_at=NOW(), chat_note=? WHERE id=?', [d.note, id]); // a follow up made: it is not quiet any more
  if (to !== cur || d.note) await exec('INSERT INTO chat_events (screening_id, stage, note, user_id) VALUES (?,?,?,?)', [id, to, d.note || null, user.id]);
  if (d.client_name) await setClientName(id, user, d.client_name, d.company || null);
  await audit(user.id, 'chat_move', `screening=${id} stage=${to}${to !== cur ? ' from=' + cur : ''}${d.client_name ? ' client_name' : ''}`);
  return { ok: true, stage: to };
}

/** One chat's moves, newest first. */
export async function chatEvents(id: number) {
  return query<any>('SELECT e.id, e.stage, e.note, e.created_at, u.name AS user_name FROM chat_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.screening_id=? ORDER BY e.id DESC LIMIT 100', [id]);
}

export const chats = Router();
const list = async (req: any, res: any) => {
  const f = chatFilters.safeParse(req.query); if (!f.success) return void res.status(400).json({ error: f.error.issues[0].message });
  res.json(await listChats(f.data));
};
const move = async (req: any, res: any) => {
  const b = moveBody.safeParse(req.body ?? {}); if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const r = await moveChat(Number(req.params.id), req.user!, b.data, req.zone);
  if ('error' in r) return void res.status(r.code).json({ error: r.error });
  res.json(r);
};
chats.get('/chats', requireRole(), list);
chats.get('/plugin/chats', requireRole(), list); // Claude, for Danyal's sync
chats.get('/chats/:id/events', requireRole(), async (req, res) => { res.json({ events: await chatEvents(Number(req.params.id)) }); });
chats.post('/chats/:id', requireRole(), move);
chats.post('/plugin/chats/:id', requireRole(), move);
