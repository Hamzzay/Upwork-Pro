/**
 * Upwork's own screening questions section ("You will be asked to answer the following questions when submitting a proposal"), apart
 * from questions written inside the description. When the client used that section, the signals and the proposal type are read from
 * the job without it, and the answers are written apart from the cover letter. Pure functions: no database, no model.
 */
const START = /you will be asked to answer the following questions when submitting a proposal:?/i;
// where the section ends: the next block of the Upwork page
const END = /^(skills and expertise|activity on this job|about the client|preferred qualifications|send a proposal for|available connects|client'?s recent history|other open jobs|mandatory skills|nice-to-have skills|project type:?|explore similar jobs|jobs you may like|save job|flag as inappropriate)\b/i;

export function separateQuestions(jobText: string): { jobOnly: string; questions: string[] } {
  const text = String(jobText ?? '');
  const m = START.exec(text);
  if (!m) return { jobOnly: text, questions: [] };
  const lines = text.slice(m.index + m[0].length).split('\n');
  const questions: string[] = [];
  let used = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t && END.test(t)) break;
    used += line.length + 1;
    if (!t) continue;
    questions.push(t.replace(/^\d+[.)]\s*/, ''));
  }
  const jobOnly = (text.slice(0, m.index) + text.slice(m.index + m[0].length + used)).replace(/\n{3,}/g, '\n\n');
  return { jobOnly, questions: questions.slice(0, 30) };
}

/** The questions for a job: Upwork's section in the page text, else the posting's questions that are not inside its description. */
export function jobQuestions(jobText: string, posting?: { description?: string; screening_questions?: string[] } | null): string[] {
  const own = separateQuestions(jobText).questions;
  if (own.length) return own;
  const desc = (posting?.description ?? '').toLowerCase().replace(/\s+/g, ' ');
  return (posting?.screening_questions ?? []).map((q) => String(q).trim()).filter((q) => q && !desc.includes(q.toLowerCase().replace(/\s+/g, ' ').slice(0, 60)));
}

/** The proposal text, split into the cover letter and the numbered screening answers after a "Screening answers" line. */
export function splitAnswers(text: string): { letter: string; answers: string[] } {
  const parts = String(text ?? '').split(/\n\s*Screening answers\s*:?\s*\n/i);
  if (parts.length < 2) return { letter: text, answers: [] };
  const answers = parts.slice(1).join('\n').split(/\n(?=\s*\d+[.)]\s)/).map((a) => a.trim()).filter(Boolean);
  return { letter: parts[0].trimEnd(), answers };
}
