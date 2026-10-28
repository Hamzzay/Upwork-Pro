/**
 * A proposal in parts (PLAN-SPEED point 1, Ahmad's design). The AI writes the letter and one proof block per project; the Loom
 * line and the sign off are made in code. The app puts them together, so a change of projects, video or profile redoes only the
 * part it touches: a new project's block is one short call, a video or a profile is no call at all. Pure: no database, no model.
 *
 * The letter carries two marker lines: [[PROOF]] where the type puts the proof of past work, [[VIDEO]] where a Loom line goes.
 * It never names a project, never gives a link and never signs off: those belong to their own parts.
 */
import { z } from 'zod';

export const PROOF = '[[PROOF]]';
export const VIDEO = '[[VIDEO]]';

export interface ProofBlock { project_id: number | null; name: string; text: string; link: string | null; /** R126: every link it shows, in order */ links?: ProjectLink[] }
export interface ProjectLink { label: string; url: string }

/**
 * R126 (Hamza): a project's links as a proposal shows them: its web (proposal) link, Google Play, App Store, in that order. Made in
 * code, never by the model. One link stays bare on its own line, as before; two or more each get their label. Staging, landing,
 * system and case study links are never shown.
 */
export function projectLinkSet(p: { web?: string | null; android?: string | null; ios?: string | null }): ProjectLink[] {
  const out: ProjectLink[] = [], seen = new Set<string>();
  for (const [label, url] of [['Web link', p.web], ['Android link', p.android], ['iOS link', p.ios]] as const) {
    const u = url?.trim(); if (!u || seen.has(u.replace(/\/+$/, '').toLowerCase())) continue;
    seen.add(u.replace(/\/+$/, '').toLowerCase()); out.push({ label, url: u });
  }
  return out;
}
/** The link lines for a block, leaving out any link its text already has. */
export function linkLines(links: ProjectLink[], text = ''): string[] {
  const has = (u: string) => text.toLowerCase().includes(u.replace(/\/+$/, '').toLowerCase());
  return links.filter((l) => !has(l.url)).map((l) => (links.length > 1 ? `${l.label}: ${l.url}` : l.url));
}
/**
 * R126/R130: every project's links in a text the model wrote whole (a structured submission, a chat revision, an experience update),
 * put right in code, since the model leaves them out however it is told. For each project with more than one link:
 * - where the text has any of its links (bare, labelled, or on a line with other words), those lines become its labelled block,
 *   in order (Web, Android, iOS);
 * - else a "[project links]" placeholder the model copied from the type takes the block;
 * - else, when the text names the project, the block goes on the line after it.
 * A project the text does not name at all stays out. Links match with or without https://, www. and a trailing slash.
 */
export function restoreLinks(text: string, projects: { name?: string; links: ProjectLink[] }[]): string {
  const bare = (u: string) => u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  const has = (line: string, u: string) => { // the link, not a longer one that starts with it
    const l = line.toLowerCase().replace(/https?:\/\/(www\.)?/g, ''), b = bare(u); let i = l.indexOf(b);
    while (i >= 0) { if (!/[\w-]/.test(l[i + b.length] ?? '')) return true; i = l.indexOf(b, i + 1); }
    return false;
  };
  const block = (p: { links: ProjectLink[] }) => p.links.map((k) => `${k.label}: ${k.url}`);
  let lines = text.split('\n');
  for (const p of projects) {
    if (p.links.length < 2) continue;
    const at = lines.findIndex((l) => p.links.some((k) => has(l, k.url)));
    if (at >= 0) {
      let end = at; while (end + 1 < lines.length && lines[end + 1].trim() && p.links.some((k) => has(lines[end + 1], k.url))) end++;
      // the line keeps any words before the link ("Live: ", "See it here: "): only a line that is just the link (or a label and it) is replaced
      const onlyLinks = lines.slice(at, end + 1).every((l) => { let t = l; for (const k of p.links) t = t.toLowerCase().split(bare(k.url)).join(''); return t.replace(/https?:\/\/(www\.)?|\/|[|:,\-\u2013\u2014()]|\b(web|android|ios|app store|google play|play store|live|link|links|site|website)\b/gi, '').trim() === ''; });
      const run = lines.slice(at, end + 1);
      if (onlyLinks) lines.splice(at, end - at + 1, ...block(p));
      else lines.splice(end + 1, 0, ...p.links.filter((k) => !run.some((l) => has(l, k.url))).map((k) => `${k.label}: ${k.url}`)); // keep its words; add the rest
      continue;
    }
    const ph = lines.findIndex((l) => /\[\s*project\s+links?\s*\]/i.test(l));
    if (ph >= 0) { lines.splice(ph, 1, ...(lines[ph].replace(/\[\s*project\s+links?\s*\]/i, '').trim() ? [lines[ph].replace(/\[\s*project\s+links?\s*\]/i, '').trimEnd(), ...block(p)] : block(p))); continue; }
    if (!p.name) continue;
    const names = [p.name, p.name.replace(/\s*\([^)]*\)\s*/g, ' ').trim()].map((x) => x.toLowerCase()).filter((x) => x.length > 2);
    const ti = lines.findIndex((l) => names.some((n) => l.toLowerCase().includes(n)));
    if (ti >= 0) lines.splice(ti + 1, 0, ...block(p));
  }
  return lines.join('\n');
}
/** Stored with every version made from parts. A version without it was edited by hand (or by the chat): its text is the person's. */
export interface Parts { letter: string; proof: ProofBlock[]; loom: { id: number | null; title: string; url: string } | null; /** R142: videos added after the first */ looms?: { id: number | null; title: string; url: string }[]; profile_id: number | null; signoff: string; /** R134: where its type puts a project's links */ link_place?: LinkPlace }

