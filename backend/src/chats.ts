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
import { ensureClient } from './clients';
import { audit, exec, query } from './db';
import { inviteSql } from './invite';
import { recordStatus } from './routes';
import { getSettings } from './settings';
import { convertWall, DB_ZONE } from './tz';

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
const LAST = `GREATEST(COALESCE(s.chat_moved_at, ${T0}), IF(s.chat_call_at <= NOW(), s.chat_call_at, ${T0}), COALESCE(s.client_replied_at, ${T0}), COALESCE(s.interviewed_at, ${T0}), COALESCE(s.outcome_at, ${T0}), COALESCE(s.proposal_sent_at, s.proposal_sent_date, ${T0}))`;

/** R153: a call still to come is not a quiet chat: we are waiting for it, not on it. */
const NOT_WAITING = `NOT (s.chat_call_status='set' AND s.chat_call_at >= NOW())`;
/** A call to follow up (at the call stage): no time given yet (chats booked before R153), its time passed with no word on it, it was held (the next step is due), or the client did not join. */
const CALL_TODO = `(s.chat_call_status IS NULL OR s.chat_call_status IN ('held','missed') OR (s.chat_call_status='set' AND s.chat_call_at < NOW()))`;

export const chatFilters = z.object({ stage: z.string().max(200).optional(), quiet: z.enum(['1']).optional(), calls: z.enum(['todo', 'ahead']).optional(), q: z.string().trim().max(120).optional(),
  user: z.string().max(200).optional(), profile: z.string().max(200).optional() });

/** The chats, newest movement first, with the counts for the tabs and the Dashboard. */
export async function listChats(f: z.infer<typeof chatFilters> = {}) {
  const cfg = await getSettings(), lost = cfg['tracking.loss_outcomes'], days = cfg['chats.quiet_days'];
  const where = [IS_CHAT], p: unknown[] = [];
  const many = (v?: string) => (v ? v.split('|').filter(Boolean) : []);
  if (many(f.stage).length) { where.push(`${STAGE} IN (?)`); p.push(lost, many(f.stage)); }
  if (f.quiet) { where.push(`${STAGE} IN (?) AND ${LAST} < NOW() - INTERVAL ? DAY AND ${NOT_WAITING}`); p.push(lost, OPEN, days); }
  if (f.calls) { where.push(`${STAGE}='call' AND ` + (f.calls === 'todo' ? CALL_TODO : `s.chat_call_status='set' AND s.chat_call_at >= NOW()`)); p.push(lost); }
  if (f.q) { where.push('(s.title LIKE ? OR c.contact_name LIKE ? OR c.name LIKE ? OR c.company LIKE ?)'); const l = `%${f.q}%`; p.push(l, l, l, l); }
  if (many(f.user).length) { where.push('s.user_id IN (?)'); p.push(many(f.user).map(Number)); }
  if (many(f.profile).length) { where.push('pr.id IN (?)'); p.push(many(f.profile).map(Number)); }
  const rows = await query<any>(`SELECT s.id, s.title, s.client_id, COALESCE(c.contact_name, c.name) AS client_name, c.company, c.country, s.user_id, u.name AS user_name,
      pr.id AS profile_id, pr.name AS profile_name, ${inviteSql} AS invite, ${STAGE} AS stage, ${LAST} AS last_at, s.chat_note AS note,
      COALESCE(s.client_replied_at, s.proposal_sent_at, s.proposal_sent_date) AS opened_at, s.outcome, s.outcome_reason,
      s.chat_call_at AS call_at, s.chat_call_status AS call_status, s.chat_call_at >= NOW() AS call_ahead,
      ${STAGE} IN ('chat','call','proposal') AND ${LAST} < NOW() - INTERVAL ? DAY AND ${NOT_WAITING} AS quiet
    ${FROM} WHERE ${where.join(' AND ')} ORDER BY quiet DESC, last_at DESC LIMIT 500`, [lost, lost, days, ...p]);
  return { chats: rows.map(({ call_ahead, ...r }) => ({ ...r, invite: !!Number(r.invite), quiet: !!Number(r.quiet), days_still: Math.max(0, Math.floor((Date.now() - new Date(r.last_at).getTime()) / 86_400_000)),
      call_flag: callFlag(r.stage, r.call_status, !!Number(call_ahead)) })),
    ...(await chatCounts()), stages: await stageNames(), quiet_days: days, loss_outcomes: lost, loss_reasons: cfg['tracking.loss_reasons'] };
}

