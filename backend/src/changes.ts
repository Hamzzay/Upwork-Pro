/**
 * What changed, for the Logs page: a snapshot of a row (and its linked lists, such as a project's tags) before and after a save,
 * turned into a list of changes. Short values keep their old and new value; long texts keep the lines removed and added; linked
 * lists keep the names added and removed. Stored with the audit entry (audit_log.changes).
 */
import { query } from './db';
import { htmlToPlain } from './html';

export interface Change { field: string; from?: string | null; to?: string | null; removed?: string[]; added?: string[] }
type Snap = Record<string, string | null>;

/** Linked lists per table: [field name, link table, this side's column, other side's column, other table, its name column]. */
const LINKS: Record<string, [string, string, string, string, string, string][]> = {
  projects: [['tags', 'project_tags', 'project_id', 'tag_id', 'tags', 'name'], ['industries', 'project_industries', 'project_id', 'industry_id', 'industries', 'name']],
  industries: [['projects', 'project_industries', 'industry_id', 'project_id', 'projects', 'name']],
  loom_videos: [['tags', 'loom_video_tags', 'video_id', 'tag_id', 'tags', 'name'], ['projects', 'loom_video_projects', 'video_id', 'project_id', 'projects', 'name']],
  tags: [['projects', 'project_tags', 'tag_id', 'project_id', 'projects', 'name']],
};
const SKIP = new Set(['id', 'created_at', 'updated_at', 'password_hash', 'updated_by', 'created_by', 'last_used_at', 'added_via']);
const LONG = 300; // longer texts are compared line by line
const CAP = 1500; // the most kept of one value

const text = (v: any): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

/** One row as plain strings, with its linked lists; null when there is no such row. `key` is the column the value matches. */
export async function snapshot(table: string, value: any, key = 'id'): Promise<Snap | null> {
  const row = (await query<any>(`SELECT * FROM ${table} WHERE ${key}=?`, [value]))[0];
  if (!row) return null;
  const out: Snap = {};
  for (const [k, v] of Object.entries(row)) if (!SKIP.has(k)) out[k] = k.endsWith('_html') ? (v == null ? null : htmlToPlain(String(v))) : text(v);
  for (const [field, link, self, other, otherTable, nameCol] of LINKS[table] ?? []) {
    const names = (await query<any>(`SELECT o.${nameCol} AS n FROM ${link} l JOIN ${otherTable} o ON o.id=l.${other} WHERE l.${self}=? ORDER BY o.${nameCol}`, [row.id])).map((r) => String(r.n));
    out[field] = '\u0000list\u0000' + JSON.stringify(names);
  }
  return out;
}

const isList = (v: string | null) => !!v && v.startsWith('\u0000list\u0000');
const list = (v: string | null): string[] => (isList(v) ? JSON.parse(v!.slice(6)) : []);
const cut = (v: string | null) => (v == null ? null : v.length > CAP ? v.slice(0, CAP) + '…' : v);

/** The lines removed and added between two texts (a small longest-common-subsequence diff; very long texts keep only the counts). */
export function lineDiff(a: string, b: string): { removed: string[]; added: string[] } {
  const x = a.split('\n'), y = b.split('\n');
  if (x.length * y.length > 400_000) { // too big to compare line by line: say which lines are not in the other at all
    const sx = new Set(x), sy = new Set(y);
    return { removed: x.filter((l) => !sy.has(l) && l.trim()).slice(0, 40), added: y.filter((l) => !sx.has(l) && l.trim()).slice(0, 40) };
  }
  const n = x.length, m = y.length, L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const removed: string[] = [], added: string[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) { if (x[i] === y[j]) { i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) removed.push(x[i++]); else added.push(y[j++]); }
  while (i < n) removed.push(x[i++]); while (j < m) added.push(y[j++]);
  const keep = (ls: string[]) => ls.filter((l) => l.trim()).slice(0, 40).map((l) => (l.length > 300 ? l.slice(0, 300) + '…' : l));
  return { removed: keep(removed), added: keep(added) };
}

/** The changes between two snapshots (a missing `before` is a new row: every field with a value). */
export function diff(before: Snap | null, after: Snap | null): Change[] {
  const out: Change[] = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    const a = before?.[k] ?? null, b = after?.[k] ?? null;
    if (a === b) continue;
    if (isList(a) || isList(b)) {
      const la = list(a), lb = list(b);
      const added = lb.filter((x) => !la.includes(x)), removed = la.filter((x) => !lb.includes(x));
      if (added.length || removed.length) out.push({ field: k, added, removed });
    } else if ((a?.length ?? 0) > LONG || (b?.length ?? 0) > LONG || (a ?? '').includes('\n') || (b ?? '').includes('\n')) { // long or several lines: line by line
      const d = lineDiff(a ?? '', b ?? '');
      out.push({ field: k, ...d });
    } else if (!(before === null && b === null)) out.push({ field: k, from: cut(a), to: cut(b) });
  }
  return out;
}

/** A readable name for a snapshot: its name, title, code or key. */
export const label = (s: Snap | null) => (s ? s.name ?? s.title ?? s.code ?? s.doc_key ?? s.k ?? s.email ?? null : null);
