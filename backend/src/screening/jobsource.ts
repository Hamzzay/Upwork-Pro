export type ParsedInput =
  | { type: 'link'; url: string; jobId: string | null }
  | { type: 'text'; text: string };

const URL_RE = /^https?:\/\/(?:[a-z0-9-]+\.)?upwork\.com\/\S+$/i;

/** Upwork job links carry the job id as "~02<id>" in the path (verified against the MCP: id 2106902630457880971 <-> ~022106902630457880971). */
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
