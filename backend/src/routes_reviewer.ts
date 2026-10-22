/**
 * The Reviewer page (R61): full control of the independent proposal reviewer. Everyone signed in can read it; an admin saves a
 * new version (never overwriting), tests a draft on a past proposal, sees the full prompt, and activates a version. Every review
 * from then on, in the app and from Claude, uses the active version. Activating is a change set (changesets.ts), so the main
 * admin can put it back.
 */
import { Router } from 'express';
import { z } from 'zod';
import { audit, exec, query } from './db';
import { requireRole } from './auth';
import { diff } from './changes';
import { withCallContext } from './llm/context';
import { htmlToPlain } from './html';
import { reviewInput, reviewWith } from './proposal/pipeline';
import { reviewerSections, DEFAULT_REVIEWER, REVIEWER_FULL, type ReviewerSections } from './proposal/reviewer';
import { activeReviewer, ensureReviewer, reviewerVersion, reviewerVersions, saveReviewerVersion } from './proposal/reviewer_store';

export const reviewer = Router();
const anyone = requireRole();
const admin = requireRole('admin');
const bad = (res: any, e: z.ZodError) => res.status(400).json({ error: e.issues[0]?.message ?? 'Not valid', field: e.issues[0]?.path.join('.') || undefined });

/** The sections as plain text per field, for the change log: what changed between two versions. */
export function sectionsText(s: ReviewerSections | null): Record<string, string | null> {
  if (!s) return {};
  const l = (xs: string[]) => xs.map((x, i) => `${i + 1}. ${x}`).join('\n') || null;
  return { 'how to review': s.method, 'key concerns': l(s.concerns), dos: l(s.dos), "don'ts": l(s.donts), 'score guide': s.score_guide, 'score limits': l(s.score_limits),
    'how to write the review': s.writing || null, 'how many': `strengths ${s.limits.strengths}, problems ${s.limits.problems}, suggestions ${s.limits.suggestions}`,
    'facts it reads': Object.entries(s.context).filter(([, on]) => on).map(([k]) => k.replace(/_/g, ' ')).join(', ') || 'none of the optional ones',
    criteria: s.criteria.map((c, i) => `${i + 1}. ${c.name} (weight ${c.weight})${c.look_for ? ': ' + c.look_for : ''}${c.high ? ' | high: ' + c.high : ''}${c.low ? ' | low: ' + c.low : ''}`).join('\n') || null,
    caps: s.caps.map((c, i) => `${i + 1}. ${c.rule} (max ${c.max})`).join('\n') || null, 'key points': l(s.key_points),
    'key points by type': s.per_type.filter((t) => t.key_points.length).map((t) => `${t.type}:\n${t.key_points.map((x) => '  - ' + x).join('\n')}`).join('\n') || null,
    examples: s.examples.use ? `used, ${s.examples.per_review} per review` : 'not used', parts: s.parts ? 'opening, body and answers scored apart' : 'one score' };
}
const sameSections = (a: ReviewerSections, b: ReviewerSections) => JSON.stringify(reviewerSections.parse(a)) === JSON.stringify(reviewerSections.parse(b));

reviewer.get('/reviewer', anyone, async (_req, res) => {
  const active = await activeReviewer();
  const types = (await query<any>('SELECT name FROM templates WHERE active=1 ORDER BY priority, name')).map((t) => t.name as string);
  res.json({ versions: await reviewerVersions(), active, defaults: DEFAULT_REVIEWER, full: REVIEWER_FULL, types });
});
reviewer.get('/reviewer/:id', anyone, async (req, res) => {
  const v = await reviewerVersion(Number(req.params.id));
  if (!v) return void res.status(404).json({ error: 'Not found' });
  res.json({ version: v });
});

