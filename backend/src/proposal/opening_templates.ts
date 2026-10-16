/**
 * Opening templates (R88, Ahmad): the openings live in one place. The rules for every opening are the Writing guide's "Opening lines
 * (all types)"; each opening template says what its opening does, and its exceptions to those rules are fields, not prose: required
 * first words, whether it may greet, whether it may talk about us. Every proposal type has one default template: the proposal is
 * written with it, and one opening per other active template is written beside it to pick from (openings.ts).
 */
import { exec, query } from '../db';

export interface OpeningTemplate { id: number; name: string; instructions: string; starts: string | null; may_greet: boolean; may_talk_about_us: boolean; active: boolean;
  /** R91: up to five example openings, and whether to write the opening very close to them */ examples: string[]; match_examples: boolean; /** R98: openings the team edited on a proposal and used, newest first; R101: only those in use */ learned: string[]; /** R101: every example and learned one, with whether it is in use */ all_examples?: Example[]; all_learned?: Example[]; /** proposals finalized with it */ rank: number; /** R92: proposals finalized with it, and the points a person added by hand (rank = sent + boost) */ sent: number; boost: number; /** R104: what happened with it, and the points that earned */ viewed?: number; chat?: number; hired?: number; earned?: number }
export const MAX_OPENINGS = 20; // R91 (was 10): they are written three at a time now, so more can be kept
export const MAX_EXAMPLES = 5;
export const OPENINGS_BATCH = 3;

/** R101: one example, written or learned, and whether the writer uses it (at most MAX_ACTIVE across both lists). Older rows were plain text: in use. */
export interface Example { text: string; on: boolean; at?: string | null }
export const MAX_ACTIVE = 10;
export const readList = (json: unknown): Example[] => { try { const a = JSON.parse(String(json ?? '[]')); return Array.isArray(a) ? a.map((x: any) => (typeof x === 'string' ? { text: x.trim(), on: true } : { text: String(x?.text ?? '').trim(), on: x?.on !== false, at: x?.at ?? null })).filter((x) => x.text) : []; } catch { return []; } };
const readExamples = (json: unknown): string[] => readList(json).filter((x) => x.on).map((x) => x.text);
const shape = (r: any): OpeningTemplate => ({ id: Number(r.id), name: r.name, instructions: String(r.instructions ?? ''), starts: r.starts || null,
  may_greet: !!Number(r.may_greet), may_talk_about_us: !!Number(r.may_talk_about_us), active: !!Number(r.active),
  examples: readExamples(r.examples_json), learned: readExamples(r.learned_json), all_examples: readList(r.examples_json), all_learned: readList(r.learned_json), match_examples: !!Number(r.match_examples), rank: Number(r.rank_n ?? 0), sent: Number(r.sent_n ?? 0), boost: Number(r.rank_boost ?? 0),
  viewed: Number(r.viewed_n ?? 0), chat: Number(r.chat_n ?? 0), hired: Number(r.hired_n ?? 0), earned: Number(r.earned_n ?? 0) });
/**
 * R104 (Ahmad): an opening ranks by what happened with it, not only by being sent: 1 point per proposal that went out with it, and
 * more when the client viewed it, opened a chat or hired, plus the points a person added by hand (rank = earned + boost).
 */
export const RESULT_POINTS = { sent: 1, viewed: 1, chat: 2, hired: 5 };
const STATS = `LEFT JOIN (SELECT p.final_opening_id AS oid, COUNT(*) AS sent_n, SUM(s.client_viewed='yes') AS viewed_n, SUM(s.client_replied='yes') AS chat_n, SUM(s.outcome='Hired') AS hired_n
  FROM proposals p JOIN screenings s ON s.id=p.screening_id WHERE p.final_opening_id IS NOT NULL AND s.discarded_at IS NULL
    AND (p.finalized_at IS NOT NULL OR s.proposal_sent_at IS NOT NULL OR s.proposal_sent_date IS NOT NULL) GROUP BY p.final_opening_id) st ON st.oid=o.id`;
const EARNED = `(COALESCE(st.sent_n,0)*${RESULT_POINTS.sent} + COALESCE(st.viewed_n,0)*${RESULT_POINTS.viewed} + COALESCE(st.chat_n,0)*${RESULT_POINTS.chat} + COALESCE(st.hired_n,0)*${RESULT_POINTS.hired})`;
const RANK = `COALESCE(st.sent_n,0) AS sent_n, COALESCE(st.viewed_n,0) AS viewed_n, COALESCE(st.chat_n,0) AS chat_n, COALESCE(st.hired_n,0) AS hired_n, ${EARNED} AS earned_n, ${EARNED} + o.rank_boost AS rank_n`;

export async function openingTemplate(id: number | null | undefined): Promise<OpeningTemplate | null> {
  if (!id) return null;
  const r = (await query<any>(`SELECT o.*, ${RANK} FROM opening_templates o ${STATS} WHERE o.id=?`, [id]))[0];
  return r ? shape(r) : null;
}
/** The active templates, best ranked first (the order the alternatives are written and shown in), then in their set order. */
export async function activeOpenings(): Promise<OpeningTemplate[]> {
  return (await query<any>(`SELECT o.*, ${RANK} FROM opening_templates o ${STATS} WHERE o.active=1 ORDER BY rank_n DESC, o.sort_order, o.id`)).map(shape);
}
export async function allOpenings(): Promise<(OpeningTemplate & { sort_order: number; used_by: string | null })[]> {
  return (await query<any>(`SELECT o.*, ${RANK}, (SELECT GROUP_CONCAT(t.name ORDER BY t.priority SEPARATOR ', ') FROM templates t WHERE t.default_opening_id=o.id AND t.active=1) AS used_by
    FROM opening_templates o ${STATS} ORDER BY rank_n DESC, o.sort_order, o.id`)).map((r) => ({ ...shape(r), sort_order: Number(r.sort_order), used_by: r.used_by || null }));
}

