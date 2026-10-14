/**
 * Screening answers live apart from the proposal (R59): each proposal version keeps the cover letter in `content_html` and the
 * answers in `answers_json` ([{ question, answer }]). Editing one never touches the other. Versions saved before R59 kept the answers
 * inside the text, after a "Screening answers" line: `separate` splits those when they are read, so nothing old is lost.
 */
import { z } from 'zod';
import { htmlToPlain, textToHtml } from '../html';

export interface QA { question: string; answer: string }
export const qaList = z.array(z.object({ question: z.string().trim().min(1).max(2000), answer: z.string().max(10_000) })).max(30);

const LINE = /\n\s*Screening answers\s*:?\s*\n/i;
// the "Screening answers" line as the server wrote it into HTML: its own paragraph, maybe bold
const HTML_LINE = /<p>\s*(?:<(?:strong|b)>)?\s*Screening answers\s*:?\s*(?:<\/(?:strong|b)>)?\s*<\/p>/i;

/** Plain text that may end with a "Screening answers" section: the letter, and each numbered question with its answer. */
export function splitText(text: string): { letter: string; answers: QA[] } {
  const parts = String(text ?? '').split(LINE);
  if (parts.length < 2) return { letter: String(text ?? ''), answers: [] };
  const answers = parts.slice(1).join('\n').split(/\n(?=\s*\d+[.)]\s)/).map((a) => a.trim()).filter(Boolean).map((a, i) => {
    const [first, ...rest] = a.replace(/^\d+[.)]\s*/, '').split('\n');
    const answer = rest.join('\n').trim();
    // "1. Question\nAnswer"; an item of one line (some older plugin saves) is the answer alone
    return answer ? { question: first.trim(), answer } : { question: `Question ${i + 1}`, answer: first.trim() };
  });
  return { letter: parts[0].trimEnd(), answers };
}

/** One stored version as the letter (HTML) and its answers, whether it was saved before or after R59. */
export function separate(html: string, answersJson: string | null | undefined): { html: string; answers: QA[] } {
  if (answersJson != null) {
    let answers: QA[] = []; try { answers = qaList.parse(JSON.parse(answersJson)); } catch { answers = []; }
    return { html, answers };
  }
  const { letter, answers } = splitText(htmlToPlain(html));
  if (!answers.length) return { html, answers: [] };
  const cut = HTML_LINE.exec(html);
  return { html: cut ? html.slice(0, cut.index) : textToHtml(letter), answers };
}

/** The answers as stored: null when the job has none, so a version without answers stays plain. */
export const storeAnswers = (answers: QA[] | null | undefined) => (answers && answers.length ? JSON.stringify(answers) : null);

/** The answers as plain text for a reader (the reviewer, an export, Claude): each question, then its answer. */
export const answersText = (answers: QA[]) => answers.map((x, i) => `${i + 1}. ${x.question}\n${x.answer}`).join('\n\n');
