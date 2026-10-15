/**
 * Three openings (R73, asked for by Ahmad): for every proposal, three replacements for its first paragraph, the part Upwork shows
 * in the preview. Each takes a different direction, tone and line of thought, so the person can read the whole proposal with each
 * one and keep the one that suits the client. Written by a worker job after the proposal, like the independent review; using one
 * makes a new version (with its parts, so a later change of projects or video still updates by itself).
 */
import { z } from 'zod';
import { config } from '../config';
import { exec, query } from '../db';
import { getSettings } from '../settings';
import { htmlToPlain, textToHtml } from '../html';
import { run } from '../llm';
import { bannedPatterns, loadGuide } from './guide';
import { GUARDRAILS } from './writer';
import { activeOpenings, addLearned, OPENINGS_BATCH, templateBlock, type OpeningTemplate } from './opening_templates';
import { addVersion, assembleParts, latestVersion, loadFacts, loadTemplate } from './pipeline';
import { PROOF, VIDEO, type Parts } from './parts';
import { activeShortcuts, shortenText } from './shortcuts';

export interface Opening { angle: string; tone: string; why: string; text: string; style?: string; /** the opening template it was written from (R88) */ template_id?: number;
  /** R91: how closely it follows its template's examples, out of 10 (only when the template has examples), and why */ match?: number | null; match_note?: string | null }
export interface Openings { version: number; first: string; items: Opening[]; used?: number | null; /** the opening template the proposal itself was written with (R88) */ default?: string | null; default_id?: number | null;
  /** R91: the proposal's own opening against its default template's examples, out of 10 */ first_match?: number | null; first_match_note?: string | null }

/** One opening per style (Settings: Opening styles), in the styles' order. */
const schemaFor = (n: number) => ({ type: 'object', properties: { openings: { type: 'array', minItems: n, maxItems: n, items: { type: 'object',
  properties: { angle: { type: 'string' }, tone: { type: 'string' }, why: { type: 'string' }, text: { type: 'string' } }, required: ['angle', 'tone', 'why', 'text'], additionalProperties: false } } },
  required: ['openings'], additionalProperties: false });
const outFor = (n: number) => z.object({ openings: z.array(z.object({ angle: z.string().trim().min(1).max(80), tone: z.string().trim().min(1).max(60), why: z.string().trim().max(300), text: z.string().trim().min(10).max(1500) })).length(n) });

