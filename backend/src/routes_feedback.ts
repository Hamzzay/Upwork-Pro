import { DB_ZONE, dayBounds } from './tz';
/**
 * R67: experience gaps (answered on the proposal page) and feedback on proposals (kept with what the proposal was at that moment,
 * read later on the Proposal feedback page and from Claude to find what keeps going wrong).
 */
import { Router } from 'express';
import { z } from 'zod';
import { audit, exec, query } from './db';
import { requireRole } from './auth';
import { answerGaps, answersBody, linkWaiting } from './proposal/gaps';

export const feedback = Router();
const anyone = requireRole();
const canSeeAll = (role: string) => role === 'admin' || role === 'manager';
export const FEEDBACK_CATEGORIES = ['Wrong fact', 'Wrong project', 'Tone', 'Too long', 'Opening', 'Banned phrase', 'Other'];

async function proposalOf(req: any, res: any) {
  const p = (await query<any>('SELECT p.id, p.status, p.screening_id, s.user_id FROM proposals p JOIN screenings s ON s.id=p.screening_id WHERE p.id=?', [Number(req.params.id)]))[0];
  if (!p || (p.user_id !== req.user.id && !canSeeAll(req.user.role))) { res.status(404).json({ error: 'Not found' }); return null; }
  return p;
}

// Answer the gaps: Yes (with the project and how it was used) or No. A Yes updates the proposal (a worker job) and teaches the library.
feedback.post('/proposals/:id/gaps', anyone, async (req, res) => {
  const b = answersBody.safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0]?.message ?? 'Not valid' });
  const p = await proposalOf(req, res); if (!p) return;
  if (p.status !== 'done') return void res.status(409).json({ error: 'Wait until the proposal is written' });
  res.json({ ok: true, ...(await answerGaps(p.id, b.data.answers, req.user!)) });
});

// Feedback on a part of a proposal.
const fbBody = z.object({ excerpt: z.string().trim().min(3, 'Paste the part of the proposal it is about').max(8000), category: z.enum(FEEDBACK_CATEGORIES as [string, ...string[]]),
  feedback: z.string().trim().min(3, 'Say what is wrong with it').max(4000) });
