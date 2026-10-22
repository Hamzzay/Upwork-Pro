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
/** One thing the reviewer scores, with its weight in the total and what a high and a low score look like. */
export const criterion = z.object({ name: z.string().trim().min(2, 'Name each criterion').max(80), weight: z.number().int().min(0).max(100),
  look_for: z.string().trim().max(1500).default(''), high: z.string().trim().max(800).default(''), low: z.string().trim().max(800).default('') });
/** A rule that always holds: when it applies, the score can be no higher than max. */
export const cap = z.object({ rule: z.string().trim().min(3, 'Say when the cap applies').max(400), max: z.number().int().min(1).max(10) });
/** Key points for one proposal type (by its name), added to the general ones when a proposal of that type is reviewed. */
export const typeNotes = z.object({ type: z.string().trim().min(1).max(160), key_points: z.array(z.string().trim().min(3).max(600)).max(20).default([]) });
export const reviewerSections = z.object({
  method: z.string().trim().min(20, 'Say how the reviewer should review').max(6000),
  concerns: z.array(z.string().trim().min(3).max(600)).min(1, 'Give at least one key concern').max(15),
  dos: z.array(z.string().trim().min(3).max(600)).max(25).default([]),
  donts: z.array(z.string().trim().min(3).max(600)).max(25).default([]),
  score_guide: z.string().trim().min(20, 'Describe what each score means').max(4000),
  score_limits: z.array(z.string().trim().min(3).max(600)).max(15).default([]),
  writing: z.string().trim().max(4000).default(''),
  limits: z.object({ strengths: z.number().int().min(0).max(5), problems: z.number().int().min(1).max(6), suggestions: z.number().int().min(0).max(5) }),
  context: z.object({ signals: z.boolean(), writing_rules: z.boolean(), banned_phrases: z.boolean(), checklist: z.boolean(), automatic_checks: z.boolean(),
    // R115: more of what the writer had, so a true claim is never called invented
    experience: z.boolean().default(true), documents: z.boolean().default(true), type_samples: z.boolean().default(true) }),
  // R115, all optional so earlier versions keep working: weighted criteria (the app adds the score up), caps, key points (general and
  // per proposal type), examples from the library, and the opening, body and screening answers judged apart
  criteria: z.array(criterion).max(10).default([]),
  caps: z.array(cap).max(15).default([]),
  key_points: z.array(z.string().trim().min(3).max(600)).max(25).default([]),
  per_type: z.array(typeNotes).max(20).default([]),
  examples: z.object({ use: z.boolean(), per_review: z.number().int().min(0).max(6) }).default({ use: false, per_review: 0 }),
  parts: z.boolean().default(false),
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
  context: { signals: true, writing_rules: true, banned_phrases: true, checklist: true, automatic_checks: true, experience: false, documents: false, type_samples: false },
  criteria: [], caps: [], key_points: [], per_type: [], examples: { use: false, per_review: 0 }, parts: false,
};

/** The output the app and the plugin read. Its shape is fixed; how many of each comes from the version. */
export function reviewSchemaFor(l: ReviewerSections['limits'] = DEFAULT_REVIEWER.limits, sec?: Pick<ReviewerSections, 'criteria' | 'caps' | 'parts'>) {
  const crit = sec?.criteria?.length ? sec.criteria : null, caps = sec?.caps?.length ? sec.caps : null;
  const part = { type: 'object', properties: { score: { type: 'integer', minimum: 1, maximum: 10 }, note: { type: 'string' } }, required: ['score', 'note'], additionalProperties: false };
  const extra: Record<string, any> = {};
  if (crit) extra.criteria_scores = { type: 'array', minItems: crit.length, maxItems: crit.length, items: { type: 'object', properties: {
    criterion: { type: 'string', enum: crit.map((c) => c.name) }, score: { type: 'integer', minimum: 1, maximum: 10 }, why: { type: 'string' } }, required: ['criterion', 'score', 'why'], additionalProperties: false } };
  if (caps) extra.caps_hit = { type: 'array', items: { type: 'integer', minimum: 1, maximum: caps.length } };
  if (sec?.parts) extra.parts = { type: 'object', properties: { opening: part, body: part, answers: { anyOf: [part, { type: 'null' }] } }, required: ['opening', 'body', 'answers'], additionalProperties: false };
  return {
    type: 'object',
    properties: {
      ...extra,
      score: { type: 'integer', minimum: 1, maximum: 10 },
      verdict: { type: 'string' },
      strengths: { type: 'array', items: { type: 'string' }, maxItems: l.strengths },
      problems: { type: 'array', items: { type: 'string' }, maxItems: l.problems },
      suggestions: { type: 'array', minItems: 0, maxItems: l.suggestions, items: { type: 'object', properties: { title: { type: 'string' }, instruction: { type: 'string' } }, required: ['title', 'instruction'], additionalProperties: false } },
    },
    required: [...Object.keys(extra), 'score', 'verdict', 'strengths', 'problems', 'suggestions'], additionalProperties: false,
  };
}
export const reviewSchema = reviewSchemaFor();
export const reviewOut = z.object({
  score: z.coerce.number().int().min(1).max(10), verdict: z.string().trim().min(1).max(600),
  strengths: z.array(z.string().trim().min(1).max(400)).max(5), problems: z.array(z.string().trim().min(1).max(500)).max(6),
  suggestions: z.array(z.object({ title: z.string().trim().min(1).max(120), instruction: z.string().trim().min(1).max(600) })).max(5),
  criteria_scores: z.array(z.object({ criterion: z.string(), score: z.coerce.number().int().min(1).max(10), why: z.string().trim().max(600) })).optional(),
  caps_hit: z.array(z.coerce.number().int().min(1)).optional(),
  parts: z.object({ opening: z.object({ score: z.coerce.number().int().min(1).max(10), note: z.string().max(600) }), body: z.object({ score: z.coerce.number().int().min(1).max(10), note: z.string().max(600) }),
    answers: z.object({ score: z.coerce.number().int().min(1).max(10), note: z.string().max(600) }).nullable() }).optional(),
});

/**
 * The score the app gives (R115): with criteria, the weighted average of the reviewer's criterion scores, rounded, then no higher
 * than any cap it said applies. Without criteria, the reviewer's own score. Keeps what the reviewer said (ai_score) and why it was capped.
 */
export function finalScore(rv: Review, sec: Pick<ReviewerSections, 'criteria' | 'caps'>): Review & { ai_score: number; weighted?: number; capped_by?: { rule: string; max: number }[] } {
  const out: any = { ...rv, ai_score: rv.score };
  let score = rv.score;
  if (sec.criteria.length && rv.criteria_scores?.length) {
    const byName = new Map(rv.criteria_scores.map((c) => [c.criterion, c.score]));
    const rows = sec.criteria.map((c) => ({ w: c.weight, s: byName.get(c.name) })).filter((x): x is { w: number; s: number } => x.s != null);
    const total = rows.reduce((n, x) => n + x.w, 0);
    if (rows.length) { const avg = total > 0 ? rows.reduce((n, x) => n + x.w * x.s, 0) / total : rows.reduce((n, x) => n + x.s, 0) / rows.length; out.weighted = Math.round(avg * 10) / 10; score = Math.round(avg + 1e-9); }
  }
  const capped = (rv.caps_hit ?? []).map((i) => sec.caps[i - 1]).filter(Boolean);
  if (capped.length) { out.capped_by = capped; score = Math.min(score, ...capped.map((c) => c.max)); }
  out.score = Math.max(1, Math.min(10, score));
  return out;
}
export type Review = z.infer<typeof reviewOut>;

const lines = (xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join('\n');

/** What a reviewer example from the library looks like when the reviewer reads it. */
export interface ReviewerExample { title: string; type: string | null; score: number; why: string; text: string }
export function reviewerSystem(a: { template: TemplateFact | null; signals: string[]; sender: SenderFact; projects: ProjectFact[]; clientRequirements: string[]; guide?: Guide; checkWarnings: string[];
  experience?: string[]; documents?: string | null; samples?: { title: string; content: string }[]; examples?: ReviewerExample[]; opening?: string | null }, r: ReviewerSections = DEFAULT_REVIEWER): string {
  const typeNotes = a.template ? r.per_type.find((t) => t.type.trim().toLowerCase() === a.template!.name.trim().toLowerCase())?.key_points ?? [] : [];
  const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n) + ' [cut]' : t);
  const list = (xs: string[]) => xs.map((x) => '- ' + x).join('\n');
  const L = r.limits;
  return lines([
    withCompany(r.method),
    '',
    `Judge the proposal on these, in this order:\n${r.concerns.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
    '',
    r.key_points.length ? `KEY POINTS (what Stackup expects in every proposal)\n${list(r.key_points)}\n` : '',
    typeNotes.length ? `KEY POINTS FOR THIS PROPOSAL TYPE (${a.template!.name})\n${list(typeNotes)}\n` : '',
    r.criteria.length ? `SCORE EACH CRITERION from 1 to 10 in "criteria_scores", with one sentence on why. The app works out the final score from these and their weights, so judge each on its own:\n${r.criteria.map((c, i) => lines([`${i + 1}. ${c.name} (weight ${c.weight})${c.look_for ? ': ' + c.look_for : ''}`, c.high ? `   A high score: ${c.high}` : '', c.low ? `   A low score: ${c.low}` : ''])).join('\n')}\n` : '',
    r.caps.length ? `CAPS: when one of these applies, put its number in "caps_hit" (the app then caps the score):\n${r.caps.map((c, i) => `${i + 1}. ${c.rule} (score no higher than ${c.max})`).join('\n')}\n` : '',
    r.parts ? 'PARTS: also score in "parts" the opening (the first paragraph, what Upwork shows before the client opens it), the body, and the screening answers (null when there are none), each with a one sentence note.\n' : '',
    a.examples?.length ? `EXAMPLES: proposals Stackup has scored, and why. Score this proposal on the same standard (these are for calibration, never facts about this job):\n${a.examples.map((e, i) => `--- Example ${i + 1}${e.type ? ' (' + e.type + ')' : ''}: scored ${e.score}/10. ${e.title}\nWhy: ${e.why}\n${cut(e.text, 3500)}`).join('\n')}\n---\n` : '',
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
    r.context.experience && a.experience?.length ? `  Experience the sender confirmed for this job (true, not invented):\n${a.experience.map((x) => '    - ' + x).join('\n')}` : '',
    ...a.projects.map((p, i) => lines([`  Project ${i + 1}: ${p.name}`, `    Link: ${p.live_link ?? '(none)'}`, p.overview ? `    Overview: ${p.overview}` : '', p.case_study ? `    Case study: ${p.case_study}` : '', p.notes ? `    Notes: ${p.notes}` : ''])),
    '',
    r.context.documents && a.documents ? `THE CLIENT'S DOCUMENTS (what the AI read from files the client attached)\n${cut(a.documents, 6000)}\n` : '',
    r.context.type_samples && a.samples?.length ? `PROPOSALS OF THIS TYPE THAT WORKED (the standard to compare with; their projects and facts are not this sender's)\n${a.samples.map((x) => `--- ${x.title}\n${cut(x.content, 2500)}`).join('\n')}\n` : '',
    a.opening ? `THE OPENING (the first paragraph, what the client sees first)\n${a.opening}\n` : '',
    r.context.automatic_checks && a.checkWarnings.length ? `AUTOMATIC CHECKS ALREADY FOUND\n${a.checkWarnings.map((w) => '  - ' + w).join('\n')}` : '',
  ]);
}

