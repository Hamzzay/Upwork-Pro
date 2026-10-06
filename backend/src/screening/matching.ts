/**
 * Project matching, as described in the "How matching works" sheet:
 * - every tag carries a weight (its category's weight; "AI powered" is 0)
 * - a project scores the sum of the weights of the tags it shares with the job
 * - if the job needs a tag from a compliance category, projects missing it are pushed below projects that have it
 * - the top N are shown and the best few recommended; N, the recommended count and the minimum score are admin settings
 * Pure functions: no database, no model.
 */
export interface MatchOptions { shown: number; recommended: number; minScore: number }
export const DEFAULT_MATCH: MatchOptions = { shown: 5, recommended: 2, minScore: 1 };

export interface JobTag { id: number; name: string; category: string; weight: number; compliance?: boolean }
export interface LibProject { id: number; name: string; tagIds: Set<number> }
export interface Match {
  project_id: number; project_name: string; rank: number; score: number; max_score: number;
  compliance_gap: number; recommended: boolean; shared: JobTag[];
}

export function rankProjects(jobTags: JobTag[], projects: LibProject[], o: MatchOptions = DEFAULT_MATCH): Match[] {
  const unique = [...new Map(jobTags.map((t) => [t.id, t])).values()];
  const max = unique.reduce((n, t) => n + t.weight, 0);
  const compliance = unique.filter((t) => t.compliance); // tags from a category marked as a compliance category
  const rows = projects.map((p) => {
    const shared = unique.filter((t) => p.tagIds.has(t.id));
    return { p, shared, score: shared.reduce((n, t) => n + t.weight, 0), gap: compliance.filter((t) => !p.tagIds.has(t.id)).length };
  }).filter((r) => r.score > 0 && r.score >= o.minScore); // a project that shares nothing of value is noise
  rows.sort((a, b) => a.gap - b.gap || b.score - a.score || b.shared.length - a.shared.length || a.p.name.localeCompare(b.p.name));
  return rows.slice(0, o.shown).map((r, i) => ({
    project_id: r.p.id, project_name: r.p.name, rank: i + 1, score: r.score, max_score: max, compliance_gap: r.gap,
    recommended: i < o.recommended, shared: r.shared.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)),
  }));
}

/** The selection rule: between `min` and `max` distinct projects (admin settings), all taken from the matches shown. */
export function validSelection(projectIds: number[], matches: { project_id: number | null }[], min = 2, max = 2): string | null {
  const ids = new Set(projectIds);
  if (ids.size !== projectIds.length) return 'Each project can be chosen once';
  if (ids.size < min || ids.size > max) return min === max ? `Select exactly ${min} project${min === 1 ? '' : 's'}` : `Select ${min} to ${max} projects`;
  const allowed = new Set(matches.map((m) => m.project_id));
  if (![...ids].every((i) => allowed.has(i))) return 'You can only choose from the projects shown';
  return null;
}