/** The required first words, said plainly ("Understood." or "For your platform," or "For you,"). */
export const startsText = (starts: string | null) => (starts ? starts.split('|').map((x) => `"${x.trim()}"`).filter((x) => x !== '""').join(' or ') : '');

/** One template's own part of the instructions: what it does, then its exceptions to the rules for every opening. */
export function templateBlock(o: OpeningTemplate): string {
  return [`OPENING: ${o.name}`, o.instructions.trim(),
    o.starts ? `It must begin with ${startsText(o.starts)}, unless the client asks for their own opening words; then theirs.` : '',
    o.may_greet ? 'It may open with a greeting by the client\'s name, as said above (an exception to the rule against greetings).' : '',
    o.may_talk_about_us ? 'It may say how we would start (an exception to the rule against talking about us).' : '',
    examplesBlock(o),
  ].filter(Boolean).join('\n');
}

/** The template's example openings (R91): to follow closely when "match the examples" is on, else for the feel only. */
export function examplesBlock(o: OpeningTemplate): string {
  const learned = (o.learned ?? []).filter((x) => !o.examples.includes(x));
  if (!o.examples.length && !learned.length) return '';
  const all = [...o.examples, ...learned];
  const list = all.map((x, i) => `${i < o.examples.length ? 'Example' : 'Edited by the team'} ${i + 1}:\n${x}`).join('\n\n')
    + (learned.length ? '\n(The ones "edited by the team" are openings a person rewrote on a real proposal and sent: they show what the team wants. Learn from what they changed.)' : '');
  return o.match_examples
    ? `MATCH THE EXAMPLES (strict): write this opening 80 to 90 percent like the examples below. Take the example closest to this job and follow it line by line: the same structure and sentence order, the same length and rhythm, the same kind of first words and the same wording patterns. Change only what this job needs: the client's own words, their problem, their stack and their situation. Never carry over a fact, name, number or claim from an example that is not true for this job; the rules about facts still apply.\n${list}`
    : `EXAMPLES of this opening (for its feel and direction; follow the instructions above, not these word for word, and never take a fact from them):\n${list}`;
}

/**
 * The FIRST TWO LINES section the writer, the chat and the review read: the rules for every opening, then the opening template's own
 * part, which wins where the two differ. Whatever the proposal type's format says about its opening gives way to this.
 */
export function openingRules(rules: string | null | undefined, o: OpeningTemplate | null): string {
  const all = rules?.trim();
  if (!all && !o) return '';
  return `FIRST TWO LINES (the opening paragraph; strict: Upwork shows it in the preview before the client opens the proposal. This section decides the opening: where the proposal type's format describes its opening differently, follow this. A client's own required opening words come first of all)\n`
    + (all ? `RULES FOR EVERY OPENING\n${all}\n` : '')
    + (o ? `\n${all ? 'THE OPENING TO WRITE (where it differs from the rules above, it wins)\n' : ''}${templateBlock(o)}\n` : '');
}

/** What the automatic check of the first two lines allows for this opening. */
export const checkFlags = (o: OpeningTemplate | null, legacy?: { opening_no_us?: boolean; opening_starts?: string | null; name?: string }) =>
  o ? { noUs: !o.may_talk_about_us, starts: o.starts, invite: o.may_greet }
    : { noUs: !!legacy?.opening_no_us, starts: legacy?.opening_starts ?? null, invite: /invite/i.test(legacy?.name ?? '') };

/** The opening template a proposal's opening was written from now: the one picked from the alternatives, else the type's default. */
export async function openingInUse(proposalId: number, fallback: OpeningTemplate | null | undefined): Promise<OpeningTemplate | null> {
  const p = (await query<any>('SELECT openings_json FROM proposals WHERE id=?', [proposalId]))[0];
  try { const o = JSON.parse(p?.openings_json || 'null'); const it = o && o.used != null ? o.items?.[o.used] : null; if (it?.template_id) return (await openingTemplate(it.template_id)) ?? fallback ?? null; } catch { /* none */ }
  return fallback ?? null;
}

/**
 * R98: an opening edited on a proposal and used, kept on its template as a learned example, newest first and in use. R101: they are
 * all kept (no cap); at most MAX_ACTIVE examples are in use across both lists, so the oldest learned one in use is switched off.
 */
export async function addLearned(templateId: number, text: string) {
  const t = text.trim(); if (!t) return;
  const r = (await query<any>('SELECT examples_json, learned_json FROM opening_templates WHERE id=?', [templateId]))[0]; if (!r) return;
  const same = (x: string) => x.replace(/\s+/g, ' ') === t.replace(/\s+/g, ' ');
  const learned: Example[] = [{ text: t, on: true, at: new Date().toISOString() }, ...readList(r.learned_json).filter((x) => !same(x.text))].slice(0, 200);
  let active = readList(r.examples_json).filter((x) => x.on).length + learned.filter((x) => x.on).length;
  for (let i = learned.length - 1; i > 0 && active > MAX_ACTIVE; i--) if (learned[i].on) { learned[i] = { ...learned[i], on: false }; active--; }
  await exec('UPDATE opening_templates SET learned_json=? WHERE id=?', [JSON.stringify(learned), templateId]);
}
