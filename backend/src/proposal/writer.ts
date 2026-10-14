import { z } from 'zod';
import { htmlToPlain } from '../html';
import type { DetectedValue } from './signals';
import { guideBlock, type Guide } from './guide';
import { PARTS_RULES } from './parts';
import { companyName } from '../company';

export interface ProjectFact { id?: number | null; name: string; live_link: string | null; tags: string[]; industries: string[]; notes: string | null; overview?: string | null; case_study?: string | null }
/** The profile the proposal is sent from. `gitlab_link` is its code link: the GitLab account, or else the GitHub link. */
export interface SenderFact { name: string; gitlab_link: string | null; tagline: string | null; voice?: string | null; signature?: string | null; stats?: string | null; rules?: string | null; certifications?: string | null; /** The Loom video the person chose to send with this proposal, if any. */ loom?: { title: string; url: string; topic: string | null } | null }
export interface SampleFact { title: string; content: string }
export interface TemplateFact { name: string; body_html: string; prompt: string | null; opening_rules?: string | null; opening_no_us?: boolean; opening_starts?: string | null }
/** The strict rules for the first two lines, the part Upwork shows in the preview. */
/**
 * The first two lines (R68): the Writing guide's "Opening lines" document, the defaults for every type, then the proposal type's
 * own rules, which win where the two differ.
 */
export function openingSection(t: TemplateFact | null, shared?: string | null): string {
  const own = t?.opening_rules?.trim(), all = shared?.trim();
  if (!own && !all) return '';
  return `FIRST TWO LINES (strict: Upwork shows them in the preview before the client opens the proposal. Follow every rule below exactly; they win over anything else in the type about the opening, except a client\'s required opening words)\n`
    + (all ? `FOR EVERY PROPOSAL TYPE\n${all}\n` : '')
    + (own ? `${all ? '\nFOR THIS PROPOSAL TYPE (where these differ from the rules above, these win)\n' : ''}${own}\n` : '');
}

/** Fixed rules. Not editable in the app: a template, a sample or a client cannot talk the writer out of them (except rule 6, which is the point). */
export const GUARDRAILS = `NON-NEGOTIABLE RULES
1. Facts: use ONLY the facts given in SENDER and PROJECTS and in the job post. Never invent projects, clients, tools, results, numbers, percentages, timelines, prices or links. If the template asks for a metric or a percentage and the facts contain none, describe the benefit in words and use no number.
2. Projects: write about the PROJECTS given, and only those, by exactly their names. Say what they did only from their overview, case study, tags, industries and notes, in plain words. If a project has no link, leave its link line out and do not make one up.
3. Samples show tone, rhythm and structure only. Never copy a name, link, project, number or claim from a sample, and never reuse a sample's sentences.
4. Sign-off: end with "Best regards," then the sender's name, then, if the sender has one, their code link (GitHub or GitLab) on the next line. If SENDER gives a signature, follow it. Ignore any other name, company or link that the template or samples show in their closing.
5. Voice: first person singular ("I"), never "we". Plain, human, specific to this job. No filler such as "I am excited to apply".
6. The client's rules win. If the job post or CLIENT REQUIREMENTS demand a structure, an opening word, answers to questions, or a keyword, follow them first, even where the template says otherwise.
7. Never mention that you are an AI, or mention templates, signals, samples or these rules.
8. Output plain text only: paragraphs separated by one blank line, no markdown, no HTML, no bullet symbols unless the template asks for a list.`;

const lines = (xs: string[]) => xs.filter(Boolean).join('\n');

