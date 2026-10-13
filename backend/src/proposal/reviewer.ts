/**
 * The independent reviewer: a second reader that scores a finished proposal before anyone copies it. It gets the same facts
 * the writer had (the job, the sender, the projects, the proposal type's rules, the writing guide) but its own instructions,
 * so it does not grade the writer's work the way the writer would. It never rewrites the proposal: it scores it, says why,
 * and suggests two or three changes the person can ask for in the chat.
 */
import { z } from 'zod';
import { htmlToPlain } from '../html';
import type { Guide } from './guide';
import type { ProjectFact, SenderFact, TemplateFact } from './writer';

export const reviewSchema = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 1, maximum: 10 },
    verdict: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    problems: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    suggestions: { type: 'array', minItems: 0, maxItems: 3, items: { type: 'object', properties: { title: { type: 'string' }, instruction: { type: 'string' } }, required: ['title', 'instruction'], additionalProperties: false } },
  },
  required: ['score', 'verdict', 'strengths', 'problems', 'suggestions'], additionalProperties: false,
} as const;
export const reviewOut = z.object({
  score: z.coerce.number().int().min(1).max(10), verdict: z.string().trim().min(1).max(600),
  strengths: z.array(z.string().trim().min(1).max(400)).max(3), problems: z.array(z.string().trim().min(1).max(500)).max(4),
  suggestions: z.array(z.object({ title: z.string().trim().min(1).max(120), instruction: z.string().trim().min(1).max(600) })).max(3),
});
export type Review = z.infer<typeof reviewOut>;

const lines = (xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join('\n');

export function reviewerSystem(a: { template: TemplateFact | null; signals: string[]; sender: SenderFact; projects: ProjectFact[]; clientRequirements: string[]; guide?: Guide; checkWarnings: string[] }): string {
  return lines([
    'You are an independent reviewer of Upwork proposals for Stackup Solutions. Someone else wrote the proposal below. You did not write it and you owe it nothing.',
    'Your reader is the client who posted the job: busy, reading many proposals, deciding in the first two lines whether to open this one.',
    '',
    'Judge the proposal on these, in this order:',
    '1. The first two lines: do they speak to THIS client\'s problem in a way only this post could have produced, or could they open any proposal?',
    '2. Does it answer what the post actually asks, including every explicit ask, screening need and requirement below?',
    '3. Proof: are the projects the right ones for this job, and is what is said about them specific and true to the facts given? Anything not in the facts is invented and is a serious fault.',
    '4. Does it follow the proposal type\'s format and length, and the writing rules?',
    '5. Would a client reply? A clear, easy next step, in the sender\'s own voice.',
    '',
    'Score from 1 to 10, as a whole number, and be strict:',
    '  9 or 10: ready to send as it is. Rare.',
    '  7 or 8: good; one or two small changes would make it better.',
    '  5 or 6: usable but generic or missing something the client asked for.',
    '  3 or 4: weak: the opening could fit any job, or an explicit ask is unanswered, or the proof does not fit.',
    '  1 or 2: do not send: invented facts, the wrong job, or it breaks the rules below.',
    'Do not round up to be kind. A proposal with an invented fact, a missed explicit ask or a generic opening cannot score above 6.',
    '',
    'Write:',
    '- "verdict": one or two plain sentences on whether to send it and why.',
    '- "strengths": up to three things that work, each one specific to this proposal.',
    '- "problems": up to four things that hurt it, most serious first. Quote the few words you mean.',
    '- "suggestions": two or three changes worth making, the ones that would raise the score most. None if it is a 9 or 10. Each has a short "title" and an "instruction": one or two sentences written as a request to the person who edits the proposal, specific enough to act on without reading your review ("Replace the first sentence with one that names their four clinics and the missed after hours calls"). Never ask for a fact that is not in the facts given.',
    'Plain English, sentence case, no dashes, no emojis. Do not rewrite the proposal. Do not praise for the sake of balance.',
    '',
    `CLIENT REQUIREMENTS (from the screening of this post)\n${a.clientRequirements.length ? a.clientRequirements.map((r) => '  - ' + r).join('\n') : '  (none found)'}`,
    '',
    a.template ? `PROPOSAL TYPE IT WAS WRITTEN AS: ${a.template.name}\n${htmlToPlain(a.template.body_html)}` : 'PROPOSAL TYPE: not recorded',
    '',
    a.signals.length ? `WHAT THE POST SIGNALS\n${a.signals.map((s) => '  - ' + s).join('\n')}` : '',
    '',
    a.guide?.rules ? `WRITING RULES\n${a.guide.rules}` : '', a.guide?.banned ? `\nBANNED PHRASES\n${a.guide.banned}` : '', a.guide?.checklist ? `\nCHECKLIST\n${a.guide.checklist}` : '',
    '',
    'THE FACTS THE WRITER HAD (anything in the proposal beyond these is invented)',
    `  Sender: ${a.sender.name}${a.sender.tagline ? ', ' + a.sender.tagline : ''}`,
    a.sender.voice ? `  Voice: ${a.sender.voice}` : '', a.sender.signature ? `  Signature: ${a.sender.signature}` : '', `  Code link: ${a.sender.gitlab_link ?? '(none)'}`,
    a.sender.stats ? `  Upwork stats allowed: ${a.sender.stats}` : '', a.sender.rules ? `  Profile rules: ${a.sender.rules}` : '',
    a.sender.loom ? `  Loom video sent with it: ${a.sender.loom.title} (${a.sender.loom.url})${a.sender.loom.topic ? ': ' + a.sender.loom.topic : ''}` : '  Loom video: none',
    ...a.projects.map((p, i) => lines([`  Project ${i + 1}: ${p.name}`, `    Link: ${p.live_link ?? '(none)'}`, p.overview ? `    Overview: ${p.overview}` : '', p.case_study ? `    Case study: ${p.case_study}` : '', p.notes ? `    Notes: ${p.notes}` : ''])),
    '',
    a.checkWarnings.length ? `AUTOMATIC CHECKS ALREADY FOUND\n${a.checkWarnings.map((w) => '  - ' + w).join('\n')}` : '',
  ]);
}