/** R153: where a chat's call stands, while the chat is at the call stage: upcoming, due (did it happen?), held (the next step) or missed. */
export function callFlag(stage: string, status: string | null, ahead: boolean): 'no_time' | 'upcoming' | 'due' | 'held' | 'missed' | null {
  if (stage !== 'call') return null;
  if (!status) return 'no_time';
  if (status === 'set') return ahead ? 'upcoming' : 'due';
  return status === 'held' ? 'held' : 'missed';
}

/** How many chats are at each stage, and how many went quiet: the tabs and the Dashboard's Chats card. */
export async function chatCounts() {
  const cfg = await getSettings(), lost = cfg['tracking.loss_outcomes'], days = cfg['chats.quiet_days'];
  const rows = await query<any>(`SELECT ${STAGE} AS stage, COUNT(*) AS n, SUM(${STAGE} IN ('chat','call','proposal') AND ${LAST} < NOW() - INTERVAL ? DAY AND ${NOT_WAITING}) AS quiet,
      SUM(${CALL_TODO}) AS calls_todo, SUM(s.chat_call_status='set' AND s.chat_call_at >= NOW()) AS calls_ahead
    FROM screenings s LEFT JOIN proposals p ON p.screening_id=s.id WHERE ${IS_CHAT} GROUP BY 1`, [lost, lost, days]);
  const by = Object.fromEntries(CHAT_STAGES.map((k) => [k, 0])) as Record<ChatStage, number>; let quiet = 0, callsTodo = 0, callsAhead = 0;
  for (const r of rows) { by[r.stage as ChatStage] = Number(r.n); quiet += Number(r.quiet || 0); if (r.stage === 'call') { callsTodo = Number(r.calls_todo || 0); callsAhead = Number(r.calls_ahead || 0); } }
  const total = CHAT_STAGES.reduce((n, k) => n + by[k], 0);
  return { counts: { ...by, open: by.chat + by.call + by.proposal, quiet, total, calls_todo: callsTodo, calls_ahead: callsAhead } };
}

/**
 * The client's name and company as Upwork shows them (the person, and the agency or company, which can differ), kept on the client's
 * profile so every job of theirs has them. R150: either one alone is fine; a field not given stays as it is.
 */
export async function setClientName(screeningId: number, user: { id: number }, name: string | null, company?: string | null) {
  if (!name && !company) return;
  const cid = await ensureClient(screeningId); if (!cid) return;
  const set: [string, string][] = [...(name ? [['contact_name', name]] : []), ...(company ? [['company', company]] : [])] as [string, string][], fields = set.map(([k]) => k);
  await exec(`UPDATE clients SET ${fields.map((k) => k + '=?').join(', ')} WHERE id=?`, [...set.map(([, v]) => v), cid]);
  await audit(user.id, 'client_update', `client=${cid} fields=${fields.join(',')}`); // R145: a field a person gave is theirs; the refresh keeps it
}

export const moveBody = z.object({ stage: z.enum(CHAT_STAGES).optional(), note: z.string().trim().max(500).optional(), outcome: z.string().trim().max(60).optional(),
  reason: z.string().trim().max(120).optional(),
  call_at: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/, 'Give the call\'s date and time').optional(), call_status: z.enum(['held', 'missed']).optional(), client_name: z.string().trim().min(2).max(120).refine((v) => /[\p{L}\p{N}]/u.test(v), 'Write a real name').optional(), company: z.string().trim().max(190).refine((v) => /[\p{L}\p{N}]/u.test(v), 'Write a real name').optional() });