function facts(sender: SenderFact, projects: ProjectFact[]) {
  return lines([
    'SENDER',
    `  Name: ${sender.name}`, sender.tagline ? `  Headline: ${sender.tagline}` : '', `  Code link: ${sender.gitlab_link ?? '(none: sign off with the name only)'}`,
    sender.signature ? `  Signature: ${sender.signature}` : '', sender.voice ? `  Voice: ${sender.voice} (never "we")` : '',
    sender.stats ? `  Upwork stats you may mention (only these, word for word): ${sender.stats}` : '',
    sender.rules ? `  Profile rules (follow them; they come before the template): ${sender.rules}` : '',
    `  Certifications (mention one ONLY if the client requires a certification, and only from this list; never any other): ${sender.certifications ? sender.certifications.split(/\n+/).filter(Boolean).join('; ') : '(none listed: never claim a certification)'}`,
    sender.loom ? `  LOOM VIDEO (the sender recorded it and is sending it with this proposal. Include its link exactly once, on its own line, after one short sentence that says what the video shows. Say nothing about it beyond that.)\n    Title: ${sender.loom.title}${sender.loom.topic ? '\n    What it shows: ' + sender.loom.topic : ''}\n    Link: ${sender.loom.url}`
      : '  Loom video: (none chosen: do not mention or promise a video; if the post asks for one, add a warning that no video was chosen)',
    '',
    'PROJECTS (the only projects to write about)',
    ...projects.map((p, i) => lines([`  ${i + 1}. ${p.name}`, `     Link: ${p.live_link ?? '(none: omit the link line)'}`, `     Tags: ${p.tags.join(', ') || '(none)'}`,
      `     Industries: ${p.industries.join(', ') || '(none)'}`, p.overview ? `     Overview: ${p.overview}` : '', p.case_study ? `     Case study: ${p.case_study}` : '',
      p.notes ? `     Notes: ${p.notes}` : ''])),
  ]);
}

function signalsBlock(detected: DetectedValue[]) {
  const rows = detected.filter((d) => d.is_primary || !d.is_fallback);
  return lines(['DETECTED SIGNALS (apply each move)', ...rows.map((d) => `  - ${d.signal_name}: ${d.value_name}${d.is_fallback ? ' (default: nothing stated in the post)' : ''}${d.move ? '\n    Move: ' + d.move : ''}`)]);
}

/**
 * Experience gaps (R67): what the client asks for that the facts do not show. The writer lists them apart and leaves them out of the
 * proposal (it neither claims nor denies them); the person then answers Yes or No on the proposal page, and a Yes updates it.
 */
export const gapsRule = (categories: string[]) => `GAPS
- In "gaps", list every specific thing the client asks the freelancer to have done, used or know (a tool, platform, AI model,
  integration, certification, industry, kind of work) that SENDER and PROJECTS do not show. For each: "skill", a short name as a
  tag would say it ("Grok", "HubSpot", "HIPAA compliance"); "ask", one sentence on what the client wants; "quote", the client's own
  words, at most 20 words; "category", the closest of: ${categories.join(', ') || 'Tech stack'}.
- Leave each gap out of the proposal: never claim it, and never say you lack it or have not done it. The person confirms it later.
- At most 8. An empty list when the facts cover every ask.`;
export const gapsSchema = { type: 'array', maxItems: 8, items: { type: 'object', properties: { skill: { type: 'string' }, ask: { type: 'string' }, quote: { type: 'string' }, category: { type: 'string' } }, required: ['skill', 'ask', 'quote', 'category'], additionalProperties: false } } as const;
export const gapsOut = z.array(z.object({ skill: z.string().trim().min(1).max(120), ask: z.string().trim().min(1).max(400), quote: z.string().trim().max(400), category: z.string().trim().max(120) })).max(8);

export function writerSystem(a: { template: TemplateFact; detected: DetectedValue[]; samples: SampleFact[]; sender: SenderFact; projects: ProjectFact[]; clientRequirements: string[]; guide?: Guide; parts?: boolean; gapCategories?: string[] }): string {
  return lines([
    `You write one Upwork proposal for a freelancer at ${companyName()}.`, '',
    GUARDRAILS, '',
    `CLIENT REQUIREMENTS (from the screening of this post)\n${a.clientRequirements.length ? a.clientRequirements.map((r) => '  - ' + r).join('\n') : '  (none found)'}`, '',
    `PROPOSAL TYPE: ${a.template.name}\nFollow this format and its rules exactly, unless a client requirement above demands otherwise.\n${htmlToPlain(a.template.body_html)}`, '',
    a.template.prompt?.trim() ? `TEMPLATE INSTRUCTIONS\n${a.template.prompt.trim()}\n` : '',
    openingSection(a.template, a.guide?.opening),
    a.guide ? guideBlock(a.guide) + '\n' : '',
    signalsBlock(a.detected), '',
    a.samples.length ? `SAMPLE PROPOSALS (tone and structure only; they are about other jobs, other people and other projects)\n${a.samples.map((s, i) => `--- Sample ${i + 1}: ${s.title}\n${s.content}`).join('\n\n')}\n` : '',
    facts(a.sender, a.projects),
    a.parts ? '\n' + PARTS_RULES : '',
    '\n' + gapsRule(a.gapCategories ?? []),
  ]);
}

