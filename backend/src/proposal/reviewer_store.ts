/** The reviewer's versions (reviewer_versions): the active one is what every review uses. Version 1 is the built-in reviewer. */
import { exec, query } from '../db';
import { DEFAULT_REVIEWER, reviewerSections, type ReviewerSections } from './reviewer';

export interface ReviewerVersion { id: number; version: number; sections: ReviewerSections; change_note: string | null; is_active: boolean; created_at: string; created_by: number | null }

/** A stored version's sections; anything missing or broken falls back to the built-in value, so a review always runs. */
export function parseSections(json: string | null | undefined): ReviewerSections {
  let raw: any = {}; try { raw = JSON.parse(json || '{}'); } catch { raw = {}; }
  const merged = { ...DEFAULT_REVIEWER, ...raw, limits: { ...DEFAULT_REVIEWER.limits, ...(raw.limits ?? {}) }, context: { ...DEFAULT_REVIEWER.context, ...(raw.context ?? {}) } };
  const r = reviewerSections.safeParse(merged);
  return r.success ? r.data : DEFAULT_REVIEWER;
}
const row = (r: any): ReviewerVersion => ({ id: r.id, version: Number(r.version), sections: parseSections(r.sections_json), change_note: r.change_note, is_active: !!r.is_active, created_at: r.created_at, created_by: r.created_by });

/** Make sure version 1 exists and one version is active (the first run after migration 039). */
export async function ensureReviewer(): Promise<void> {
  if (!(await query<any>('SELECT id FROM reviewer_versions LIMIT 1')).length) {
    await exec(`INSERT IGNORE INTO reviewer_versions (version, sections_json, change_note, is_active) VALUES (1, ?, 'The reviewer as it was written in code', 1)`, [JSON.stringify(DEFAULT_REVIEWER)]);
  }
  if (!(await query<any>('SELECT id FROM reviewer_versions WHERE is_active=1 LIMIT 1')).length) {
    await exec('UPDATE reviewer_versions SET is_active=1 ORDER BY version DESC LIMIT 1');
  }
}
export async function activeReviewer(): Promise<ReviewerVersion> {
  await ensureReviewer();
  return row((await query<any>('SELECT * FROM reviewer_versions WHERE is_active=1 LIMIT 1'))[0]);
}
export async function reviewerVersions(): Promise<Omit<ReviewerVersion, 'sections'>[]> {
  await ensureReviewer();
  return (await query<any>('SELECT r.id, r.version, r.change_note, r.is_active, r.created_at, r.created_by, u.name AS created_by_name FROM reviewer_versions r LEFT JOIN users u ON u.id=r.created_by ORDER BY r.version DESC'))
    .map((r) => ({ id: r.id, version: Number(r.version), change_note: r.change_note, is_active: !!r.is_active, created_at: r.created_at, created_by: r.created_by, created_by_name: r.created_by_name }));
}
export async function reviewerVersion(id: number): Promise<ReviewerVersion | null> {
  const r = (await query<any>('SELECT * FROM reviewer_versions WHERE id=?', [id]))[0];
  return r ? row(r) : null;
}
export async function saveReviewerVersion(sections: ReviewerSections, note: string | null, userId: number): Promise<{ id: number; version: number }> {
  await ensureReviewer();
  const next = Number((await query<any>('SELECT COALESCE(MAX(version),0)+1 AS v FROM reviewer_versions'))[0].v);
  const r = await exec('INSERT INTO reviewer_versions (version, sections_json, change_note, created_by) VALUES (?,?,?,?)', [next, JSON.stringify(sections), note, userId]);
  return { id: Number(r.insertId), version: next };
}
