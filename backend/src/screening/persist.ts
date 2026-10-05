import { COLUMN_KEYS, type ColumnKey, type Report } from './contract';

/** Max lengths of the text columns in `screenings` (see sql/migrations/002). Longer model output is cut, never rejected. */
const MAX: Record<ColumnKey, number> = {
  posted: 80, job_type: 40, budget: 160, length_hours: 200, experience_level: 60, service_category: 300, required_skills: 800,
  client_country: 120, payment_verified: 80, client_rating: 80, jobs_posted: 60, hire_rate: 60, total_spent: 80, hires: 60,
  avg_spend_per_hire: 80, avg_hourly_paid: 160, member_since: 80, proposals: 60, interviewing: 60, invites_sent: 60,
  connects_cost: 60, sample_match: 800,
};
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface SheetValues {
  title: string;
  verdict: string;
  fail_reasons: string;
  flag_reasons: string;
  rule_codes: string;
  columns: Record<ColumnKey, string>;
}

/**
 * Turns the model's report into the sheet columns.
 * - rule codes are derived from the fail and flag items, deduplicated, unknown codes dropped, in rule order
 * - sample_match keeps only names that exist in the project library
 */
export function sheetValues(rep: Report, ruleOrder: string[], projectNames: string[]): SheetValues {
  const j = rep.job;
  const known = new Set(ruleOrder);
  const used = new Set([...j.fails, ...j.flags].map((i) => i.code).filter((c) => known.has(c)));
  const rule_codes = ruleOrder.filter((c) => used.has(c)).join(', ');
  const fmt = (items: { rule: string; value: string }[]) => items.map((i) => `${oneLine(i.rule)}: ${oneLine(i.value)}`).join(' | ');

  const byLower = new Map(projectNames.map((n) => [n.toLowerCase(), n]));
  const matched = j.columns.sample_match.split(/[;\n]/).map((s) => oneLine(s)).map((s) => byLower.get(s.toLowerCase())).filter((s): s is string => !!s);
  const sample = [...new Set(matched)].join('; ') || 'none';

  const columns = {} as Record<ColumnKey, string>;
  for (const k of COLUMN_KEYS) columns[k] = cut(oneLine(k === 'sample_match' ? sample : j.columns[k]), MAX[k]);
  return { title: cut(oneLine(j.title), 300), verdict: j.verdict, fail_reasons: fmt(j.fails), flag_reasons: fmt(j.flags), rule_codes, columns };
}
