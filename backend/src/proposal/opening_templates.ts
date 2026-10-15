/**
 * Opening templates (R88, Ahmad): the openings live in one place. The rules for every opening are the Writing guide's "Opening lines
 * (all types)"; each opening template says what its opening does, and its exceptions to those rules are fields, not prose: required
 * first words, whether it may greet, whether it may talk about us. Every proposal type has one default template: the proposal is
 * written with it, and one opening per other active template is written beside it to pick from (openings.ts).
 */
import { query } from '../db';

export interface OpeningTemplate { id: number; name: string; instructions: string; starts: string | null; may_greet: boolean; may_talk_about_us: boolean; active: boolean;
  /** R91: up to five example openings, and whether to write the opening very close to them */ examples: string[]; match_examples: boolean; /** proposals finalized with it */ rank: number; /** R92: proposals finalized with it, and the points a person added by hand (rank = sent + boost) */ sent: number; boost: number }
export const MAX_OPENINGS = 20; // R91 (was 10): they are written three at a time now, so more can be kept
export const MAX_EXAMPLES = 5;
export const OPENINGS_BATCH = 3;

const readExamples = (json: unknown): string[] => { try { const a = JSON.parse(String(json ?? '[]')); return Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean).slice(0, MAX_EXAMPLES) : []; } catch { return []; } };
const shape = (r: any): OpeningTemplate => ({ id: Number(r.id), name: r.name, instructions: String(r.instructions ?? ''), starts: r.starts || null,
  may_greet: !!Number(r.may_greet), may_talk_about_us: !!Number(r.may_talk_about_us), active: !!Number(r.active),
  examples: readExamples(r.examples_json), match_examples: !!Number(r.match_examples), rank: Number(r.sent_n ?? 0) + Number(r.rank_boost ?? 0), sent: Number(r.sent_n ?? 0), boost: Number(r.rank_boost ?? 0) });
/** How many finalized proposals went out with each template, plus the points added by hand: its ranking (R91, R92). */
const SENT = '(SELECT COUNT(*) FROM proposals p WHERE p.final_opening_id=o.id AND p.finalized_at IS NOT NULL)';
/** R92: the ranking is the proposals sent with it plus its manual points. */
const RANK = `${SENT} AS sent_n, ${SENT} + o.rank_boost AS rank_n`;

export async function openingTemplate(id: number | null | undefined): Promise<OpeningTemplate | null> {
  if (!id) return null;
  const r = (await query<any>(`SELECT o.*, ${RANK} FROM opening_templates o WHERE o.id=?`, [id]))[0];
  return r ? shape(r) : null;
}
/** The active templates, best ranked first (the order the alternatives are written and shown in), then in their set order. */
export async function activeOpenings(): Promise<OpeningTemplate[]> {
  return (await query<any>(`SELECT o.*, ${RANK} FROM opening_templates o WHERE o.active=1 ORDER BY rank_n DESC, o.sort_order, o.id`)).map(shape);
}
export async function allOpenings(): Promise<(OpeningTemplate & { sort_order: number; used_by: string | null })[]> {
  return (await query<any>(`SELECT o.*, ${RANK}, (SELECT GROUP_CONCAT(t.name ORDER BY t.priority SEPARATOR ', ') FROM templates t WHERE t.default_opening_id=o.id AND t.active=1) AS used_by
    FROM opening_templates o ORDER BY rank_n DESC, o.sort_order, o.id`)).map((r) => ({ ...shape(r), sort_order: Number(r.sort_order), used_by: r.used_by || null }));
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
  if (!o.examples.length) return '';
  const list = o.examples.map((x, i) => `Example ${i + 1}:\n${x}`).join('\n\n');
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