const saveBody = z.object({ sections: reviewerSections, change_note: z.string().trim().max(250).optional() });
// Saving never overwrites: it makes a new version, used only once it is activated.
reviewer.post('/admin/reviewer', admin, async (req, res) => {
  const b = saveBody.safeParse(req.body); if (!b.success) return void bad(res, b.error);
  const active = await activeReviewer();
  const latest = (await query<any>('SELECT id FROM reviewer_versions ORDER BY version DESC LIMIT 1'))[0];
  const last = latest ? await reviewerVersion(latest.id) : null;
  if (last && sameSections(last.sections, b.data.sections)) return void res.status(400).json({ error: `This is the same as version ${last.version}: nothing to save.` });
  const v = await saveReviewerVersion(b.data.sections, b.data.change_note ?? null, req.user!.id);
  await audit(req.user!.id, 'reviewer_save', `version ${v.version}${b.data.change_note ? ': ' + b.data.change_note : ''}`, diff(sectionsText(active.sections), sectionsText(b.data.sections)));
  res.status(201).json(v);
});
reviewer.post('/admin/reviewer/:id/activate', admin, async (req, res) => {
  const v = await reviewerVersion(Number(req.params.id));
  if (!v) return void res.status(404).json({ error: 'Not found' });
  const was = await activeReviewer();
  if (was.id === v.id) return void res.status(400).json({ error: `Version ${v.version} is already the active one.` });
  await exec('UPDATE reviewer_versions SET is_active = (id=?)', [v.id]);
  await audit(req.user!.id, 'reviewer_activate', `version ${v.version}`, diff({ active_version: String(was.version) }, { active_version: String(v.version) }));
  res.json({ ok: true });
});

/** Jobs with a written proposal, newest first, to try a draft on. */
reviewer.get('/admin/reviewer/jobs', admin, async (_req, res) => {
  await ensureReviewer();
  res.json({ jobs: await query<any>(`SELECT s.id, s.title, p.id AS proposal_id, p.template_name, p.review_json IS NOT NULL AS reviewed,
      (SELECT MAX(v.version_no) FROM proposal_versions v WHERE v.proposal_id=p.id) AS version
    FROM proposals p JOIN screenings s ON s.id=p.screening_id WHERE p.status='done' AND s.discarded_at IS NULL
      AND EXISTS (SELECT 1 FROM proposal_versions v WHERE v.proposal_id=p.id) ORDER BY p.id DESC LIMIT 40`) });
});
const tryBody = z.object({ sections: reviewerSections, screening_id: z.number().int().positive('Pick a job to try it on') });
async function proposalOf(screeningId: number) {
  return (await query<any>(`SELECT id, review_json, review_version, review_reviewer_version FROM proposals WHERE screening_id=? AND status='done'`, [screeningId]))[0] ?? null;
}
// Exactly what the reviewer gets for that job's newest proposal: the sections in the editor, then the fixed format and facts.
reviewer.post('/admin/reviewer/preview', admin, async (req, res) => {
  const b = tryBody.safeParse(req.body); if (!b.success) return void bad(res, b.error);
  const p = await proposalOf(b.data.screening_id);
  if (!p) return void res.status(404).json({ error: 'That job has no written proposal' });
  const input = await reviewInput(p.id, b.data.sections);
  res.json({ system: input.system, prompt: input.prompt, proposal_version: input.version_no });
});
// Run the draft on a past proposal. Nothing is saved; the review it has now is returned beside it to compare.
reviewer.post('/admin/reviewer/test', admin, async (req, res) => {
  const b = tryBody.safeParse(req.body); if (!b.success) return void bad(res, b.error);
  const p = await proposalOf(b.data.screening_id);
  if (!p) return void res.status(404).json({ error: 'That job has no written proposal' });
  try {
    const r = await withCallContext({ kind: 'reviewer_test', screeningId: b.data.screening_id }, () => reviewWith(p.id, b.data.sections));
    let saved: any = null; try { saved = p.review_json ? JSON.parse(p.review_json) : null; } catch { saved = null; }
    res.json({ review: r.review, proposal_version: r.version_no, current: saved ? { ...saved, proposal_version: p.review_version, reviewer_version: p.review_reviewer_version ?? saved.reviewer_version ?? null } : null });
  } catch {
    res.status(502).json({ error: 'The test review failed. Check the AI settings, then try again.' });
  }
});