export const PARTS_RULES = `WRITE IN PARTS (the app puts the proposal together, so one part can be changed later without rewriting the rest)
- "letter": the whole proposal EXCEPT three things the app adds: the proof of past projects, the Loom video line and the sign off.
  Where the proposal type puts the proof of past work, write the line ${PROOF} on its own. Write the line ${VIDEO} on its own
  where a Loom video line would go (always, even when no video is chosen: the app takes it out). Never name a project, never write
  a link, and never write a sign off or the sender's name in the letter. You may say "the projects below" or "similar builds".
- "proof": one item per project in PROJECTS, in the order given. "project" is its exact name. "text" is how this proposal shows it,
  in the type's format: the project's name, then one or two sentences on what it proves for THIS job, from its facts only. No link:
  the app adds the project's links (web, Android, iOS) where the type puts them, under the block's first line when that is its title.
- These rules replace rule 4 (the sign off) and the LOOM VIDEO instruction: the app adds both.
- Never mention the parts, the markers or the app in "warnings": the person never sees them.`;

/** The writer's answer in parts mode; `screening_answers` only when the client used Upwork's questions section. */
export function partsSchema(questions: number) {
  const base: Record<string, unknown> = {
    letter: { type: 'string' },
    proof: { type: 'array', items: { type: 'object', properties: { project: { type: 'string' }, text: { type: 'string' } }, required: ['project', 'text'], additionalProperties: false } },
    warnings: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', maxItems: 8, items: { type: 'object', properties: { skill: { type: 'string' }, ask: { type: 'string' }, quote: { type: 'string' }, category: { type: 'string' } }, required: ['skill', 'ask', 'quote', 'category'], additionalProperties: false } },
  };
  if (questions) base.screening_answers = { type: 'array', items: { type: 'string' }, minItems: questions, maxItems: questions };
  return { type: 'object', properties: base, required: ['letter', 'proof', 'warnings', 'gaps', ...(questions ? ['screening_answers'] : [])], additionalProperties: false };
}
export const partsOut = z.object({ letter: z.string().min(40), proof: z.array(z.object({ project: z.string(), text: z.string().min(5) })), warnings: z.array(z.string()), screening_answers: z.array(z.string()).optional(),
  gaps: z.array(z.object({ skill: z.string().trim().min(1).max(120), ask: z.string().trim().min(1).max(400), quote: z.string().trim().max(400), category: z.string().trim().max(120) })).max(8).optional() });

/** One project's proof block, written on its own (a project added after the proposal was written). */
export const proofSchema = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } as const;
export const proofOut = z.object({ text: z.string().min(5) });

/**
 * The sign off, from the profile: "Best regards," and the name, then the code link. A profile's own signature is used as it is
 * only when it is a ready sign off (it opens with a closing such as "Best regards" or "Thanks"); a note about how to sign off
 * ("Hamza Yaseen, then the GitHub link on the next line") is guidance, and the standard sign off already follows it.
 */
export const READY_SIGNOFF = /^(best regards|kind regards|warm regards|regards|best|thanks|thank you|many thanks|cheers|sincerely)\b/i;
export function signoff(s: { name: string; signature?: string | null; gitlab_link?: string | null }): string {
  const own = s.signature?.trim();
  const base = own && READY_SIGNOFF.test(own) ? own : `Best regards,\n${s.name}`;
  return s.gitlab_link && !base.toLowerCase().includes(s.gitlab_link.toLowerCase()) ? `${base}\n${s.gitlab_link}` : base;
}
/** The Loom line, from the admin setting's wording ({title} and {url} are filled in). */
export function loomLine(template: string, loom: { title: string; url: string } | null): string {
  if (!loom) return '';
  const t = (template || 'Here is a short video walkthrough of a similar build:\n{url}').replace(/\{title\}/g, loom.title).replace(/\{url\}/g, loom.url);
  return t.includes(loom.url) ? t : `${t}\n${loom.url}`;
}
/**
 * R142 (Hamza): the video lines of a proposal: the first video in the admin's wording (as before), then each video added after it
 * on its own line, "Title: link", all in the one place, so a change of videos swaps the whole block.
 */
