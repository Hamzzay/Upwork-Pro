/**
 * Three-way merge between the Google Sheet and the app. Both are sources of truth; the base is each record as it was after the
 * last sync, so the merge can tell which side changed what. Pure: no database, no Google.
 *
 * Per record (by key):
 * - on one side only and not in the base: new there, so it is created on the other side (an addition is never discarded)
 * - on one side only but in the base: it was removed on the other side, so it is removed here too (unless held back, see `guard`)
 * Per field of a record on both sides:
 * - equal: nothing to do
 * - one side still equals the base: the other side changed it, so the change is copied over
 * - no base yet (first sync): an empty value takes the filled one; two different filled values are a conflict
 * - both changed, differently: a conflict. The sheet's value is kept on both sides, and the app's value is reported so it can be used instead.
 * Set fields (a project's tags) merge per element: added on either side is added to both; removed on one side (it was in the base) is removed from both.
 */
export type Value = string | null | string[];
export type Rec = Record<string, Value>;
export type Kind = 'project' | 'tag' | 'profile';

export interface Conflict { key: string; field: string; sheet: Value; app: Value }
export interface SideChanges { create: { key: string; rec: Rec }[]; update: { key: string; fields: Rec }[]; remove: string[] }
export interface MergeResult {
  toApp: SideChanges; toSheet: SideChanges; conflicts: Conflict[];
  base: Map<string, Rec>;           // the new base after the changes are applied
  heldBack: { side: 'app' | 'sheet'; keys: string[] } [];
}

const isSet = (v: Value): v is string[] => Array.isArray(v);
export const norm = (v: Value | undefined): Value => {
  if (v === undefined || v === null) return null;
  if (isSet(v)) return [...new Set(v.map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const t = String(v).replace(/\r\n/g, '\n').trim();
  return t === '' ? null : t;
};
export const same = (a: Value | undefined, b: Value | undefined): boolean => {
  const x = norm(a), y = norm(b);
  if (isSet(x) || isSet(y)) return isSet(x) && isSet(y) && x.length === y.length && x.every((v, i) => v.toLowerCase() === (y as string[])[i].toLowerCase());
  if (x === null || y === null) return x === y;
  return x === y || (/^-?\d+(\.\d+)?$/.test(x) && /^-?\d+(\.\d+)?$/.test(y) && Number(x) === Number(y)); // "35" and "35.00"
};

function mergeSet(s: string[], a: string[], b: string[] | null): string[] {
  const low = (xs: string[]) => new Map(xs.map((x) => [x.toLowerCase(), x]));
  const S = low(s), A = low(a), B = b ? low(b) : null;
  const out = new Map<string, string>();
  for (const [k, v] of new Map([...A, ...S])) {
    const inS = S.has(k), inA = A.has(k), inB = B ? B.has(k) : false;
    if (inS && inA) out.set(k, S.get(k)!);
    else if (inB) continue; // it was there, one side removed it: removed
    else out.set(k, v);     // added on one side
  }
  return [...out.values()].sort((x, y) => x.localeCompare(y));
}

/**
 * `guard`: when a run would remove more than this share of one side's records (and more than 3), the removals on that side are
 * held back and reported instead, so an emptied tab or a wiped table never wipes the other side.
 */
export function merge(base: Map<string, Rec>, sheet: Map<string, Rec>, app: Map<string, Rec>, guard = 0.2): MergeResult {
  const r: MergeResult = { toApp: { create: [], update: [], remove: [] }, toSheet: { create: [], update: [], remove: [] }, conflicts: [], base: new Map(), heldBack: [] };
  const keys = new Set([...sheet.keys(), ...app.keys(), ...base.keys()]);
  for (const key of keys) {
    const S = sheet.get(key), A = app.get(key), B = base.get(key);
    if (S && A) {
      const merged: Rec = {}; const forApp: Rec = {}; const forSheet: Rec = {};
      for (const f of new Set([...Object.keys(S), ...Object.keys(A)])) {
        const s = norm(S[f]), a = norm(A[f]), b = B ? norm(B[f]) : undefined;
        let v: Value;
        if (isSet(s) || isSet(a)) v = mergeSet(isSet(s) ? s : [], isSet(a) ? a : [], b === undefined ? null : (isSet(b) ? b : []));
        else if (same(s, a)) v = s;
        else if (b !== undefined && same(a, b)) v = s;          // the sheet changed it
        else if (b !== undefined && same(s, b)) v = a;          // the app changed it
        else if (s === null) v = a;                             // filled on one side only: keep the value
        else if (a === null) v = s;
        else { v = s; r.conflicts.push({ key, field: f, sheet: s, app: a }); } // both changed: the sheet wins, the app's value is reported
        merged[f] = v;
        if (!same(v, s)) forSheet[f] = v;
        if (!same(v, a)) forApp[f] = v;
      }
      if (Object.keys(forApp).length) r.toApp.update.push({ key, fields: forApp });
      if (Object.keys(forSheet).length) r.toSheet.update.push({ key, fields: forSheet });
      r.base.set(key, merged);
    } else if (S && !A) {
      if (B) r.toSheet.remove.push(key);                      // removed in the app
      else { r.toApp.create.push({ key, rec: S }); r.base.set(key, S); }
    } else if (A && !S) {
      if (B) r.toApp.remove.push(key);                        // removed in the sheet
      else { r.toSheet.create.push({ key, rec: A }); r.base.set(key, A); }
    } // in the base only: removed on both sides, nothing left to do
  }
  // the brake: too many removals at once are held back, and those records stay in the base as they were
  for (const [side, changes, size] of [['sheet', r.toSheet, sheet.size], ['app', r.toApp, app.size]] as const) {
    if (changes.remove.length > 3 && changes.remove.length > size * guard) {
      r.heldBack.push({ side, keys: changes.remove });
      for (const k of changes.remove) r.base.set(k, base.get(k)!);
      changes.remove = [];
    }
  }
  return r;
}
