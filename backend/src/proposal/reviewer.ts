/**
 * The independent reviewer: a second reader that scores a finished proposal before anyone copies it. It gets the same facts
 * the writer had (the job, the sender, the projects, the proposal type's rules, the writing guide) but its own instructions,
 * so it does not grade the writer's work the way the writer would. It never rewrites the proposal: it scores it, says why,
 * and suggests two or three changes the person can ask for in the chat.
 */
import { templateBlock } from './opening_templates';
import { z } from 'zod';
import { htmlToPlain } from '../html';
import type { Guide } from './guide';
import type { ProjectFact, SenderFact, TemplateFact } from './writer';
import { withCompany } from '../company';

/**
 * What an admin controls on the Reviewer page (R61), kept as versions: how it reviews, what matters most, dos and don'ts, the
 * score guide and limits, how to write the review, how many of each it gives and which facts it reads. The output format and the
 * facts themselves are fixed here, so the app and the plugin can always read a review.
 */
export const reviewerSections = z.object({
  method: z.string().trim().min(20, 'Say how the reviewer should review').max(6000),
  concerns: z.array(z.string().trim().min(3).max(600)).min(1, 'Give at least one key concern').max(15),
  dos: z.array(z.string().trim().min(3).max(600)).max(25).default([]),
  donts: z.array(z.string().trim().min(3).max(600)).max(25).default([]),
  score_guide: z.string().trim().min(20, 'Describe what each score means').max(4000),
  score_limits: z.array(z.string().trim().min(3).max(600)).max(15).default([]),
  writing: z.string().trim().max(4000).default(''),
  limits: z.object({ strengths: z.number().int().min(0).max(5), problems: z.number().int().min(1).max(6), suggestions: z.number().int().min(0).max(5) }),
  context: z.object({ signals: z.boolean(), writing_rules: z.boolean(), banned_phrases: z.boolean(), checklist: z.boolean(), automatic_checks: z.boolean() }),
});
export type ReviewerSections = z.infer<typeof reviewerSections>;

/** Version 1: the reviewer as it was written in code before the Reviewer page (R54), split into its sections. */
export const DEFAULT_REVIEWER: ReviewerSections = {
  method: 'You are an independent reviewer of Upwork proposals for {company}. Someone else wrote the proposal below. You did not write it and you owe it nothing.\nYour reader is the client who posted the job: busy, reading many proposals, deciding in the first two lines whether to open this one.',
  concerns: [
    'The first two lines: do they speak to THIS client\'s problem in a way only this post could have produced, or could they open any proposal?',
    'Does it answer what the post actually asks, including every explicit ask, screening need and requirement below?',
    'Proof: are the projects the right ones for this job, and is what is said about them specific and true to the facts given? Anything not in the facts is invented and is a serious fault.',
    'Does it follow the proposal type\'s format and length, and the writing rules?',
    'Would a client reply? A clear, easy next step, in the sender\'s own voice.',
  ],
  dos: ['Be strict.', 'Quote the few words you mean when you name a problem.', 'Write in plain English, sentence case, no dashes, no emojis.'],
  donts: ['Do not round up to be kind.', 'Do not rewrite the proposal.', 'Do not praise for the sake of balance.', 'Never ask for a fact that is not in the facts given.'],
  score_guide: '9 or 10: ready to send as it is. Rare.\n7 or 8: good; one or two small changes would make it better.\n5 or 6: usable but generic or missing something the client asked for.\n3 or 4: weak: the opening could fit any job, or an explicit ask is unanswered, or the proof does not fit.\n1 or 2: do not send: invented facts, the wrong job, or it breaks the rules below.',
  score_limits: ['A proposal with an invented fact, a missed explicit ask or a generic opening cannot score above 6.'],
  writing: 'Strengths are specific to this proposal. Problems come most serious first. Suggestions are the changes that would raise the score most, none if it is a 9 or 10. Each suggestion has a short title and an instruction: one or two sentences written as a request to the person who edits the proposal, specific enough to act on without reading your review ("Replace the first sentence with one that names their four clinics and the missed after hours calls").',
  limits: { strengths: 3, problems: 4, suggestions: 3 },
  context: { signals: true, writing_rules: true, banned_phrases: true, checklist: true, automatic_checks: true },
};

/** The output the app and the plugin read. Its shape is fixed; how many of each comes from the version. */
export function reviewSchemaFor(l: ReviewerSections['limits'] = DEFAULT_REVIEWER.limits) {
  return {
    type: 'object',
    properties: {
      score: { type: 'integer', minimum: 1, maximum: 10 },
      verdict: { type: 'string' },
      strengths: { type: 'array', items: { type: 'string' }, maxItems: l.strengths },
      problems: { type: 'array', items: { type: 'string' }, maxItems: l.problems },
      suggestions: { type: 'array', minItems: 0, maxItems: l.suggestions, items: { type: 'object', properties: { title: { type: 'string' }, instruction: { type: 'string' } }, required: ['title', 'instruction'], additionalProperties: false } },
    },
    required: ['score', 'verdict', 'strengths', 'problems', 'suggestions'], additionalProperties: false,
  } as const;
}
export const reviewSchema = reviewSchemaFor();
export const reviewOut = z.object({
  score: z.coerce.number().int().min(1).max(10), verdict: z.string().trim().min(1).max(600),
  strengths: z.array(z.string().trim().min(1).max(400)).max(5), problems: z.array(z.string().trim().min(1).max(500)).max(6),
  suggestions: z.array(z.object({ title: z.string().trim().min(1).max(120), instruction: z.string().trim().min(1).max(600) })).max(5),
});
export type Review = z.infer<typeof reviewOut>;

