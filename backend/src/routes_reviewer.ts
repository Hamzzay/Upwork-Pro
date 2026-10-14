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
import { reviewInput, reviewWith } from './proposal/pipeline';
import { reviewerSections, DEFAULT_REVIEWER, type ReviewerSections } from './proposal/reviewer';
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
    'facts it reads': Object.entries(s.context).filter(([, on]) => on).map(([k]) => k.replace(/_/g, ' ')).join(', ') || 'none of the optional ones' };
}
const sameSections = (a: ReviewerSections, b: ReviewerSections) => JSON.stringify(reviewerSections.parse(a)) === JSON.stringify(reviewerSections.parse(b));

reviewer.get('/reviewer', anyone, async (_req, res) => {
  const active = await activeReviewer();
  res.json({ versions: await reviewerVersions(), active, defaults: DEFAULT_REVIEWER });
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
