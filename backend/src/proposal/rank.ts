export interface DetectedKey { signal_id: number; value_id: number; is_fallback: boolean }
export type MapRole = 'weight' | 'required' | 'supporting' | 'exclude';
export interface Mapping { signal_id: number; value_id: number | null; weight: number; role?: MapRole; req_group?: number | null }
export interface TemplateRankInput { id: number; name: string; priority: number; is_default?: boolean; mappings: Mapping[] }
export interface Matched { signal_id: number; value_id: number | null; weight: number; role: MapRole }
export interface RankedTemplate { id: number; name: string; score: number; matched: Matched[]; rank: number; qualified: boolean; excluded_by: Matched[]; missing_groups: number }

/**
 * Which proposal type suits the detected signals. A mapping row matches when the job has that signal and either the row names the value
 * or names no value ("any stated value of this signal").
 * - required rows: grouped by req_group; a group is met when any of its rows matches; every group must be met
 * - exclude rows: any match rules the type out
 * - supporting rows: each match adds one; weight rows (the older scoring) add their weight
 * A type qualifies when its required groups are met and nothing excludes it. Qualifying types come first, by priority group
 * (priority / 10, lower first), then score, then priority. When nothing qualifies, the default type (is_default) is chosen.
 * Fully deterministic.
 */
export function rankTemplates(detected: DetectedKey[], templates: TemplateRankInput[]): { ranking: RankedTemplate[]; chosen: RankedTemplate | null; defaulted: boolean } {
  const hit = (m: Mapping) => detected.some((d) => d.signal_id === m.signal_id && (m.value_id === null ? !d.is_fallback : d.value_id === m.value_id));
  const scored = templates.map((t) => {
    const role = (m: Mapping): MapRole => m.role ?? 'weight';
    const asMatched = (m: Mapping): Matched => ({ signal_id: m.signal_id, value_id: m.value_id, weight: m.weight, role: role(m) });
    const groups = new Map<number, boolean>();
    for (const m of t.mappings.filter((x) => role(x) === 'required')) { const g = m.req_group ?? 0; groups.set(g, (groups.get(g) ?? false) || hit(m)); }
    const missing = [...groups.values()].filter((ok) => !ok).length;
    const excludedBy = t.mappings.filter((m) => role(m) === 'exclude' && hit(m)).map(asMatched);
    const matched = t.mappings.filter((m) => role(m) !== 'exclude' && hit(m)).map(asMatched);
    const score = matched.reduce((n, m) => n + (m.role === 'supporting' ? 1 : m.role === 'weight' ? m.weight : 0), 0);
    return { t, matched, score, qualified: missing === 0 && !excludedBy.length, excludedBy, missing };
  });
  const group = (p: number) => Math.floor(p / 10);
  scored.sort((a, b) => Number(b.qualified) - Number(a.qualified) || group(a.t.priority) - group(b.t.priority) || b.score - a.score || a.t.priority - b.t.priority || a.t.name.localeCompare(b.t.name));
  const ranking = scored.map((s, i) => ({ id: s.t.id, name: s.t.name, score: s.score, matched: s.matched, rank: i + 1, qualified: s.qualified, excluded_by: s.excludedBy, missing_groups: s.missing }));
  const anyRoles = templates.some((t) => t.mappings.some((m) => m.role && m.role !== 'weight'));
  if (!anyRoles) { // only the older weighted scoring: the best score, and nothing matching means the default by priority
    const byScore = [...ranking].sort((a, b) => b.score - a.score || templates.find((t) => t.id === a.id)!.priority - templates.find((t) => t.id === b.id)!.priority || a.name.localeCompare(b.name)).map((r, i) => ({ ...r, rank: i + 1 }));
    return { ranking: byScore, chosen: byScore[0] ?? null, defaulted: byScore.length > 0 && byScore[0].score === 0 };
  }
  const first = ranking.find((r) => r.qualified);
  if (first) return { ranking, chosen: first, defaulted: false };
  const def = templates.find((t) => t.is_default) ?? [...templates].sort((a, b) => a.priority - b.priority)[0];
  return { ranking, chosen: def ? ranking.find((r) => r.id === def.id)! : null, defaulted: true };
}