// ---------- the examples library (R115): proposals with the score Stackup says they deserve, and why ----------
const exampleBody = z.object({ title: z.string().trim().min(3, 'Give the example a title').max(200), score: z.number().int().min(1).max(10),
  why: z.string().trim().min(10, 'Say why it deserves that score').max(4000), template_name: z.string().trim().max(160).nullish().transform((v) => v || null),
  proposal_text: z.string().trim().min(40, 'Paste the proposal').max(30000), job_text: z.string().trim().max(30000).nullish().transform((v) => v || null), active: z.boolean().optional() });
reviewer.get('/reviewer/examples', anyone, async (_req, res) => {
  res.json({ examples: await query<any>(`SELECT x.id, x.template_name, x.title, x.score, x.why, x.proposal_text, x.job_text, x.screening_id, x.active, x.created_at, u.name AS created_by_name
    FROM reviewer_examples x LEFT JOIN users u ON u.id=x.created_by ORDER BY x.active DESC, x.template_name IS NULL, x.template_name, x.score DESC, x.id DESC`) });
});
reviewer.post('/admin/reviewer/examples', admin, async (req, res) => {
  const b = exampleBody.safeParse(req.body); if (!b.success) return void bad(res, b.error);
  const r = await exec('INSERT INTO reviewer_examples (template_name, title, score, why, proposal_text, job_text, created_by) VALUES (?,?,?,?,?,?,?)',
    [b.data.template_name, b.data.title, b.data.score, b.data.why, b.data.proposal_text, b.data.job_text, req.user!.id]);
  await audit(req.user!.id, 'reviewer_example_add', `${b.data.title}: ${b.data.score}/10${b.data.template_name ? ' (' + b.data.template_name + ')' : ''}`);
  res.status(201).json({ id: Number(r.insertId) });
});
/** From a job: its newest proposal (or a chosen version) becomes an example, with the job post beside it. */
reviewer.post('/admin/reviewer/examples/from-job', admin, async (req, res) => {
  const b = z.object({ screening_id: z.number().int().positive(), version_no: z.number().int().positive().optional(), score: z.number().int().min(1).max(10),
    why: z.string().trim().min(10, 'Say why it deserves that score').max(4000), title: z.string().trim().max(200).optional() }).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const p = (await query<any>(`SELECT p.id, p.template_name, s.title, s.job_text, s.raw_input FROM proposals p JOIN screenings s ON s.id=p.screening_id WHERE p.screening_id=?`, [b.data.screening_id]))[0];
  if (!p) return void res.status(404).json({ error: 'That job has no proposal' });
  const v = (await query<any>(`SELECT version_no, content_html FROM proposal_versions WHERE proposal_id=? ${b.data.version_no ? 'AND version_no=?' : ''} ORDER BY version_no DESC LIMIT 1`,
    b.data.version_no ? [p.id, b.data.version_no] : [p.id]))[0];
  if (!v) return void res.status(404).json({ error: 'That version does not exist' });
  const title = b.data.title || `#${b.data.screening_id} ${p.title || 'Untitled'} (v${v.version_no})`;
  const r = await exec('INSERT INTO reviewer_examples (template_name, title, score, why, proposal_text, job_text, screening_id, created_by) VALUES (?,?,?,?,?,?,?,?)',
    [p.template_name, title.slice(0, 200), b.data.score, b.data.why, htmlToPlain(v.content_html), String(p.job_text ?? p.raw_input ?? '').slice(0, 30000), b.data.screening_id, req.user!.id]);
  await audit(req.user!.id, 'reviewer_example_add', `${title}: ${b.data.score}/10`);
  res.status(201).json({ id: Number(r.insertId) });
});
reviewer.patch('/admin/reviewer/examples/:id', admin, async (req, res) => {
  const b = exampleBody.partial().safeParse(req.body); if (!b.success) return void bad(res, b.error);
  const id = Number(req.params.id);
  const before = (await query<any>('SELECT title, score, why, template_name, active FROM reviewer_examples WHERE id=?', [id]))[0];
  if (!before) return void res.status(404).json({ error: 'Not found' });
  const keys = (['title', 'score', 'why', 'template_name', 'proposal_text', 'job_text'] as const).filter((k) => k in b.data);
  const sets = keys.map((k) => `${k}=?`), p: any[] = keys.map((k) => (b.data as any)[k]);
  if (b.data.active !== undefined) { sets.push('active=?'); p.push(b.data.active ? 1 : 0); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  await exec(`UPDATE reviewer_examples SET ${sets.join(',')} WHERE id=?`, [...p, id]);
  const after = (await query<any>('SELECT title, score, why, template_name, active FROM reviewer_examples WHERE id=?', [id]))[0];
  const str = (o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? null : String(v)]));
  await audit(req.user!.id, 'reviewer_example_change', before.title, diff(str(before), str(after)));
  res.json({ ok: true });
});

