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
import { GUARDRAILS, openingSection } from './writer';
import { addVersion, assembleParts, latestVersion, loadFacts, loadTemplate } from './pipeline';
import { PROOF, VIDEO, type Parts } from './parts';

export interface Opening { angle: string; tone: string; why: string; text: string; style?: string }
export interface Openings { version: number; first: string; items: Opening[]; used?: number | null }

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

/** The worker job: three openings for the newest version. */
export async function runOpenings(proposalId: number) {
  const p = (await query<any>('SELECT id, screening_id, template_id FROM proposals WHERE id=?', [proposalId]))[0];
  const cur = p ? await latestVersion(p.id) : null;
  if (!p || !cur) { await exec(`UPDATE proposals SET openings_status=NULL WHERE id=?`, [proposalId]); return; }
  const f = await loadFacts(p.screening_id);
  const template = p.template_id ? await loadTemplate(p.template_id) : null;
  const guide = await loadGuide();
  const letter = htmlToPlain(cur.html), first = openingOf(cur);
  const words = first.split(/\s+/).filter(Boolean).length;
  const banned = bannedPatterns(guide.banned).map((b) => b.phrase);
  const styles = (await getSettings())['writer.opening_styles'].filter((x) => x.active);
  const system = [
    'You write the opening of an Upwork proposal: its first paragraph, the part Upwork shows in the preview before the client opens it. Most clients decide there whether to read on.',
    GUARDRAILS,
    `SENDER: ${f.sender.name}${f.sender.voice ? `. Voice: ${f.sender.voice} (never "we")` : ''}${f.sender.rules ? `. Rules: ${f.sender.rules}` : ''}`,
    openingSection(template, guide.opening),
    template?.opening_starts ? `The opening must begin with: ${template.opening_starts.split('|').map((x) => `"${x.trim()}"`).join(' or ')} (unless the client asks for their own opening words, then theirs).` : '',
    banned.length ? `NEVER USE these phrases: ${banned.slice(0, 60).join('; ')}` : '',
  ].filter(Boolean).join('\n\n');
  const prompt = `<job_page>\n${f.questions.length ? f.jobOnly : f.jobText}\n</job_page>\n\nTHE PROPOSAL\n${letter}\n\nITS FIRST PARAGRAPH (what each opening replaces)\n${first}\n\n`
    + `Write ${styles.length} different openings to replace that first paragraph, one per STYLE below, in this order. They must be real choices, not wordings of one idea: each its own direction (what it leads with), tone and line of thought (why this client would read on), as its style says.\n`
    + styles.map((x, i) => `STYLE ${i + 1}: ${x.name}\n${x.instructions}`).join('\n\n') + '\n'
    + `Where a style and the rules for the first two lines above differ, the rules win. Each one follows every rule for the first two lines above, uses only facts from the job post and the proposal, and reads straight on into the paragraph after it, so the rest of the proposal stays as it is. `
    + `Keep each about as long as the current first paragraph (${words} words; never more than ${Math.max(45, Math.round(words * 1.4))}). `
    + `"angle": what it leads with, in two to five words. "tone": one to three words. "why": one sentence on why it may land with this client. "text": the paragraph itself, ready to paste.`;
  const r = await run({ label: 'openings', system, prompt, schema: schemaFor(styles.length), timeoutMs: config.llm.timeoutMs });
  const o = outFor(styles.length).safeParse(r.data); if (!o.success) throw new Error('invalid_output');
  const now = await latestVersion(p.id); // a newer version while it was writing: the openings are still for the one they read
  const data: Openings = { version: cur.version_no, first, items: o.data.openings.map((x, i) => ({ ...x, style: styles[i].name })), used: null };
  await exec(`UPDATE proposals SET openings_status='done', openings_json=?, openings_error=NULL WHERE id=?`, [JSON.stringify(data), p.id]);
  return { stale: !!now && now.version_no !== cur.version_no };
}

/** Queue three new openings (the button on the proposal page, and again after a chat revision if asked). */
export async function queueOpenings(proposalId: number): Promise<string | null> {
  const p = (await query<any>(`SELECT id, status, openings_status FROM proposals WHERE id=?`, [proposalId]))[0];
  if (!p || p.status !== 'done') return 'Wait until the proposal is written';
  if (p.openings_status === 'queued' || p.openings_status === 'running') return null;
  await exec(`UPDATE proposals SET openings_status='queued', openings_error=NULL WHERE id=?`, [proposalId]);
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
  const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
  if (norm(openingOf(cur)) !== norm(o.first)) return { error: 'The first paragraph was changed since these openings were written. Write new ones.' };
  const cfg = await getSettings();
  const note = `Opening ${index + 1}: ${pick.angle}`;
  let no: number;
  if (cur.parts) {
    const parts: Parts = { ...cur.parts, letter: replaceFirstParagraph(cur.parts.letter, pick.text) };
    no = await addVersion(proposalId, textToHtml(assembleParts(parts, cfg['writer.loom_line'])), 'ai', userId, note, cur.version_no, undefined, parts);
  } else no = await addVersion(proposalId, replaceFirstHtmlParagraph(cur.html, pick.text), 'ai', userId, note, cur.version_no);
  // the openings now belong to the new version: the one in use is shown as it, the others stay to try
  await exec('UPDATE proposals SET openings_json=? WHERE id=?', [JSON.stringify({ ...o, version: no, first: pick.text.trim(), used: index }), proposalId]);
  return { version_no: no };
}