/** The first paragraph of a letter: everything before the first blank line, never a marker line. */
export function firstParagraph(text: string): string {
  const paras = String(text ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  return paras.find((p) => p !== PROOF && p !== VIDEO) ?? '';
}
/** The letter with its first paragraph replaced. */
export function replaceFirstParagraph(text: string, opening: string): string {
  const first = firstParagraph(text);
  if (!first) return `${opening.trim()}\n\n${text}`.trim();
  const at = text.indexOf(first);
  return text.slice(0, at) + opening.trim() + text.slice(at + first.length);
}
/** The HTML with its first paragraph replaced (a version edited by hand has no parts: its text is the HTML). */
export function replaceFirstHtmlParagraph(html: string, opening: string): string {
  const para = textToHtml(opening.trim());
  const re = /<(p|h[1-6]|div)\b[^>]*>[\s\S]*?<\/\1>/i;
  return re.test(html) ? html.replace(re, para) : para + html;
}
/** The text the openings replace in a version: the first paragraph of its letter. */
export const openingOf = (v: { html: string; parts: Parts | null }) => firstParagraph(v.parts ? v.parts.letter : htmlToPlain(v.html));

export function readOpenings(json: string | null | undefined): Openings | null {
  if (!json) return null;
  try { const o = JSON.parse(json); return o && Array.isArray(o.items) ? o as Openings : null; } catch { return null; }
}

const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
/** The templates already written for: by id, or by name for openings written before R88 kept the id. */
const writtenFor = (items: Opening[], all: OpeningTemplate[]) => new Set(items.map((x) => x.template_id ?? all.find((t) => t.name === x.style)?.id).filter((x): x is number => x != null));

const judgeSchema = { type: 'object', properties: { scores: { type: 'array', items: { type: 'object', properties: { score: { type: 'integer', minimum: 0, maximum: 10 }, note: { type: 'string' } }, required: ['score', 'note'], additionalProperties: false } } }, required: ['scores'], additionalProperties: false };
/**
 * R91 (Ahmad): how closely each opening follows its template's examples, out of 10, judged apart from the writer so it does not
 * grade its own work. Shape is judged, not facts: the facts come from another job and are meant to differ. Never fails the job.
 */
export async function scoreAgainstExamples(list: { text: string; template: OpeningTemplate }[]): Promise<({ score: number; note: string } | null)[]> {
  const exOf = (t: OpeningTemplate) => [...t.examples, ...(t.learned ?? []).filter((x) => !t.examples.includes(x))]; // R98: the team's edits count as examples
  const todo = list.map((x, i) => ({ ...x, i })).filter((x) => exOf(x.template).length && x.text.trim());
  const out: ({ score: number; note: string } | null)[] = list.map(() => null);
  if (!todo.length) return out;
  const system = ['You judge how closely a written opening (the first paragraph of an Upwork proposal) follows the example openings it was meant to resemble.',
    'Judge the shape, not the facts: structure and sentence order, length and rhythm, the kind of first words, and the wording patterns. The facts (the client, their problem, their stack) come from a different job and are meant to differ: never lower a score for that.',
    'Score 0 to 10 against the closest example: 10 is the same shape with only the facts changed; 8 to 9 follows it closely with small changes in wording or order; 5 is the same idea in a clearly different shape; 0 is nothing alike.',
    '"note": one short sentence on what matches or what differs most. Give one score per opening, in the order given.'].join('\n');
  const prompt = todo.map((x, k) => `<opening n="${k + 1}">\n${x.text.trim()}\n</opening>\n<examples n="${k + 1}">\n${exOf(x.template).map((e, j) => `Example ${j + 1}:\n${e}`).join('\n\n')}\n</examples>`).join('\n\n') + `\n\nScore all ${todo.length} now.`;
  try {
    const r = await run({ label: 'opening match', system, prompt, schema: judgeSchema, timeoutMs: config.llm.timeoutMs });
    const o = z.object({ scores: z.array(z.object({ score: z.number().int().min(0).max(10), note: z.string().max(400) })) }).safeParse(r.data);
    if (o.success) todo.forEach((x, k) => { const sc = o.data.scores[k]; if (sc) out[x.i] = { score: sc.score, note: sc.note.trim() }; });
  } catch (e) { console.error('opening match failed', (e as Error).message); }
  return out;
}

/**
 * The worker job (R91: three at a time). The first run writes openings for the three best ranked active templates other than the
 * type's default; "load more" (openings_more) adds the next three to the ones already there, while they still fit the proposal.
 */
export async function runOpenings(proposalId: number) {
  const p = (await query<any>('SELECT id, screening_id, template_id, openings_json, openings_more FROM proposals WHERE id=?', [proposalId]))[0];
  const cur = p ? await latestVersion(p.id) : null;
  if (!p || !cur) { await exec(`UPDATE proposals SET openings_status=NULL, openings_more=0 WHERE id=?`, [proposalId]); return; }
  const f = await loadFacts(p.screening_id);
  const template = p.template_id ? await loadTemplate(p.template_id) : null;
  const guide = await loadGuide();
  const letter = htmlToPlain(cur.html), first = openingOf(cur);
  const words = first.split(/\s+/).filter(Boolean).length;
  const banned = bannedPatterns(guide.banned).map((b) => b.phrase);
  // R88: the proposal itself was written with the type's default; the alternatives are the other active templates, best ranked first
  const def = template?.opening ?? null;
  const prev = readOpenings(p.openings_json);
  const adding = !!Number(p.openings_more) && !!prev && prev.version === cur.version_no && norm(prev.first) === norm(first);
  const active = await activeOpenings();
  const done = writtenFor(adding ? prev!.items : [], active);
  const styles = active.filter((x) => (!def || x.id !== def.id) && !done.has(x.id)).slice(0, OPENINGS_BATCH);
  const base: Openings = adding ? prev! : { version: cur.version_no, first, items: [], used: null, default: def?.name ?? null, default_id: def?.id ?? null };
  if (!adding && def && (def.examples.length || def.learned?.length)) { const [m] = await scoreAgainstExamples([{ text: first, template: def }]); base.first_match = m?.score ?? null; base.first_match_note = m?.note ?? null; }
  const save = async (data: Openings) => exec(`UPDATE proposals SET openings_status='done', openings_json=?, openings_error=NULL, openings_more=0 WHERE id=?`, [JSON.stringify(data), p.id]);
  if (!styles.length) { await save(base); return { stale: false }; }
  const system = [
    'You write the opening of an Upwork proposal: its first paragraph, the part Upwork shows in the preview before the client opens it. Most clients decide there whether to read on.',
    GUARDRAILS,
    `SENDER: ${f.sender.name}${f.sender.voice ? `. Voice: ${f.sender.voice} (never "we")` : ''}${f.sender.rules ? `. Rules: ${f.sender.rules}` : ''}`,
    guide.opening ? `RULES FOR EVERY OPENING (strict; each opening template below may make its own exceptions, and where it does, the template wins)\n${guide.opening.trim()}` : '',
    banned.length ? `NEVER USE these phrases: ${banned.slice(0, 60).join('; ')}` : '',
    guide.shortcuts ?? '',
  ].filter(Boolean).join('\n\n');
  const taken = adding && prev!.items.length ? `\n\nOPENINGS ALREADY WRITTEN (do not repeat their ideas or wording)\n${prev!.items.map((x) => `- ${x.text}`).join('\n')}` : '';
  const prompt = `<job_page>\n${f.questions.length ? f.jobOnly : f.jobText}\n</job_page>\n\nTHE PROPOSAL\n${letter}\n\nITS FIRST PARAGRAPH (what each opening replaces)\n${first}${taken}\n\n`
    + `Write ${styles.length} different opening${styles.length === 1 ? '' : 's'} to replace that first paragraph, one per OPENING TEMPLATE below, in this order. Each follows its own template exactly (what it leads with, its tone, its first words, its exceptions and its examples), so they are real choices, not wordings of one idea.\n\n`
    + styles.map((x, i) => `${i + 1}. ${templateBlock(x)}`).join('\n\n') + '\n\n'
    + `Each one follows the rules for every opening above except where its own template says otherwise, uses only facts from the job post and the proposal, and reads straight on into the paragraph after it, so the rest of the proposal stays as it is. `
    + `Keep each about as long as the current first paragraph (${words} words; never more than ${Math.max(45, Math.round(words * 1.4))}), unless its template says to match its examples: then about as long as they are. `
    + `"angle": what it leads with, in two to five words. "tone": one to three words. "why": one sentence on why it may land with this client. "text": the paragraph itself, ready to paste.`;
  const r = await run({ label: 'openings', system, prompt, schema: schemaFor(styles.length), timeoutMs: config.llm.timeoutMs });
  const o = outFor(styles.length).safeParse(r.data); if (!o.success) throw new Error('invalid_output');
  const sc = await activeShortcuts(); // R92: the short words, as in the proposal itself
  for (const x of o.data.openings) x.text = shortenText(x.text, sc);
  const scores = await scoreAgainstExamples(o.data.openings.map((x, i) => ({ text: x.text, template: styles[i] })));
  const now = await latestVersion(p.id); // a newer version while it was writing: the openings are still for the one they read
  const fresh: Opening[] = o.data.openings.map((x, i) => ({ ...x, style: styles[i].name, template_id: styles[i].id, ...(scores[i] ? { match: scores[i]!.score, match_note: scores[i]!.note } : {}) }));
  await save({ ...base, items: [...base.items, ...fresh] });
  return { stale: !!now && now.version_no !== cur.version_no };
}

/** How many more openings can be written for a proposal: the active templates not written yet, other than its default. */
export async function openingsLeft(o: Openings | null, typeDefault?: number | null): Promise<number> {
  if (!o) return 0;
  const defId = o.default_id ?? typeDefault ?? null;
  const active = await activeOpenings(), done = writtenFor(o.items, active);
  return active.filter((x) => x.id !== defId && x.name !== o.default && !done.has(x.id)).length;
}

/** Queue openings: the first three again (more=false), or the next three beside those there (R91). */
export async function queueOpenings(proposalId: number, more = false): Promise<string | null> {
  const p = (await query<any>(`SELECT id, status, openings_status FROM proposals WHERE id=?`, [proposalId]))[0];
  if (!p || p.status !== 'done') return 'Wait until the proposal is written';
  if (p.openings_status === 'queued' || p.openings_status === 'running') return null;
  await exec(`UPDATE proposals SET openings_status='queued', openings_error=NULL, openings_more=? WHERE id=?`, [more ? 1 : 0, proposalId]);
  return null;
}

/**
 * Use one opening: a new version with the newest version's first paragraph replaced. Refused when that paragraph is no longer the
 * one the openings were written for (it was changed since), so an opening never lands on a different proposal.
 */
export async function useOpening(proposalId: number, index: number, userId: number): Promise<{ version_no?: number; error?: string }> {
  const p = (await query<any>('SELECT id, openings_json FROM proposals WHERE id=?', [proposalId]))[0];
  const o = readOpenings(p?.openings_json); const pick = o?.items[index];
  if (!o || !pick) return { error: 'There is no such opening' };
  const cur = await latestVersion(proposalId); if (!cur) return { error: 'There is no proposal yet' };
  if (norm(openingOf(cur)) !== norm(o.first)) return { error: 'The first paragraph was changed since these openings were written. Write new ones.' };
  const cfg = await getSettings();
  const note = `Opening ${index + 1}: ${pick.angle}`;
  let no: number;
  if (cur.parts) {
    const parts: Parts = { ...cur.parts, letter: replaceFirstParagraph(cur.parts.letter, pick.text) };
    no = await addVersion(proposalId, textToHtml(assembleParts(parts, cfg['writer.loom_line'])), 'ai', userId, note, cur.version_no, undefined, parts);
  } else no = await addVersion(proposalId, replaceFirstHtmlParagraph(cur.html, pick.text), 'ai', userId, note, cur.version_no);
  // the openings now belong to the new version: the one in use is shown as it, the others stay to try
  // R91: a proposal already finalized now went out with this opening, so the ranking counts this one
  await exec('UPDATE proposals SET openings_json=?, final_opening_id=IF(finalized_at IS NULL, final_opening_id, COALESCE(?, final_opening_id)) WHERE id=?', [JSON.stringify({ ...o, version: no, first: pick.text.trim(), used: index }), pick.template_id ?? null, proposalId]);
  return { version_no: no };
}

/**
 * R98 (Ahmad): an opening edited on the proposal before it is used. The edited text becomes the first paragraph (a new version, as the
 * person's own edit), it is the opening in use, and it is kept on its opening template as a learned example, so later openings from that
 * template learn from what the team changed. index: an alternative; null: the opening in the proposal now.
 */
export async function editOpening(proposalId: number, index: number | null, text: string, userId: number): Promise<{ version_no?: number; error?: string }> {
  const p = (await query<any>('SELECT id, openings_json FROM proposals WHERE id=?', [proposalId]))[0];
  const o = readOpenings(p?.openings_json); if (!o) return { error: 'There are no openings for this proposal' };
  const pick = index == null ? null : o.items[index]; if (index != null && !pick) return { error: 'There is no such opening' };
  const cur = await latestVersion(proposalId); if (!cur) return { error: 'There is no proposal yet' };
  if (norm(openingOf(cur)) !== norm(o.first)) return { error: 'The first paragraph was changed since these openings were written. Write new ones.' };
  const t = text.replace(/\r\n/g, '\n').trim();
  if (t.length < 10) return { error: 'Write the opening (at least a sentence)' };
  if (/\n\s*\n/.test(t)) return { error: 'An opening is one paragraph: take out the blank line' };
  const cfg = await getSettings();
  const usedNow = o.used != null ? o.items[o.used] : null;
  const templateId = pick ? pick.template_id : usedNow?.template_id ?? o.default_id ?? null;
  const note = `Opening edited${pick ? `: ${pick.style || pick.angle}` : ''}`;
  let no: number;
  if (cur.parts) {
    const parts: Parts = { ...cur.parts, letter: replaceFirstParagraph(cur.parts.letter, t) };
    no = await addVersion(proposalId, textToHtml(assembleParts(parts, cfg['writer.loom_line'])), 'manual', userId, note, cur.version_no, undefined, parts);
  } else no = await addVersion(proposalId, replaceFirstHtmlParagraph(cur.html, t), 'manual', userId, note, cur.version_no);
  const items = o.items.map((x, i) => (i === index ? { ...x, text: t, edited: true } : x));
  await exec('UPDATE proposals SET openings_json=?, final_opening_id=IF(finalized_at IS NULL, final_opening_id, COALESCE(?, final_opening_id)) WHERE id=?',
    [JSON.stringify({ ...o, items, version: no, first: t, used: index ?? o.used ?? null }), templateId, proposalId]);
  if (templateId) await addLearned(templateId, t);
  return { version_no: no };
}
