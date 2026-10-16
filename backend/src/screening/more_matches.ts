/**
 * More projects for a job (R100, Ahmad): when the right project is not in the list, the next best ones from the whole library
 * ("Load more"), or any one found with the search. They are scored exactly as the matching scores (shared tags, compliance,
 * industry) and added under "More projects", marked as added by a person, so matching the job again keeps them.
 */
import { exec, query } from '../db';
import { getSettings } from '../settings';
import { loadLibraryProjects, loadRelatedIndustries } from './context';
import { rankProjects, TECH_STACK, type JobTag } from './matching';

export async function jobTagsOf(id: number): Promise<JobTag[]> {
  return (await query<any>(`SELECT jt.tag_id, jt.tag_name, jt.category_name, jt.weight, jt.core_rank, COALESCE(c.is_compliance, 0) AS compliance, COALESCE(t.practice, 0) AS practice FROM job_tags jt
    LEFT JOIN tag_categories c ON c.name=jt.category_name LEFT JOIN tags t ON t.id=jt.tag_id WHERE jt.screening_id=? AND jt.tag_id IS NOT NULL`, [id]))
    .map((r) => ({ id: r.tag_id, name: r.tag_name, category: r.category_name, weight: Number(r.weight), compliance: !!Number(r.compliance), core: r.core_rank ?? null, practice: !!Number(r.practice) }));
}

/** Add projects to the job's list: these ones (projectIds), or else the next `n` best not shown yet. Returns how many were added and how many more there are. */
export async function addMatches(id: number, projectIds: number[] | null, n = 10, reason: string | null = null): Promise<{ added: number; left: number }> {
  const s = (await query<any>('SELECT skip_tech_stack FROM screenings WHERE id=?', [id]))[0]; if (!s) return { added: 0, left: 0 };
  const jobTags = await jobTagsOf(id), lib = await loadLibraryProjects(), related = await loadRelatedIndustries(), cfg = await getSettings();
  const have = new Set((await query<any>('SELECT project_id FROM job_matches WHERE screening_id=? AND project_id IS NOT NULL', [id])).map((r) => Number(r.project_id)));
  const opts = { shown: 100000, recommended: 0, minScore: cfg['matching.min_score'], related, more: 0, skip: s.skip_tech_stack ? [TECH_STACK] : [] };
  const pool = projectIds ? rankProjects(jobTags, lib.filter((p) => projectIds.includes(p.id)), { ...opts, all: true }) : rankProjects(jobTags, lib, opts);
  const fresh = pool.filter((m) => !have.has(m.project_id));
  const take = projectIds ? fresh : fresh.slice(0, n);
  if (take.length) {
    const start = Number((await query<any>('SELECT COALESCE(MAX(rank_no), 0) AS n FROM job_matches WHERE screening_id=?', [id]))[0].n);
    await exec(`INSERT INTO job_matches (screening_id, project_id, project_name, rank_no, score, max_score, compliance_gap, recommended, shared_tags, pool, alternative, platform, proves_work, named_in_screening, extra, ai_reason, ai_fits, added) VALUES ?`,
      [take.map((m, i) => [id, m.project_id, m.project_name, start + i + 1, m.score, m.max_score, m.compliance_gap, 0, JSON.stringify(m.shared), m.pool, 0, m.platform, m.proves_work ? 1 : 0, m.named_in_screening ? 1 : 0, 1, reason, null, 1])]);
  }
  return { added: take.length, left: projectIds ? 0 : Math.max(0, fresh.length - take.length) };
}
