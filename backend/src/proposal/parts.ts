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

export interface ProofBlock { project_id: number | null; name: string; text: string; link: string | null }
/** Stored with every version made from parts. A version without it was edited by hand (or by the chat): its text is the person's. */
export interface Parts { letter: string; proof: ProofBlock[]; loom: { id: number | null; title: string; url: string } | null; profile_id: number | null; signoff: string }

export const PARTS_RULES = `WRITE IN PARTS (the app puts the proposal together, so one part can be changed later without rewriting the rest)
- "letter": the whole proposal EXCEPT three things the app adds: the proof of past projects, the Loom video line and the sign off.
  Where the proposal type puts the proof of past work, write the line ${PROOF} on its own. Write the line ${VIDEO} on its own
  where a Loom video line would go (always, even when no video is chosen: the app takes it out). Never name a project, never write
  a link, and never write a sign off or the sender's name in the letter. You may say "the projects below" or "similar builds".
- "proof": one item per project in PROJECTS, in the order given. "project" is its exact name. "text" is how this proposal shows it,
  in the type's format: the project's name, then one or two sentences on what it proves for THIS job, from its facts only. No link:
  the app adds the project's link on the next line.
- These rules replace rule 4 (the sign off) and the LOOM VIDEO instruction: the app adds both.
- Never mention the parts, the markers or the app in "warnings": the person never sees them.`;

/** The writer's answer in parts mode; `screening_answers` only when the client used Upwork's questions section. */
export function partsSchema(questions: number) {
  const base: Record<string, unknown> = {
    letter: { type: 'string' },
    proof: { type: 'array', items: { type: 'object', properties: { project: { type: 'string' }, text: { type: 'string' } }, required: ['project', 'text'], additionalProperties: false } },
    warnings: { type: 'array', items: { type: 'string' } },
  };
  if (questions) base.screening_answers = { type: 'array', items: { type: 'string' }, minItems: questions, maxItems: questions };
  return { type: 'object', properties: base, required: ['letter', 'proof', 'warnings', ...(questions ? ['screening_answers'] : [])], additionalProperties: false };
}
export const partsOut = z.object({ letter: z.string().min(40), proof: z.array(z.object({ project: z.string(), text: z.string().min(5) })), warnings: z.array(z.string()), screening_answers: z.array(z.string()).optional() });

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
  const t = (template || 'I recorded a short walkthrough of {title}:\n{url}').replace(/\{title\}/g, loom.title).replace(/\{url\}/g, loom.url);
  return t.includes(loom.url) ? t : `${t}\n${loom.url}`;
}
/** The proof as it reads in the proposal: each block, then its link on its own line. */
export const proofText = (proof: ProofBlock[]) => proof.map((p) => (p.link && !p.text.includes(p.link) ? `${p.text.trim()}\n${p.link}` : p.text.trim())).join('\n\n');

/** A letter that came back with a name, link or sign off in it anyway is still usable: the markers are what matter. */
export function cleanLetter(letter: string): string {
  let t = String(letter ?? '').replace(/\r\n/g, '\n').trim();
  // a sign off the writer added at the end, despite the rules
  t = t.replace(/\n+\s*(best regards|kind regards|regards|best|thanks|thank you|cheers),?\s*\n[\s\S]{0,200}$/i, '').trim();
  return t;
}

/** The whole proposal from its parts. A missing marker is handled: the proof goes before the last paragraph, the video before the sign off. */
export function assemble(p: { letter: string; proof: ProofBlock[]; loomLine: string; signoff: string }): string {
  const proof = proofText(p.proof);
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
