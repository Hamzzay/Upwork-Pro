/**
 * Upwork job fetching for LINK input.
 *
 * NOT WIRED YET. The official Upwork API (OAuth2 + GraphQL) needs an approved API key and an
 * authorization step, and the exact queries must be taken from Upwork's developer docs, not guessed.
 * Until then, link input fails with `upwork_not_configured` and the UI asks the user to paste the text.
 *
 * To finish this: implement UpworkClient.fetchJob() below, return a JobData, and the rest
 * (rendering into the screening prompt, saving, overrides) already works.
 */
export interface LabeledRow { label: string; value: string | number | null | undefined }

/** Provider-neutral shape. Anything the API does not return stays null and is rendered as "not shown". */
export interface JobData {
  title?: string | null;
  url?: string | null;
  description?: string | null;
  rows: LabeledRow[]; // e.g. {label:'Hires', value: 0}, {label:'Payment method verified', value:'yes'}
  screeningQuestions?: string[];
  clientHistory?: string[]; // one line per past job / feedback
}

export class UpworkError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export interface UpworkClient {
  fetchJob(jobId: string): Promise<JobData>;
}

export function getUpworkClient(): UpworkClient {
  if (!process.env.UPWORK_ACCESS_TOKEN) {
    throw new UpworkError('upwork_not_configured', 'Upwork API access is not set up yet. Paste the job page text instead.');
  }
  throw new UpworkError('upwork_not_implemented', 'The Upwork API client is not implemented yet. Paste the job page text instead.');
}

/** Render fetched data as labeled page-like text so the skill's "work only from the pasted text" rule still holds. */
export function renderJobText(d: JobData): string {
  const nz = (v: unknown) => (v === null || v === undefined || v === '' ? 'not shown' : String(v));
  const lines: string[] = [];
  lines.push(`Title: ${nz(d.title)}`);
  if (d.url) lines.push(`URL: ${d.url}`);
  for (const r of d.rows) lines.push(`${r.label}: ${nz(r.value)}`);
  lines.push('', 'Description:', nz(d.description));
  if (d.screeningQuestions?.length) {
    lines.push('', 'Screening questions:', ...d.screeningQuestions.map((q, i) => `${i + 1}. ${q}`));
  }
  if (d.clientHistory?.length) lines.push('', "Client's recent history:", ...d.clientHistory);
  return lines.join('\n');
}