feedback.post('/screenings/:id/feedback', anyone, async (req, res) => {
  const b = fbBody.safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0]?.message ?? 'Not valid' });
  const sid = Number(req.params.id);
  const s = (await query<any>(`SELECT s.id, s.user_id, pr.name AS profile_name FROM screenings s LEFT JOIN upwork_profiles pr ON pr.id=s.proposal_profile_id WHERE s.id=?`, [sid]))[0];
  if (!s || (s.user_id !== req.user!.id && !canSeeAll(req.user!.role))) return void res.status(404).json({ error: 'Not found' });
  const p = (await query<any>(`SELECT p.id, p.template_name, (SELECT MAX(v.version_no) FROM proposal_versions v WHERE v.proposal_id=p.id) AS version FROM proposals p WHERE p.screening_id=?`, [sid]))[0];
  const projects = (await query<any>('SELECT project_name FROM job_matches WHERE screening_id=? AND selected=1 ORDER BY rank_no', [sid])).map((r) => r.project_name).join(', ') || null;
  const r = await exec(`INSERT INTO proposal_feedback (screening_id, proposal_id, version_no, profile_name, template_name, projects, excerpt, category, feedback, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [sid, p?.id ?? null, p?.version ?? null, s.profile_name ?? null, p?.template_name ?? null, projects, b.data.excerpt, b.data.category, b.data.feedback, req.user!.id]);
  await audit(req.user!.id, 'proposal_feedback', `screening=${sid} category=${b.data.category}`);
  res.status(201).json({ id: Number(r.insertId) });
});
feedback.get('/screenings/:id/feedback', anyone, async (req, res) => {
  const sid = Number(req.params.id);
  const s = (await query<any>('SELECT user_id FROM screenings WHERE id=?', [sid]))[0];
  if (!s || (s.user_id !== req.user!.id && !canSeeAll(req.user!.role))) return void res.status(404).json({ error: 'Not found' });
  res.json({ items: await query<any>('SELECT f.id, f.version_no, f.excerpt, f.category, f.feedback, f.created_at, u.name AS user_name FROM proposal_feedback f LEFT JOIN users u ON u.id=f.user_id WHERE f.screening_id=? ORDER BY f.id DESC', [sid]), categories: FEEDBACK_CATEGORIES });
});

/** Every feedback entry, newest first, with filters (the Proposal feedback page and Claude). Employees see their own jobs'. */
export async function feedbackList(user: { id: number; role: string }, q: Record<string, any>, zone = DB_ZONE) {
  const where: string[] = ['s.discarded_at IS NULL'], p: any[] = [];
  if (!canSeeAll(user.role)) { where.push('s.user_id=?'); p.push(user.id); }
  if (q.category) { where.push('f.category=?'); p.push(q.category); }
  if (q.profile) { where.push('f.profile_name=?'); p.push(q.profile); }
  if (q.type) { where.push('f.template_name=?'); p.push(q.type); }
  if (q.person) { where.push('u.name=?'); p.push(q.person); }
  { const b = dayBounds(q.from, q.to, zone); if (b.start) { where.push('f.created_at >= ?'); p.push(b.start); } if (b.end) { where.push('f.created_at < ?'); p.push(b.end); } }
  if (q.q) { where.push('(f.excerpt LIKE ? OR f.feedback LIKE ? OR s.title LIKE ?)'); p.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`); }
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 200)), page = Math.max(1, Number(q.page) || 1); // R140: every note, a page at a time
  const items = await query<any>(`SELECT f.id, f.screening_id, s.title AS job_title, f.version_no, f.profile_name, f.template_name, f.projects, f.excerpt, f.category, f.feedback, f.created_at, u.name AS user_name
    FROM proposal_feedback f JOIN screenings s ON s.id=f.screening_id LEFT JOIN users u ON u.id=f.user_id WHERE ${where.join(' AND ')} ORDER BY f.id DESC LIMIT ? OFFSET ?`, [...p, limit, (page - 1) * limit]);
  const counts = await query<any>(`SELECT f.category, COUNT(*) n FROM proposal_feedback f JOIN screenings s ON s.id=f.screening_id LEFT JOIN users u ON u.id=f.user_id WHERE ${where.join(' AND ')} GROUP BY f.category ORDER BY n DESC`, p);
  const total = counts.reduce((a: number, c: any) => a + Number(c.n), 0);
  return { items, counts, categories: FEEDBACK_CATEGORIES, total, page, more: page * limit < total, ...(page * limit < total ? { next_page: page + 1 } : {}) };
}
feedback.get('/feedback', anyone, async (req, res) => {
  const out: any = await feedbackList(req.user!, req.query as any, (req as any).zone);
  // the experience people confirmed that still waits for the library (an admin adds it with one click)
  if (canSeeAll(req.user!.role)) out.waiting = await query<any>(`SELECT g.id, gp.project_id, g.screening_id, g.skill, g.tag_name, g.note, gp.library, g.answered_at, pr.name AS project_name, u.name AS user_name
    FROM proposal_gap_projects gp JOIN proposal_gaps g ON g.id=gp.gap_id JOIN projects pr ON pr.id=gp.project_id LEFT JOIN users u ON u.id=g.answered_by
    WHERE g.status='yes' AND gp.library IN ('waiting', 'to_add') ORDER BY gp.id DESC LIMIT 200`); // one row per project (R71)
  res.json(out);
});
// The same list for Claude (list_feedback): to review with the person what keeps going wrong. With the confirmed experience too.
feedback.get('/plugin/feedback', anyone, async (req, res) => {
  const out: any = await feedbackList(req.user!, req.query as any, (req as any).zone);
  out.experience_confirmed = await query<any>(`SELECT g.skill, g.ask, g.note, g.library, (SELECT GROUP_CONCAT(pr.name ORDER BY gp.id SEPARATOR ', ') FROM proposal_gap_projects gp JOIN projects pr ON pr.id=gp.project_id WHERE gp.gap_id=g.id) AS project_name, g.screening_id, g.answered_at FROM proposal_gaps g JOIN screenings s ON s.id=g.screening_id
    WHERE g.status='yes' ${canSeeAll(req.user!.role) ? '' : 'AND s.user_id=?'} ORDER BY g.id DESC LIMIT 200`, canSeeAll(req.user!.role) ? [] : [req.user!.id]);
  out.how_to_use = 'Read the feedback by category and find the patterns (the same problem in several proposals). For each pattern say what in the setup causes it and what to change: a project or profile field for a wrong fact, tags for a wrong project, the proposal type, the writing guide or the banned phrases for tone, length and openings, the reviewer for what the review missed. Changing the setup is the setup-admin skill, after a yes.';
  res.json(out);
});
feedback.post('/admin/gaps/:id/link', requireRole('admin'), async (req, res) => {
  const err = await linkWaiting(Number(req.params.id), req.user!, Number(req.body?.project_id) || undefined);
  if (err) return void res.status(409).json({ error: err });
  res.json({ ok: true });
});
