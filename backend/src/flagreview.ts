/**
 * Flag review (R63): for every gate rule, what people did when it fired and how those jobs went, so after a couple of hundred jobs
 * an admin can see which flags could be relaxed and which are doing their job. Pure: the route loads the rows, this only counts.
 *
 * Per rule: the jobs it fired on; how many were continued past it, skipped, or are still undecided; the quick reasons picked when
 * continuing and when skipping; the funnel of the continued jobs once sent (viewed, chat, interview, hired) against the same funnel
 * for clean passes; the same counts for jobs where it was the only rule that fired (the cleanest reading); and a plain hint.
 */

export interface FlagJob {
  id: number; verdict: string | null; rule_codes: string | null; proceeded: string | null; continued: any;
  skip_reason: string | null; skip_note: string | null; override_reason: string | null; reason_picks: string | null;
  sent: any; viewed: any; chat: any; interview: any; outcome: string | null;
}
export interface FlagRule { code: string; type: string; rule: string; active: any }
export interface Funnel { sent: number; viewed: number; chat: number; interview: number; hired: number; lost: number }
export interface FlagRow {
  code: string; type: string; rule: string; active: boolean;
  fired: number; continued: number; skipped: number; undecided: number;
  continue_reasons: { reason: string; jobs: number }[]; own_words_only: number; skip_reasons: { reason: string; jobs: number }[];
  continued_funnel: Funnel; alone: { fired: number; continued: number; skipped: number; funnel: Funnel };
  hint: { key: 'too_few' | 'relax' | 'keep' | 'working' | 'mixed'; text: string };
}

const on = (v: any) => v === true || Number(v) === 1;
const codesOf = (s: string | null) => String(s ?? '').split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
const empty = (): Funnel => ({ sent: 0, viewed: 0, chat: 0, interview: 0, hired: 0, lost: 0 });
function count(f: Funnel, j: FlagJob, loss: string[]) {
  if (!on(j.sent)) return;
  f.sent++; if (on(j.viewed)) f.viewed++; if (on(j.chat)) f.chat++; if (on(j.interview)) f.interview++;
  if (j.outcome === 'Hired') f.hired++; if (j.outcome && loss.includes(j.outcome)) f.lost++;
}
const rate = (n: number, d: number) => (d ? n / d : null);

/** The quick reasons in a reason: the ones stored with it, else the ones its text contains (reasons given before R63). */
export function picksOf(storedJson: string | null, text: string | null, known: string[]): string[] {
  if (storedJson) { try { const x = JSON.parse(storedJson); if (Array.isArray(x)) return x.map(String); } catch { /* fall through */ } }
  const t = String(text ?? '').toLowerCase();
  return known.filter((k) => k && t.includes(k.toLowerCase()));
}

/** How much evidence before a hint is given: rules that fired on fewer jobs, or whose continued jobs were sent fewer times, wait. */
export const ENOUGH = { fired: 20, sent: 10 };

export function hintFor(r: Pick<FlagRow, 'type' | 'fired' | 'continued' | 'skipped' | 'continued_funnel'>, base: Funnel): FlagRow['hint'] {
  const decided = r.continued + r.skipped;
  if (r.fired < ENOUGH.fired || decided < ENOUGH.fired / 2) return { key: 'too_few', text: `Too few jobs to judge yet (${r.fired} fired, ${ENOUGH.fired} needed).` };
  const cont = r.continued / decided;
  const f = r.continued_funnel, reply = rate(f.chat, f.sent), baseReply = rate(base.chat, base.sent);
  const enoughSent = f.sent >= ENOUGH.sent && base.sent >= ENOUGH.sent && reply != null && baseReply != null;
  const fail = r.type === 'fail';
  if (cont <= 0.2) return { key: 'working', text: `Doing its job: people skip ${Math.round((1 - cont) * 100)}% of these jobs.` };
  if (cont >= 0.7 && enoughSent && reply! >= baseReply! * 0.8)
    return { key: 'relax', text: `${fail ? 'A fail, so relax with care. ' : ''}Candidate to relax: people continue past it ${Math.round(cont * 100)}% of the time, and those proposals got a chat ${Math.round(reply! * 100)}% of the time against ${Math.round(baseReply! * 100)}% for clean passes. Read the reasons first.` };
  if (cont >= 0.5 && enoughSent && reply! < baseReply! * 0.5)
    return { key: 'keep', text: `Keep it: people continue past it ${Math.round(cont * 100)}% of the time, but those proposals got a chat only ${Math.round(reply! * 100)}% of the time against ${Math.round(baseReply! * 100)}% for clean passes.` };
  if (cont >= 0.7 && !enoughSent) return { key: 'too_few', text: `Usually continued (${Math.round(cont * 100)}%), but too few of those proposals were sent to judge how they do (${f.sent} sent, ${ENOUGH.sent} needed).` };
  return { key: 'mixed', text: `Mixed: continued ${Math.round(cont * 100)}% of the time. Read the reasons and the jobs before changing it.` };
}

export function buildFlagReview(jobs: FlagJob[], rules: FlagRule[], continueReasons: string[], loss: string[]) {
  const base = empty(); let screened = 0, withPicks = 0, overrides = 0;
  const rows = new Map<string, FlagRow & { _c: Map<string, number>; _s: Map<string, number> }>();
  for (const r of rules) rows.set(r.code, { code: r.code, type: r.type, rule: r.rule, active: on(r.active), fired: 0, continued: 0, skipped: 0, undecided: 0, continue_reasons: [], own_words_only: 0, skip_reasons: [],
    continued_funnel: empty(), alone: { fired: 0, continued: 0, skipped: 0, funnel: empty() }, hint: { key: 'too_few', text: '' }, _c: new Map(), _s: new Map() });
  for (const j of jobs) {
    screened++;
    const codes = [...new Set(codesOf(j.rule_codes))];
    const cont = on(j.continued), skip = !cont && j.proceeded === 'no';
    if (j.verdict === 'PASS' && !codes.length && cont) count(base, j, loss);
    const picks = cont && j.verdict !== 'PASS' ? picksOf(j.reason_picks, j.override_reason, continueReasons) : [];
    if (cont && j.verdict !== 'PASS') { overrides++; if (picks.length) withPicks++; }
    for (const code of codes) {
      const r = rows.get(code); if (!r) continue;
      r.fired++; if (codes.length === 1) r.alone.fired++;
      if (cont) {
        r.continued++; count(r.continued_funnel, j, loss);
        if (codes.length === 1) { r.alone.continued++; count(r.alone.funnel, j, loss); }
        if (j.verdict !== 'PASS') { if (picks.length) for (const p of picks) r._c.set(p, (r._c.get(p) ?? 0) + 1); else r.own_words_only++; }
      } else if (skip) {
        r.skipped++; if (codes.length === 1) r.alone.skipped++;
        const why = j.skip_reason || (j.skip_note ? 'Own words' : 'No reason given');
        r._s.set(why, (r._s.get(why) ?? 0) + 1);
      } else r.undecided++;
    }
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([reason, n]) => ({ reason, jobs: n }));
  const out: FlagRow[] = [...rows.values()].map(({ _c, _s, ...r }) => {
    const row = { ...r, continue_reasons: sorted(_c), skip_reasons: sorted(_s) };
    return { ...row, hint: hintFor(row, base) };
  }).sort((a, b) => b.fired - a.fired || a.code.localeCompare(b.code, undefined, { numeric: true }));
  return { screened, target: 200, overrides, overrides_with_picks: withPicks, baseline: base, enough: ENOUGH, rules: out };
}