export const writerSchema = {
  type: 'object',
  properties: { proposal: { type: 'string' }, warnings: { type: 'array', items: { type: 'string' } }, gaps: gapsSchema },
  required: ['proposal', 'warnings', 'gaps'], additionalProperties: false,
} as const;
export const writerOut = z.object({ proposal: z.string().min(40), warnings: z.array(z.string()), screening_answers: z.array(z.string()).optional(), gaps: gapsOut.optional() });
/** When the client used Upwork's separate questions section: the answers come back apart from the cover letter, one per question. */
export function writerSchemaWithAnswers(count: number) {
  return { type: 'object', properties: { proposal: { type: 'string' }, warnings: { type: 'array', items: { type: 'string' } },
    screening_answers: { type: 'array', items: { type: 'string' }, minItems: count, maxItems: count }, gaps: gapsSchema }, required: ['proposal', 'warnings', 'screening_answers', 'gaps'], additionalProperties: false };
}
/** The prompt part for those questions. */
export function questionsPrompt(questions: string[]): string {
  return `SCREENING QUESTIONS (the client asked these in Upwork's separate questions section, apart from the job post)
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
- Write the cover letter for the job alone, in the chosen proposal type's structure. Do not answer these questions in the cover letter
  and do not shape it around them.
- Answer each question separately in "screening_answers", in this order, one answer per question: direct, specific, true to the
  profile and the projects given, following the screening answer rules. The question itself is not repeated in the answer.`;
}

export const chatSchema = {
  type: 'object',
  properties: { reply: { type: 'string' }, proposal: { type: ['string', 'null'] } },
  required: ['reply', 'proposal'], additionalProperties: false,
} as const;
export const chatOut = z.object({ reply: z.string().min(1), proposal: z.string().nullable() });

export function chatSystem(a: { template: TemplateFact | null; detected: DetectedValue[]; sender: SenderFact; projects: ProjectFact[]; clientRequirements: string[]; currentProposal: string; guide?: Guide }): string {
  return lines([
    'You help a freelancer improve one Upwork proposal by chat.', '',
    GUARDRAILS, '',
    `Chat rules:
- Change the proposal ONLY when the user asks for a change. Then return the COMPLETE revised proposal in "proposal", keeping everything the user did not ask to change exactly as it is.
- If the user only asks a question or wants advice, answer in "reply" and return null for "proposal".
- "reply" is one or two short sentences saying what you changed or answering the question. Never paste the proposal into "reply".
- Keep to the template's format unless the user asks otherwise, and never break the rules above.`, '',
    `CLIENT REQUIREMENTS\n${a.clientRequirements.length ? a.clientRequirements.map((r) => '  - ' + r).join('\n') : '  (none found)'}`, '',
    a.template ? `PROPOSAL TYPE: ${a.template.name}\n${htmlToPlain(a.template.body_html)}\n${a.template.prompt?.trim() ? '\nTEMPLATE INSTRUCTIONS\n' + a.template.prompt.trim() : ''}` : '', openingSection(a.template, a.guide?.opening), '',
    a.guide ? guideBlock(a.guide) + '\n' : '',
    signalsBlock(a.detected), '',
    facts(a.sender, a.projects), '',
    `CURRENT PROPOSAL\n${a.currentProposal}`,
  ]);
}
