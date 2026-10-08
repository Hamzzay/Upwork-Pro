import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * The few Google Sheets calls the sync needs, signed in as a service account (no extra package: a JWT signed with node:crypto).
 * The key file is never read by anything else and never logged. Set GOOGLE_SERVICE_ACCOUNT_FILE (a path) or
 * GOOGLE_SERVICE_ACCOUNT_JSON (the file's content) in .env, and share the sheet with the account's email as an editor.
 */
export interface TabMeta { title: string; sheetId: number; rows: number; cols: number }
export interface SheetIO {
  tabs(): Promise<TabMeta[]>;
  grid(tab: string): Promise<string[][]>;                          // every value as shown, rows padded to the same width
  structure(requests: object[]): Promise<void>;                      // spreadsheets.batchUpdate: add tab, insert or delete rows and columns
  write(cells: { tab: string; row: number; col: number; value: string }[]): Promise<void>; // 0-based cells, written as plain text
}

interface Key { client_email: string; private_key: string; token_uri?: string }
export function serviceAccount(): Key | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_SERVICE_ACCOUNT_FILE ? readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8') : '');
  if (!raw) return null;
  const k = JSON.parse(raw);
  if (!k.client_email || !k.private_key) throw new Error('The Google service account key is missing client_email or private_key');
  return k;
}

const b64 = (x: string | Buffer) => Buffer.from(x).toString('base64url');
export const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const quote = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export class GoogleSheet implements SheetIO {
  private token: { value: string; until: number } | null = null;
  constructor(private spreadsheetId: string, private key: Key) {}

  private async auth(): Promise<string> {
    if (this.token && this.token.until > Date.now() + 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000), aud = this.key.token_uri || 'https://oauth2.googleapis.com/token';
    const unsigned = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({ iss: this.key.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud, iat: now, exp: now + 3600 }))}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(this.key.private_key);
    const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64(sig)}` }) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`Google sign-in failed (${r.status}${j.error ? ': ' + j.error : ''}). Check the service account key.`);
    this.token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }
  private async call(method: string, path: string, body?: object): Promise<any> {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}${path}`, {
      method, headers: { Authorization: `Bearer ${await this.auth()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.error?.message || r.statusText;
      if (r.status === 403 || r.status === 404) throw new Error(`Google Sheets refused (${r.status}): ${msg}. Share the sheet with ${this.key.client_email} as an editor.`);
      throw new Error(`Google Sheets error (${r.status}): ${msg}`);
    }
    return j;
  }
  async tabs(): Promise<TabMeta[]> {
    const j = await this.call('GET', '?fields=sheets.properties(title,sheetId,gridProperties(rowCount,columnCount))');
    return (j.sheets ?? []).map((s: any) => ({ title: s.properties.title, sheetId: s.properties.sheetId, rows: s.properties.gridProperties.rowCount, cols: s.properties.gridProperties.columnCount }));
  }
  async grid(tab: string): Promise<string[][]> {
    const j = await this.call('GET', `/values/${encodeURIComponent(quote(tab))}?valueRenderOption=FORMATTED_VALUE`);
    const rows: string[][] = (j.values ?? []).map((r: any[]) => r.map((v) => (v == null ? '' : String(v))));
    const w = Math.max(0, ...rows.map((r) => r.length));
    return rows.map((r) => [...r, ...Array(w - r.length).fill('')]);
  }
  async structure(requests: object[]): Promise<void> { if (requests.length) await this.call('POST', ':batchUpdate', { requests }); }
  async write(cells: { tab: string; row: number; col: number; value: string }[]): Promise<void> {
    for (let i = 0; i < cells.length; i += 500) {
      const data = cells.slice(i, i + 500).map((c) => ({ range: `${quote(c.tab)}!${colName(c.col)}${c.row + 1}`, values: [[c.value]] }));
      await this.call('POST', '/values:batchUpdate', { valueInputOption: 'RAW', data });
    }
  }
}