export function videoLines(template: string, first: { title: string; url: string } | null, more: { title: string; url: string }[] = []): string {
  const extra = more.filter((v) => v && v.url && v.url !== first?.url);
  if (!first) return extra.map((v) => `${v.title}: ${v.url}`).join('\n');
  return [loomLine(template, first), ...extra.map((v) => `${v.title}: ${v.url}`)].join('\n');
}
/** The proof as it reads in the proposal: each block, then its link on its own line. */
/**
 * R134 (Hamza): where a proposal type puts a project's links, read from its own format text. Every type with project sections writes
 * "Project Name – Project Title", then "[project link]" on the next line, then the description: the links go under the title. A type of
 * one-line link lines ("Project Name – [link]") puts the link on the name's line. Neither: under the block, as before.
 */
export type LinkPlace = 'title' | 'inline' | 'end';
export function linkPlace(typeText: string | null | undefined): LinkPlace {
  const lines = String(typeText ?? '').split('\n').map((l) => l.trim());
  let title = 0, inline = 0;
  lines.forEach((l, k) => {
    if (!/\[\s*(project\s+)?links?\s*\]/i.test(l)) return;
    if (l.replace(/\[\s*(project\s+)?links?\s*\]/i, '').replace(/[\s\u2013\u2014:|-]/g, '')) { inline++; return; } // "Project Name – [link]"
    const prev = lines.slice(0, k).reverse().find((x) => x); if (prev && prev.length <= 160) title++;
  });
  return title ? 'title' : inline ? 'inline' : 'end';
}
/** One project's block with its links where its type puts them. */
export function layoutBlock(text: string, links: ProjectLink[], place: LinkPlace = 'end'): string {
  const t = text.trim(), add = linkLines(links, t);
  if (!add.length) return t;
  const first = t.split('\n')[0], rest = t.slice(first.length), titled = first.trim().length <= 160 && rest.trim().length > 0;
  if (place === 'inline' && !rest.trim() && links.length) { // the name's own line: "Chairboss – https://...", any other links under it
    const [one, ...more] = add; return [`${first.trim().replace(/[\s\u2013\u2014:-]+$/, '')} \u2013 ${one.replace(/^(Web|Android|iOS) link: /, '')}`, ...more].join('\n');
  }
  if ((place === 'title' || place === 'inline') && titled) return `${first}\n${add.join('\n')}${rest}`; // under the title, the description after
  return [t, ...add].join('\n');
}
export const proofText = (proof: ProofBlock[], place: LinkPlace = 'end') => proof.map((p) => {
  const links = p.links?.length ? p.links : p.link ? [{ label: 'Web link', url: p.link }] : [];
  return layoutBlock(p.text, links, place);
}).join('\n\n');

/** A letter that came back with a name, link or sign off in it anyway is still usable: the markers are what matter. */
export function cleanLetter(letter: string): string {
  let t = String(letter ?? '').replace(/\r\n/g, '\n').trim();
  // a sign off the writer added at the end, despite the rules
  t = t.replace(/\n+\s*(best regards|kind regards|regards|best|thanks|thank you|cheers),?\s*\n[\s\S]{0,200}$/i, '').trim();
  return t;
}

/** The whole proposal from its parts. A missing marker is handled: the proof goes before the last paragraph, the video before the sign off. */
export function assemble(p: { letter: string; proof: ProofBlock[]; loomLine: string; signoff: string; place?: LinkPlace }): string {
  const proof = proofText(p.proof, p.place);
  let t = cleanLetter(p.letter);
  const put = (marker: string, text: string, fallback: (t: string) => string) => {
    const re = new RegExp(`^[ \\t]*${marker.replace(/[[\]]/g, '\\$&')}[ \\t]*$`, 'm');
    if (re.test(t)) return t.replace(re, text);
    return text ? fallback(t) : t;
  };
  t = put(PROOF, proof, (x) => { const paras = x.split(/\n{2,}/); return paras.length > 1 ? [...paras.slice(0, -1), proof, paras[paras.length - 1]].join('\n\n') : `${x}\n\n${proof}`; });
  t = put(VIDEO, p.loomLine, (x) => `${x}\n\n${p.loomLine}`);
  t = t.replace(/\[\[(PROOF|VIDEO)\]\]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return `${t}\n\n${p.signoff}`.trim();
}

/** Which proof blocks a new set of projects needs: the ones kept (in the new order) and the projects that need writing. */
export function proofFor(have: ProofBlock[], want: { id: number; name: string; link: string | null }[]): { keep: ProofBlock[]; missing: { id: number; name: string; link: string | null }[] } {
  const keep: ProofBlock[] = []; const missing: { id: number; name: string; link: string | null }[] = [];
  for (const w of want) {
    const h = have.find((x) => (x.project_id != null && x.project_id === w.id) || x.name.toLowerCase() === w.name.toLowerCase());
    if (h) keep.push({ ...h, project_id: w.id, name: w.name, link: w.link }); else missing.push(w);
  }
  return { keep, missing };
}
