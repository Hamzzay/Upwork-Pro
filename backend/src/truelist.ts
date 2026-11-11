/**
 * R155 (Hamza): TrueList checks the emails a client research finds, with the same account as LeadWorks (TRUELIST_API_KEY in .env).
 * TrueList is a flat subscription, so a check costs nothing per address. One batch per check: create it, save its id (the caller does,
 * through onBatch, before waiting), wait for it to finish, then read its annotated file for each address's state. No key: no check.
 */
const BASE = 'https://api.truelist.io';
const key = () => process.env.TRUELIST_API_KEY?.trim() || '';
export const truelistReady = () => !!key();

export interface EmailCheck { state: string; sub_state: string }
export class TruelistFail extends Error {}

async function call(method: 'GET' | 'POST', url: string, body?: unknown, timeoutMs = 60_000): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(url.startsWith('http') ? url : BASE + url, { method, signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${key()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new TruelistFail('TrueList did not answer (network or timeout)'); }
  if (!r.ok) throw new TruelistFail(`TrueList refused the request (status ${r.status})`); // never the body: it can hold the addresses
  return r;
}

/** A CSV file, quotes and all, as rows of fields. */
function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** Checks the addresses in one batch. onBatch gets the batch id as soon as TrueList gives it. Returns each address's state, by address. */
export async function checkEmails(emails: string[], onBatch: (id: string) => Promise<void>, waitMs = 5 * 60_000): Promise<Map<string, EmailCheck>> {
  if (!truelistReady()) throw new TruelistFail('TrueList is not set up on this server (TRUELIST_API_KEY)');
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const created: any = await (await call('POST', '/api/v1/batches', { data: list.map((e) => [e]), validation_strategy: 'accurate' }, 120_000)).json().catch(() => null);
  const id = created?.id ?? created?.batch?.id;
  if (id == null) throw new TruelistFail('TrueList gave no batch id');
  await onBatch(String(id));
  return readBatch(String(id), waitMs);
}

/** Waits for a batch to finish, then reads its states. Used again for a batch whose wait was cut short. */
export async function readBatch(id: string, waitMs = 5 * 60_000): Promise<Map<string, EmailCheck>> {
  const until = Date.now() + waitMs;
  let b: any = null;
  for (;;) {
    b = await (await call('GET', `/api/v1/batches/${encodeURIComponent(id)}`)).json().catch(() => null);
    if (b?.batch_state === 'completed' && b?.annotated_csv_url) break;
    if (Date.now() > until) throw new TruelistFail('TrueList had not finished the check in time; check again in a minute');
    await new Promise((r) => setTimeout(r, 4000));
  }
  const rows = csvRows(await (await call('GET', b.annotated_csv_url)).text());
  const head = (rows.shift() ?? []).map((h) => h.trim());
  const at = (name: string) => head.indexOf(name);
  const [ai, si, ssi] = [at('Email Address'), at('Email State'), at('Email Sub-State')];
  if (ai < 0 || si < 0) throw new TruelistFail('TrueList\'s result file had an unexpected shape');
  return new Map(rows.map((r) => [String(r[ai] ?? '').trim().toLowerCase(), { state: String(r[si] ?? '').trim(), sub_state: ssi >= 0 ? String(r[ssi] ?? '').trim() : '' }]));
}
