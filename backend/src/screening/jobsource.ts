export type ParsedInput =
  | { type: 'link'; url: string; jobId: string | null }
  | { type: 'text'; text: string };

const URL_RE = /^https?:\/\/(?:[a-z0-9-]+\.)?upwork\.com\/\S+$/i;

/** Upwork job links carry the job id as "~02<id>" in the path (verified against the MCP: id 2106902630457880971 <-> ~022106902630457880971). */
/**
 * R139 (Hamza): the job's own Upwork link inside pasted page text, saved as the job link. Upwork's page ends with "Job link" and the
 * link; that one is taken. Otherwise the only Upwork job link in the text; with several (the client's other jobs), none: never a
 * guess. Returned in one form, https://www.upwork.com/jobs/~02<id>, so the same job is found by its link whatever form was pasted.
 */
export function jobLinkInText(text: string | null | undefined): string | null {
  const t = String(text ?? '');
  const form = (u: string) => { const id = jobIdFromUrl(u); return id ? `https://www.upwork.com/jobs/~02${id}` : null; };
  const labelled = /job\s*link\s*[:\-]?\s*(https?:\/\/(?:www\.)?upwork\.com\/\S+)/i.exec(t);
  if (labelled && form(labelled[1])) return form(labelled[1]);
  const all = [...new Set((t.match(/https?:\/\/(?:[a-z0-9-]+\.)?upwork\.com\/[^\s"'<>)\]]+/gi) ?? []).map(form).filter((x): x is string => !!x))];
  return all.length === 1 ? all[0] : null;
}

export function jobIdFromUrl(url: string): string | null {
  const m = /~02(\d{15,25})/.exec(url);
  return m ? m[1] : null;
}

export class InputError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export function detectInput(raw: string): ParsedInput {
  const s = raw.trim();
  if (!s) throw new InputError('empty', 'Paste an Upwork job link or the job page text.');
  if (s.length > 60_000) throw new InputError('too_long', 'The input is too long. Paste only the job page.');
  if (!/\s/.test(s) && URL_RE.test(s)) {
    return { type: 'link', url: s, jobId: jobIdFromUrl(s) };
  }
  if (/^https?:\/\//i.test(s) && !/\s/.test(s)) {
    throw new InputError('not_upwork', 'That link is not an Upwork job link.');
  }
  if (s.length < 120) {
    throw new InputError('too_short', 'That text looks too short to be a job page. Paste the full page, including About the client.');
  }
  return { type: 'text', text: s };
}