// ---------- the test bench (R115): a draft on several past proposals at once, beside their live score and what the client did ----------
reviewer.post('/admin/reviewer/bench', admin, async (req, res) => {
  const b = z.object({ sections: reviewerSections, screening_ids: z.array(z.number().int().positive()).max(12).optional(), count: z.number().int().min(1).max(12).default(6) }).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const rows = await query<any>(`SELECT s.id, s.title, p.id AS proposal_id, p.template_name, JSON_EXTRACT(p.review_json, '$.score') AS live_score,
      s.proposal_sent_at IS NOT NULL OR s.proposal_sent_date IS NOT NULL AS sent, s.client_viewed='yes' AS viewed, s.client_replied='yes' AS chat, s.interviewed='yes' AS interview, s.outcome
    FROM proposals p JOIN screenings s ON s.id=p.screening_id WHERE p.status='done' AND s.discarded_at IS NULL AND EXISTS (SELECT 1 FROM proposal_versions v WHERE v.proposal_id=p.id)
      ${b.data.screening_ids?.length ? 'AND s.id IN (?)' : ''} ORDER BY (s.client_viewed='yes') DESC, p.id DESC LIMIT ?`, b.data.screening_ids?.length ? [b.data.screening_ids, 12] : [b.data.count]);
  const out: any[] = [];
  const queue = [...rows];
  const worker = async () => { for (let j = queue.shift(); j; j = queue.shift()) {
    try {
      const r = await withCallContext({ kind: 'reviewer_test', screeningId: j.id }, () => reviewWith(j.proposal_id, b.data.sections));
      out.push({ id: j.id, title: j.title, type: j.template_name, score: r.review.score, weighted: (r.review as any).weighted ?? null, capped_by: (r.review as any).capped_by ?? [], verdict: r.review.verdict,
        criteria: (r.review as any).criteria_scores ?? [], parts: (r.review as any).parts ?? null, live_score: j.live_score == null ? null : Number(j.live_score),
        result: j.outcome ? j.outcome : Number(j.interview) ? 'Interview' : Number(j.chat) ? 'Chat' : Number(j.viewed) ? 'Viewed' : Number(j.sent) ? 'Sent, no view' : 'Not sent' });
    } catch { out.push({ id: j.id, title: j.title, type: j.template_name, error: 'The review failed' }); }
  } };
  await Promise.all([worker(), worker(), worker()]); // three at a time
  out.sort((a, b) => rows.findIndex((x) => x.id === a.id) - rows.findIndex((x) => x.id === b.id));
  const scored = out.filter((x) => x.score != null);
  res.json({ rows: out, average: scored.length ? Math.round((scored.reduce((n, x) => n + x.score, 0) / scored.length) * 10) / 10 : null,
    live_average: scored.filter((x) => x.live_score != null).length ? Math.round((scored.filter((x) => x.live_score != null).reduce((n, x) => n + x.live_score, 0) / scored.filter((x) => x.live_score != null).length) * 10) / 10 : null });
});