const lines = (xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join('\n');

export function reviewerSystem(a: { template: TemplateFact | null; signals: string[]; sender: SenderFact; projects: ProjectFact[]; clientRequirements: string[]; guide?: Guide; checkWarnings: string[] }, r: ReviewerSections = DEFAULT_REVIEWER): string {
  const list = (xs: string[]) => xs.map((x) => '- ' + x).join('\n');
  const L = r.limits;
  return lines([
    withCompany(r.method),
    '',
    `Judge the proposal on these, in this order:\n${r.concerns.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
    '',
    `Score from 1 to 10, as a whole number:\n${r.score_guide.split('\n').map((x) => '  ' + x.trim()).filter((x) => x.trim()).join('\n')}`,
    r.score_limits.length ? `SCORE LIMITS (these always hold)\n${list(r.score_limits)}` : '',
    '',
    r.dos.length ? `DO\n${list(r.dos)}` : '',
    r.donts.length ? `DO NOT\n${list(r.donts)}` : '',
    '',
    'Write:',
    '- "verdict": one or two plain sentences on whether to send it and why.',
    `- "strengths": ${L.strengths ? `up to ${L.strengths} things that work.` : 'none: leave it empty.'}`,
    `- "problems": up to ${L.problems} things that hurt it, most serious first.`,
    `- "suggestions": ${L.suggestions ? `up to ${L.suggestions} changes worth making, each with a short "title" and an "instruction".` : 'none: leave it empty.'}`,
    r.writing ? `HOW TO WRITE THE REVIEW\n${r.writing}` : '',
    '',
    `CLIENT REQUIREMENTS (from the screening of this post)\n${a.clientRequirements.length ? a.clientRequirements.map((r) => '  - ' + r).join('\n') : '  (none found)'}`,
    '',
    a.template ? `PROPOSAL TYPE IT WAS WRITTEN AS: ${a.template.name}\n${htmlToPlain(a.template.body_html)}` : 'PROPOSAL TYPE: not recorded',
    '',
    r.context.signals && a.signals.length ? `WHAT THE POST SIGNALS\n${a.signals.map((s) => '  - ' + s).join('\n')}` : '',
    '',
    r.context.writing_rules && a.guide?.rules ? `WRITING RULES\n${a.guide.rules}` : '', r.context.writing_rules && a.guide?.opening ? `\nOPENING LINES (every opening; the opening template below may make its own exceptions)\n${a.guide.opening}` : '', r.context.writing_rules && a.template?.opening ? `\nTHE OPENING TEMPLATE THIS PROPOSAL'S OPENING FOLLOWS (judge the opening by it; its exceptions are allowed)\n${templateBlock(a.template.opening)}` : '', r.context.banned_phrases && a.guide?.banned ? `\nBANNED PHRASES\n${a.guide.banned}` : '', r.context.checklist && a.guide?.checklist ? `\nCHECKLIST\n${a.guide.checklist}` : '',
    '',
    'THE FACTS THE WRITER HAD (anything in the proposal beyond these is invented)',
    `  Sender: ${a.sender.name}${a.sender.tagline ? ', ' + a.sender.tagline : ''}`,
    a.sender.voice ? `  Voice: ${a.sender.voice}` : '', a.sender.signature ? `  Signature: ${a.sender.signature}` : '', `  Code link: ${a.sender.gitlab_link ?? '(none)'}`,
    a.sender.stats ? `  Upwork stats allowed: ${a.sender.stats}` : '', a.sender.rules ? `  Profile rules: ${a.sender.rules}` : '',
    a.sender.loom ? `  Loom video sent with it: ${a.sender.loom.title} (${a.sender.loom.url})${a.sender.loom.topic ? ': ' + a.sender.loom.topic : ''}` : '  Loom video: none',
    ...a.projects.map((p, i) => lines([`  Project ${i + 1}: ${p.name}`, `    Link: ${p.live_link ?? '(none)'}`, p.overview ? `    Overview: ${p.overview}` : '', p.case_study ? `    Case study: ${p.case_study}` : '', p.notes ? `    Notes: ${p.notes}` : ''])),
    '',
    r.context.automatic_checks && a.checkWarnings.length ? `AUTOMATIC CHECKS ALREADY FOUND\n${a.checkWarnings.map((w) => '  - ' + w).join('\n')}` : '',
  ]);
}
