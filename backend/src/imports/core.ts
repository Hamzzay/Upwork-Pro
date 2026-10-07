import type { Role } from '../auth';

/**
 * Sheet imports. Every kind turns one sheet row into a PLAN (create, update, unchanged, blocked or invalid) without writing anything;
 * only a later commit writes, all rows in one transaction, and every write keeps a "before" snapshot so the whole batch can be undone.
 */
export type Action = 'create' | 'update' | 'unchanged' | 'blocked' | 'invalid';
export interface Planned { action: Action; key: string; messages: string[]; value?: any; before?: any }
export interface Db { q(sql: string, params?: any[]): Promise<any[]>; run(sql: string, params?: any[]): Promise<{ insertId: number; affectedRows: number }> }
export interface Column { name: string; aliases: string[]; required?: boolean; note: string }
export interface Kind {
  id: string;
  label: string;
  roles: Role[]; // who may import this kind
  description: string;
  columns: Column[];
  /** Looks one row up in the database and says what committing it would do. Writes nothing. */
  plan(row: Record<string, string>, db: Db, opts: { allowChanges: boolean }): Promise<Planned>;
  /** Writes one planned row (create or update). Returns what is needed to undo it. */
  apply(p: Planned, db: Db): Promise<any>;
  /** Puts back what apply changed, from the snapshot it returned. */
  undo(snapshot: any, db: Db): Promise<void>;
}

export const MAX_CHUNK = 100;
export const MAX_ROWS = 5000;
export const MAX_CELL = 5000;

/** "Match weight" and "match_weight" and "MATCH WEIGHT" are the same header. */
export const norm = (h: unknown) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Rows as objects keyed by the kind's own column names, plus the sheet headers the kind did not recognise. */
export function mapRows(kind: Kind, headers: string[] | undefined, rows: unknown[]): { rows: Record<string, string>[]; ignored: string[]; error?: string } {
  const aliasOf = new Map<string, string>();
  for (const c of kind.columns) { aliasOf.set(norm(c.name), c.name); for (const a of c.aliases) aliasOf.set(norm(a), c.name); }
  const out: Record<string, string>[] = []; const ignored = new Set<string>();
  const cell = (v: unknown): string => (v === null || v === undefined ? '' : Array.isArray(v) ? v.map(String).join('; ') : String(v).trim());
  let hdr = headers?.map((h) => aliasOf.get(norm(h)) ?? null);
  if (headers && hdr) headers.forEach((h, i) => { if (!hdr![i] && String(h ?? '').trim()) ignored.add(String(h).trim()); });
  for (const r of rows) {
    const o: Record<string, string> = {};
    if (Array.isArray(r)) {
      if (!hdr) return { rows: [], ignored: [], error: 'Rows given as lists need "headers" too' };
      r.forEach((v, i) => { const k = hdr![i]; if (k && cell(v)) o[k] = cell(v); });
    } else if (r && typeof r === 'object') {
      for (const [h, v] of Object.entries(r as object)) { const k = aliasOf.get(norm(h)); if (k) { if (cell(v)) o[k] = cell(v); } else if (h.trim()) ignored.add(h.trim()); }
    } else return { rows: [], ignored: [], error: 'Each row must be a list of cells or an object' };
    out.push(o);
  }
  return { rows: out, ignored: [...ignored] };
}

/** Splits a cell that holds several names. Commas are NOT separators: tag names can contain them. */
export const splitList = (s: string) => s.split(/[;|\n]+/).map((x) => x.trim()).filter(Boolean);

export const same = (a: unknown, b: unknown) => (a ?? '') === (b ?? '');