/**
 * The full built-in reviewer (R115): the starting point for tuning, written from the writing guide, the opening rules and the eight
 * proposal types. It scores by weighted criteria, judges the opening, body and answers apart, reads every fact the writer had and the
 * library's examples. Load it on the Reviewer page, change it, try it, save it as a version.
 */
export const REVIEWER_FULL: ReviewerSections = {
  method: 'You review Upwork proposals for {company} the way a demanding client and an experienced bid manager would, together. Someone else wrote the proposal below; you owe it nothing.\nYour reader is the client who posted this job: busy, reading many proposals, deciding from the first two lines whether to open this one, and from the rest whether to reply.\nJudge it against Stackup\'s own standard (the key points, the proposal type, the writing guide and the examples), not against a perfect proposal. A proposal that follows the guide, answers what the client asked and proves the work with true, specific facts is a good proposal and scores 7 or 8.',
  concerns: [
    'The opening: do the first two lines speak to this client\'s problem with a detail only this post contains, following the opening template?',
    'Does it answer everything the client asked, in the way they asked?',
    'Proof: do the projects prove this job\'s core work, with specific claims that are true to the facts given?',
    'Plan: does it commit to the client\'s stack and say what happens first and why?',
    'Format, voice and close: the proposal type\'s structure and length, the writing rules, the sender\'s voice and one easy next step.',
  ],
  dos: [
    'Quote the few words you mean when you name a problem.',
    'Credit what works: a proposal that follows the guide and answers the client is a 7 or 8.',
    'Treat the experience the sender confirmed as fact.',
    'Write in plain English, sentence case, no dashes, no emojis.',
  ],
  donts: [
    'Do not call a confirmed experience, an allowed stat or a fact from the project records invented.',
    'Do not lower the score for things the client did not ask for.',
    'Do not rewrite the proposal.',
    'Never ask for a fact that is not in the facts given.',
  ],
  score_guide: '9 or 10: send it as it is; clearly better than most proposals this client will get.\n7 or 8: good and ready to send, or ready after one small change. The standard the team aims for.\n5 or 6: usable, but generic in places or missing something the client asked for.\n3 or 4: weak: a real fault, such as an ask left unanswered, proof that does not fit or an opening that could open any proposal.\n1 or 2: do not send: invented facts, the wrong job or sender, or broken rules.',
  score_limits: [],
  writing: 'Strengths are specific to this proposal. Problems come most serious first. Suggestions are the changes that would raise the score most, none if it is a 9 or 10. Each suggestion has a short title and an instruction: one or two sentences written as a request to the person who edits the proposal, specific enough to act on without reading your review ("Replace the first sentence with one that names their four clinics and the missed after hours calls").',
  limits: { strengths: 3, problems: 4, suggestions: 3 },
  context: { signals: true, writing_rules: true, banned_phrases: true, checklist: true, automatic_checks: true, experience: true, documents: true, type_samples: true },
  criteria: [
    { name: 'Opening', weight: 30, look_for: 'The first two lines, what Upwork shows before the client opens the proposal.',
      high: 'Names this client\'s situation and the real risk, cause or decision, with a detail only this post contains; follows the opening template; reads like a person talking; gives a reason to open.',
      low: 'Could open any proposal; starts about us, with a greeting or with a generic claim; breaks the opening template.' },
    { name: 'Answers what was asked', weight: 25, look_for: 'Every explicit ask, screening question, required word or format and the structure the client asked for.',
      high: 'Every ask is answered, in the client\'s order and words, plainly; required opening words and format are used.',
      low: 'An ask or screening question is missed, dodged or answered vaguely; a required word or format is missing.' },
    { name: 'Proof', weight: 20, look_for: 'The projects and claims that show Stackup has done this work.',
      high: 'The projects prove this job\'s core work, each a different part of it, with what was built and a result, all true to the facts given.',
      low: 'Projects off target, or claims vague, stuffed with features, or beyond the facts.' },
    { name: 'Plan and fit', weight: 15, look_for: 'What happens first, in the client\'s stack, and why.',
      high: 'Commits to the client\'s stack and tools; names the first concrete step and why it matters to them; realistic for the scope.',
      low: 'No plan, a generic process, a different stack than asked, or promises the facts do not support.' },
    { name: 'Format, voice and close', weight: 10, look_for: 'The proposal type\'s structure and length, the writing rules and banned phrases, the sender\'s voice and signature, the close.',
      high: 'Follows the type\'s structure and length, the writing rules and the sender\'s voice and signature; ends with one easy next step.',
      low: 'Too long or too short for the type, banned phrases, dashes, the wrong voice or signature, or no clear next step.' },
  ],
  caps: [
    { rule: 'It invents a fact: a project, result, number, client, certification or experience that is not in the facts given.', max: 4 },
    { rule: 'It uses the wrong sender, signature, Upwork stats or a project link that is not in the facts.', max: 3 },
    { rule: 'It leaves out an opening word or a format the client required.', max: 5 },
    { rule: 'It leaves an explicit ask or a screening question unanswered.', max: 6 },
    { rule: 'Its opening could open any proposal (nothing from this post).', max: 6 },
  ],
  key_points: [
    'Lead with the client\'s problem, never with us.',
    'Two projects, each proving a different part of the job, each with what was built and a result.',
    'Plain English, sentence case, no dashes, no emojis, no banned phrases.',
    'No price or timeline unless the client asks; when they ask, answer honestly or offer a short call to scope it.',
    'Short sentences; every paragraph earns its place.',
    'One clear, easy next step at the end.',
  ],
  per_type: [
    { type: 'Type 1. Standard build', key_points: ['Opening: the pain, then what causes it or how to avoid it.', 'Two projects in the project format (name, title, link, what it did).', 'A plan that names their stack and the first thing to build, in about 45 to 55 words.', 'A call to action without a question.'] },
    { type: 'Type 2. Structured submission', key_points: ['Follows the structure the client asked for, item by item, in their order and using their wording as headings.', 'An experience sentence naming two or three similar projects, with link lines.', 'Nothing the client asked for is left out; gaps are answered honestly, not padded.'] },
    { type: 'Type 3. Invite', key_points: ['Thanks them once, by name when known.', 'The approach is anchored on their main pain and commits to their stack.', 'Stays light: about 100 to 160 words, named projects with links, no long case studies.', 'A concrete next step.'] },
    { type: 'Type 4. Rescue or takeover', key_points: ['Names the likely cause or biggest risk calmly; never blames the previous developer.', 'Projects are genuine takeovers, fixes or rebuilds.', 'Says what is checked in the first days before changing anything.', 'Shows immediate availability.'] },
    { type: 'Type 5. Architecture or consulting', key_points: ['A clear point of view on the key decision the client faces.', 'Projects where Stackup owned the architecture or key decisions.', 'Says what the client will hold at the end.', 'Offers a short discovery session.'] },
    { type: 'Type 6. Small fix or quick task', key_points: ['The likely cause, then the fix, in plain words.', 'Short: about 70 to 120 words.', 'Their stack, two similar fixes with links, immediate availability.'] },
    { type: 'Type 7. Problem first', key_points: ['Starts with "Understood." unless the client asked for another first word.', 'A 20 to 30 word problem statement, then "I\'ve built" with two relevant projects.', 'An approach of about 45 to 55 words and a short call to action.'] },
    { type: 'Type 8. Approach first with questions', key_points: ['Starts with "For your platform," or "For you," unless the client asked for another opening.', 'The approach comes first, with stack and process; two projects follow.', 'Two short, engaging questions, then a short call to action.'] },
  ],
  examples: { use: true, per_review: 3 },
  parts: true,
};
