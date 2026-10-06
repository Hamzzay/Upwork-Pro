export interface DetectedKey { signal_id: number; value_id: number; is_fallback: boolean }
export interface TemplateRankInput { id: number; name: string; priority: number; mappings: { signal_id: number; value_id: number | null; weight: number }[] }
export interface Matched { signal_id: number; value_id: number | null; weight: number }
export interface RankedTemplate { id: number; name: string; score: number; matched: Matched[]; rank: number }

/**
 * Which template suits the detected signals. A template's mapping row matches when the job has that signal and either the row names the value
 * or names no value ("any stated value of this signal"). The score is the sum of the matching rows' weights. Fully deterministic:
 * higher score first, then lower priority number, then name. When nothing matches at all the default is the lowest priority number.
 */
export function rankTemplates(detected: DetectedKey[], templates: TemplateRankInput[]): { ranking: RankedTemplate[]; chosen: RankedTemplate | null; defaulted: boolean } {
  const scored = templates.map((t) => {
    const matched = t.mappings.filter((m) => detected.some((d) => d.signal_id === m.signal_id && (m.value_id === null ? !d.is_fallback : d.value_id === m.value_id)))
      .map((m) => ({ signal_id: m.signal_id, value_id: m.value_id, weight: m.weight }));
    return { t, matched, score: matched.reduce((n, m) => n + m.weight, 0) };
  });
  scored.sort((a, b) => b.score - a.score || a.t.priority - b.t.priority || a.t.name.localeCompare(b.t.name));
  const ranking = scored.map((s, i) => ({ id: s.t.id, name: s.t.name, score: s.score, matched: s.matched, rank: i + 1 }));
  const defaulted = ranking.length > 0 && ranking[0].score === 0;
  return { ranking, chosen: ranking[0] ?? null, defaulted };
}
