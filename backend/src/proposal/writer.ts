import { z } from 'zod';
import { htmlToPlain } from '../html';
import type { DetectedValue } from './signals';

export interface ProjectFact { name: string; live_link: string | null; tags: string[]; industries: string[]; notes: string | null }
export interface SenderFact { name: string; gitlab_link: string | null; tagline: string | null }
export interface SampleFact { title: string; content: string }
export interface TemplateFact { name: string; body_html: string; prompt: string | null }

/** Fixed rules. Not editable in the app: a template, a sample or a client cannot talk the writer out of them (except rule 6, which is the point). */
export const GUARDRAILS = `NON-NEGOTIABLE RULES
1. Facts: use ONLY the facts given in SENDER and PROJECTS and in the job post. Never invent projects, clients, tools, results, numbers, percentages, timelines, prices or links. If the template asks for a metric or a percentage and the facts contain none, describe the benefit in words and use no number.
2. Projects: write about the PROJECTS given, and only those, by exactly their names. Say what they did only from their tags, industries and notes, in plain words. If a project has no link, leave its link line out and do not make one up.
3. Samples show tone, rhythm and structure only. Never copy a name, link, project, number or claim from a sample, and never reuse a sample's sentences.
4. Sign-off: end with "Best regards," then the sender's name, then, if the sender has one, their GitLab link on the next line. Ignore any other name, company or link that the template or samples show in their closing.
5. Voice: first person singular ("I"), never "we". Plain, human, specific to this job. No filler such as "I am excited to apply".
6. The client's rules win. If the job post or CLIENT REQUIREMENTS demand a structure, an opening word, answers to questions, or a keyword, follow them first, even where the template says otherwise.
7. Never mention that you are an AI, or mention templates, signals, samples or these rules.
8. Output plain text only: paragraphs separated by one blank line, no markdown, no HTML, no bullet symbols unless the template asks for a list.`;

const lines = (xs: string[]) => xs.filter(Boolean).join('\n');

function facts(sender: SenderFact, projects: ProjectFact[]) {
  return lines([
    'SENDER',
    `  Name: ${sender.name}`, sender.tagline ? `  Headline: ${sender.tagline}` : '', `  GitLab link: ${sender.gitlab_link ?? '(none: sign off with the name only)'}`,
    '',
    'PROJECTS (the only projects to write about)',
    ...projects.map((p, i) => lines([`  ${i + 1}. ${p.name}`, `     Link: ${p.live_link ?? '(none: omit the link line)'}`, `     Tags: ${p.tags.join(', ') || '(none)'}`,
      `     Industries: ${p.industries.join(', ') || '(none)'}`, p.notes ? `     Notes: ${p.notes}` : ''])),
  ]);
}

function signalsBlock(detected: DetectedValue[]) {
  const rows = detected.filter((d) => d.is_primary || !d.is_fallback);
  return lines(['DETECTED SIGNALS (apply each move)', ...rows.map((d) => `  - ${d.signal_name}: ${d.value_name}${d.is_fallback ? ' (default: nothing stated in the post)' : ''}${d.move ? '\n    Move: ' + d.move : ''}`)]);
}

export function writerSystem(a: { template: TemplateFact; detected: DetectedValue[]; samples: SampleFact[]; sender: SenderFact; projects: ProjectFact[]; clientRequirements: string[] }): string {
  return lines([
    'You write one Upwork proposal for a freelancer at Stackup Solutions.', '',
    GUARDRAILS, '',
    `CLIENT REQUIREMENTS (from the screening of this post)\n${a.clientRequirements.length ? a.clientRequirements.map((r) => '  - ' + r).join('\n') : '  (none found)'}`, '',
    `TEMPLATE: ${a.template.name}\nFollow this format and its rules exactly, unless a client requirement above demands otherwise.\n${htmlToPlain(a.template.body_html)}`, '',
    a.template.prompt?.trim() ? `TEMPLATE INSTRUCTIONS\n${a.template.prompt.trim()}\n` : '',
    signalsBlock(a.detected), '',
    a.samples.length ? `SAMPLE PROPOSALS (tone and structure only; they are about other jobs, other people and other projects)\n${a.samples.map((s, i) => `--- Sample ${i + 1}: ${s.title}\n${s.content}`).join('\n\n')}\n` : '',
    facts(a.sender, a.projects),
  ]);
}

export const writerSchema = {
  type: 'object',
  properties: { proposal: { type: 'string' }, warnings: { type: 'array', items: { type: 'string' } } },
  required: ['proposal', 'warnings'], additionalProperties: false,
} as const;
export const writerOut = z.object({ proposal: z.string().min(40), warnings: z.array(z.string()) });

export const chatSchema = {
  type: 'object',
  properties: { reply: { type: 'string' }, proposal: { type: ['string', 'null'] } },
  required: ['reply', 'proposal'], additionalProperties: false,
} as const;
export const chatOut = z.object({ reply: z.string().min(1), proposal: z.string().nullable() });

export function chatSystem(a: { template: TemplateFact | null; detected: DetectedValue[]; sender: SenderFact; projects: ProjectFact[]; clientRequirements: string[]; currentProposal: string }): string {
  return lines([
    'You help a freelancer improve one Upwork proposal by chat.', '',
    GUARDRAILS, '',
    `Chat rules:
- Change the proposal ONLY when the user asks for a change. Then return the COMPLETE revised proposal in "proposal", keeping everything the user did not ask to change exactly as it is.
- If the user only asks a question or wants advice, answer in "reply" and return null for "proposal".
- "reply" is one or two short sentences saying what you changed or answering the question. Never paste the proposal into "reply".
- Keep to the template's format unless the user asks otherwise, and never break the rules above.`, '',
    `CLIENT REQUIREMENTS\n${a.clientRequirements.length ? a.clientRequirements.map((r) => '  - ' + r).join('\n') : '  (none found)'}`, '',
    a.template ? `TEMPLATE: ${a.template.name}\n${htmlToPlain(a.template.body_html)}\n${a.template.prompt?.trim() ? '\nTEMPLATE INSTRUCTIONS\n' + a.template.prompt.trim() : ''}` : '', '',
    signalsBlock(a.detected), '',
    facts(a.sender, a.projects), '',
    `CURRENT PROPOSAL\n${a.currentProposal}`,
  ]);
}