/** A chat moved to a stage (or only a note, or the client's name). The job's own status follows, by the same rules as Update status. */
export async function moveChat(id: number, user: { id: number; role: string }, d: z.infer<typeof moveBody>, zone?: string): Promise<{ code: number; error: string } | { ok: true; stage: ChatStage }> {
  const cfg = await getSettings(), lost = cfg['tracking.loss_outcomes'];
  const s = (await query<any>(`SELECT s.id, ${STAGE} AS stage, s.client_replied, s.interviewed, s.outcome, s.chat_stage, s.chat_call_at, s.chat_call_status, s.chat_call_at < NOW() AS call_passed FROM screenings s WHERE s.id=? AND s.discarded_at IS NULL`, [lost, id]))[0];
  if (!s) return { code: 404, error: 'Not found' };
  if (!d.stage && !d.note && !d.client_name && !d.company && !d.call_at && !d.call_status) return { code: 400, error: 'Nothing to change' };
  const cur = s.stage as ChatStage, to = d.stage ?? cur, names = await stageNames();
  // R153: a call is booked for a time, so the chat knows when to ask how it went
  const callAt = d.call_at ? convertWall(d.call_at.replace('T', ' ').slice(0, 16) + ':00', zone ?? DB_ZONE, DB_ZONE) : null;
  if (to === 'call' && cur !== 'call' && !callAt) return { code: 400, error: 'When is the call? Give its date and time.' };
  if ((d.call_at || d.call_status) && to !== 'call') return { code: 400, error: 'A call time or how the call went goes with the call stage' };
  if (d.call_status && !s.chat_call_at && !callAt) return { code: 400, error: 'This chat has no call time yet' };
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
  } else if (d.note || callAt || d.call_status) await exec('UPDATE screenings SET chat_moved_at=NOW(), chat_note=COALESCE(?, chat_note) WHERE id=?', [d.note || null, id]); // a follow up made: it is not quiet any more
  // the call: a new time (booked or moved), or how it went. A new time after a missed call is the rescheduled one
  // moved on from the call stage to Proposal sent or Client agreed after the call's time: the call happened
  const heldByMove = !callAt && !d.call_status && cur === 'call' && (to === 'proposal' || to === 'agreed') && s.chat_call_status === 'set' && !!Number(s.call_passed);
  if (heldByMove) d = { ...d, call_status: 'held' };
  // a time with how it went: a call that already took place (or did not), recorded after the fact
  const what = d.call_status ? 'call_' + d.call_status : callAt ? 'call_set' : null;
  if (callAt) await exec('UPDATE screenings SET chat_call_at=?, chat_call_status=? WHERE id=?', [callAt, d.call_status ?? 'set', id]);
  else if (d.call_status) await exec('UPDATE screenings SET chat_call_status=? WHERE id=?', [d.call_status, id]);
  if (what) await exec('INSERT INTO field_changes (screening_id, field, old_value, new_value, source, user_id) VALUES (?,?,?,?,?,?)',
    [id, 'chat_call', s.chat_call_at ? `${s.chat_call_status} ${String(s.chat_call_at).slice(0, 16)}` : null,
      `${d.call_status ?? 'set'}${callAt ? ' ' + callAt.slice(0, 16) + ' (Pakistan time)' : ''}`, 'chat', user.id]);
  if (to !== cur || d.note || what) await exec('INSERT INTO chat_events (screening_id, stage, note, user_id, what, call_at) VALUES (?,?,?,?,?,?)',
    [id, to, d.note || null, user.id, what, callAt ?? (what ? s.chat_call_at : null)]);
  if (d.client_name || d.company) await setClientName(id, user, d.client_name || null, d.company || null);
  await audit(user.id, 'chat_move', `screening=${id} stage=${to}${to !== cur ? ' from=' + cur : ''}${what ? ' ' + what : ''}${d.client_name ? ' client_name' : ''}`);
  return { ok: true, stage: to };
}

/** One chat's moves, newest first. */
export async function chatEvents(id: number) {
  return query<any>('SELECT e.id, e.stage, e.note, e.what, e.call_at, e.created_at, u.name AS user_name FROM chat_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.screening_id=? ORDER BY e.id DESC LIMIT 100', [id]);
}

export const chats = Router();
const list = async (req: any, res: any) => {
  const f = chatFilters.safeParse(req.query); if (!f.success) return void res.status(400).json({ error: f.error.issues[0].message });
  const r = await listChats(f.data);
  // for Claude: the call's time in the asked zone (the team's working day by default), not the stored Pakistan time
  if (String(req.path).startsWith('/plugin/')) for (const c of r.chats as any[]) if (c.call_at) {
    c.call_time = `${convertWall(String(c.call_at), DB_ZONE, req.zone ?? DB_ZONE).slice(0, 16)} ${req.zoneLabel ?? ''}`.trim();
  }
  res.json(r);
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
// R150 (Hamza): the client's name and company from any job, chat or not; anyone on the team may give them
export const nameBody = z.object({ client_name: z.string().trim().min(2, 'Write the name in full').max(120).refine((v) => /[\p{L}\p{N}]/u.test(v), 'Write a real name').optional(), company: z.string().trim().min(2).max(190).refine((v) => /[\p{L}\p{N}]/u.test(v), 'Write a real name').optional() })
  .refine((b) => b.client_name || b.company, 'Give the person\'s name, the company, or both');
chats.post('/screenings/:id/client-name', requireRole(), async (req, res) => {
  const b = nameBody.safeParse(req.body ?? {}); if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const id = Number(req.params.id);
  if (!(await query<any>('SELECT id FROM screenings WHERE id=? AND discarded_at IS NULL', [id])).length) return void res.status(404).json({ error: 'Not found' });
  await setClientName(id, req.user!, b.data.client_name ?? null, b.data.company ?? null);
  res.json({ ok: true });
});
chats.post('/plugin/chats/:id', requireRole(), move);
