/**
 * Project matching, as described in the "How matching works" sheet:
 * - every tag carries a weight (its category's weight; "AI powered" is 0)
 * - a project scores the sum of the weights of the tags it shares with the job
 * - if the job needs a tag from a compliance category, projects missing it are pushed below projects that have it
 * - the top 5 are shown and the best 2 recommended
 * Pure functions: no database, no model.
 */
export const TOP_N = 5;
export const RECOMMENDED_N = 2;

export interface JobTag { id: number; name: string; category: string; weight: number; compliance?: boolean }
export interface LibProject { id: number; name: string; tagIds: Set<number> }
export interface Match {
  project_id: number; project_name: string; rank: number; score: number; max_score: number;
  compliance_gap: number; recommended: boolean; shared: JobTag[];
}

export function rankProjects(jobTags: JobTag[], projects: LibProject[]): Match[] {
  const unique = [...new Map(jobTags.map((t) => [t.id, t])).values()];
  const max = unique.reduce((n, t) => n + t.weight, 0);
  const compliance = unique.filter((t) => t.compliance); // tags from a category marked as a compliance category
  const rows = projects.map((p) => {
    const shared = unique.filter((t) => p.tagIds.has(t.id));
    return { p, shared, score: shared.reduce((n, t) => n + t.weight, 0), gap: compliance.filter((t) => !p.tagIds.has(t.id)).length };
  }).filter((r) => r.score > 0); // a project that shares nothing of value is noise
  rows.sort((a, b) => a.gap - b.gap || b.score - a.score || b.shared.length - a.shared.length || a.p.name.localeCompare(b.p.name));
  return rows.slice(0, TOP_N).map((r, i) => ({
    project_id: r.p.id, project_name: r.p.name, rank: i + 1, score: r.score, max_score: max, compliance_gap: r.gap,
    recommended: i < RECOMMENDED_N, shared: r.shared.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)),
  }));
}

/** The selection rule: exactly 2 distinct projects, all taken from the matches shown. */
export function validSelection(projectIds: number[], matches: { project_id: number | null }[]): string | null {
  const ids = new Set(projectIds);
  if (ids.size !== RECOMMENDED_N || projectIds.length !== RECOMMENDED_N) return `Select exactly ${RECOMMENDED_N} projects`;
  const allowed = new Set(matches.map((m) => m.project_id));
  if (![...ids].every((i) => allowed.has(i))) return 'You can only choose from the projects shown';
  return null;
}
