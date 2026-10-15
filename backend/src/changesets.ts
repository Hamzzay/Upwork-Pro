/**
 * Change sets: every change to the setup (projects, industries, tags, profiles, Loom videos, rules, signals, proposal types,
 * the writing guide, the gate instructions, settings), from the app or from Claude, kept with the item in full before and after.
 * One place to see who changed what and why, and to put any change back.
 *
 * How a change is caught: `recordSetupChanges` sits in front of the setup routes. It reads the item before the route runs and
 * again after it answered, so no route has to know about change sets, and a new setup route only needs a line in ROUTES.
 * How a change is put back: `revert` writes the "before" copy over the item (the row and its linked lists) and records that as
 * a change set of its own, so a revert can be reverted too. If the item changed again since, it refuses unless told to go on.
 */
import type { NextFunction, Request, Response } from 'express';
import { audit, exec, pool, query } from './db';
import { diff, snapshot, type Change } from './changes';
import { SETTINGS } from './settings';

interface Kind {
  table: string; key?: string; label: string;
  /** Linked lists: [field, link table, this side's column, other side's column, other table]. */
  links?: [string, string, string, string, string][];
  /** Child rows kept whole: [field, table, the column that points here]. */
  rows?: [string, string, string][];
  /** The on/off column, when the item can be switched off instead of deleted. */
  active?: string;
  /** Roles that may change this kind (the routes check it too; this is for lists and the plugin's tools). */
  roles: ('admin' | 'manager')[];
}
export const KINDS: Record<string, Kind> = {
  project: { table: 'projects', label: 'Project', links: [['tags', 'project_tags', 'project_id', 'tag_id', 'tags'], ['industries', 'project_industries', 'project_id', 'industry_id', 'industries']], active: 'active', roles: ['admin', 'manager'] },
  industry: { table: 'industries', label: 'Industry', links: [['projects', 'project_industries', 'industry_id', 'project_id', 'projects']], active: 'active', roles: ['admin', 'manager'] },
  tag: { table: 'tags', label: 'Tag', links: [['projects', 'project_tags', 'tag_id', 'project_id', 'projects']], active: 'active', roles: ['admin'] },
  tag_category: { table: 'tag_categories', label: 'Tag category', roles: ['admin'] },
  profile: { table: 'upwork_profiles', label: 'Upwork profile', active: 'active', roles: ['admin'] },
  loom_video: { table: 'loom_videos', label: 'Loom video', links: [['tags', 'loom_video_tags', 'video_id', 'tag_id', 'tags']], active: 'active', roles: ['admin'] },
  rule: { table: 'rules', key: 'code', label: 'Rule', active: 'active', roles: ['admin'] },
  signal: { table: 'signals', label: 'Signal', active: 'active', roles: ['admin'] },
  signal_value: { table: 'signal_values', label: 'Signal value', active: 'active', roles: ['admin'] },
  template: { table: 'templates', label: 'Proposal type', rows: [['signal mapping', 'template_signals', 'template_id']], active: 'active', roles: ['admin', 'manager'] },
  template_sample: { table: 'template_samples', label: 'Sample proposal', active: 'active', roles: ['admin', 'manager'] },
  writing_doc: { table: 'writing_docs', label: 'Writing guide', active: 'active', roles: ['admin', 'manager'] },
  opening_template: { table: 'opening_templates', label: 'Opening template', active: 'active', roles: ['admin', 'manager'] },
  word_shortcut: { table: 'word_shortcuts', label: 'Word shortcut', active: 'active', roles: ['admin', 'manager'] },
  setting: { table: 'app_settings', key: 'k', label: 'Setting', roles: ['admin'] },
  gate_instructions: { table: 'skill_versions', label: 'Gate instructions', roles: ['admin'] },
  reviewer_instructions: { table: 'reviewer_versions', label: 'Reviewer instructions', roles: ['admin'] },
};
/** Kinds kept as versions with one active: a change is which version is active (the text of each version is never changed). */
const VERSIONED: Record<string, string> = { gate_instructions: 'skill_versions', reviewer_instructions: 'reviewer_versions' };
export type KindName = keyof typeof KINDS;

/** An item exactly as stored: its row, the ids in each linked list, and its child rows. This is what a revert writes back. */
export interface Raw { row: Record<string, any>; links: Record<string, number[]>; rows: Record<string, Record<string, any>[]> }
const GATE_ID = 'active';
export async function raw(kind: string, id: string | number | null): Promise<Raw | null> {
  const k = KINDS[kind]; if (!k || id == null) return null;
  if (VERSIONED[kind]) { // one thing: which version is the active one
    const a = (await query<any>(`SELECT id, version FROM ${VERSIONED[kind]} WHERE is_active=1 LIMIT 1`))[0];
    return { row: { active_version_id: a?.id ?? null, active_version: a?.version ?? null }, links: {}, rows: {} };
  }
  const row = (await query<any>(`SELECT * FROM ${k.table} WHERE ${k.key ?? 'id'}=?`, [id]))[0];
  if (!row) return null;
  const out: Raw = { row: { ...row }, links: {}, rows: {} };
  for (const [field, link, self, other] of k.links ?? []) out.links[field] = (await query<any>(`SELECT ${other} AS v FROM ${link} WHERE ${self}=? ORDER BY ${other}`, [row.id])).map((r) => Number(r.v));
  for (const [field, table, fk] of k.rows ?? []) out.rows[field] = (await query<any>(`SELECT * FROM ${table} WHERE ${fk}=? ORDER BY id`, [row.id])).map(({ id: _id, ...rest }) => rest);
  return out;
}
/** Two copies of an item are the same when nothing but the bookkeeping columns differ. */
const BOOKKEEPING = new Set(['updated_at', 'updated_by', 'created_at']);
const stable = (r: Raw | null) => (r ? JSON.stringify({ row: Object.fromEntries(Object.entries(r.row).filter(([c]) => !BOOKKEEPING.has(c)).sort(([a], [b]) => a.localeCompare(b))), links: r.links, rows: r.rows }) : 'null');
export const same = (a: Raw | null, b: Raw | null) => stable(a) === stable(b);

/** What changed between two copies, in the words the Logs page uses. */
async function readable(kind: string, before: Raw | null, after: Raw | null, id: string | number): Promise<Change[]> {
  const k = KINDS[kind];
  if (VERSIONED[kind]) return diff({ active_version: before?.row.active_version == null ? null : String(before.row.active_version) }, { active_version: after?.row.active_version == null ? null : String(after.row.active_version) });
  const plain = (r: Raw | null) => { if (!r) return null; const o: Record<string, string | null> = {};
    for (const [c, v] of Object.entries(r.row)) if (!BOOKKEEPING.has(c) && c !== 'id' && c !== 'password_hash' && c !== 'added_via') o[c] = v == null ? null : String(v);
    if (kind === 'setting') return { value: o.v ?? null }; // a setting is one value under its name
    for (const [f, ids] of Object.entries(r.links)) o[f] = '\u0000list\u0000' + JSON.stringify(ids.map(String));
    for (const [f, rows] of Object.entries(r.rows)) o[f] = `${rows.length} row${rows.length === 1 ? '' : 's'}: ${JSON.stringify(rows)}`.slice(0, 4000);
    return o; };
  // names instead of ids in the linked lists: the snapshots from changes.ts carry them when the item still exists
  const named = async (r: Raw | null, when: 'now' | 'gone') => { const p = plain(r); if (!p || !r) return p; if (when === 'gone') return p;
    const s = await snapshot(k.table, id, k.key ?? 'id'); if (s) for (const f of Object.keys(r.links)) if (s[f]) p[f] = s[f]; return p; };
  const a = plain(before), b = await named(after, 'now');
  // for the lists, compare by id (exact), then show names for what was added or removed
  const out = diff(Object.fromEntries(Object.entries(a ?? {}).filter(([f]) => !(f in (before?.links ?? {})))), Object.fromEntries(Object.entries(b ?? {}).filter(([f]) => !(f in (after?.links ?? {})))));
  if (!a && !b) return out;
  for (const [field, , , , otherTable] of k.links ?? []) {
    const was = before?.links[field] ?? [], is = after?.links[field] ?? [];
    const add = is.filter((x) => !was.includes(x)), rem = was.filter((x) => !is.includes(x));
    if (!add.length && !rem.length) continue;
    const names = new Map((await query<any>(`SELECT id, name FROM ${otherTable} WHERE id IN (?)`, [[...add, ...rem, 0]])).map((r) => [Number(r.id), String(r.name)]));
    out.push({ field, added: add.map((x) => names.get(x) ?? '#' + x), removed: rem.map((x) => names.get(x) ?? '#' + x) });
  }
  return out;
}
const nameOf = (r: Raw | null) => (r ? String(r.row.name ?? r.row.title ?? r.row.code ?? (r.row.k ? (SETTINGS as any)[r.row.k]?.label ?? r.row.k : null) ?? (r.row.active_version != null ? 'Version ' + r.row.active_version : '')).slice(0, 200) || null : null);
export const mainAdminId = async (): Promise<number | null> => (await query<any>("SELECT MIN(id) AS id FROM users WHERE role='admin'"))[0]?.id ?? null;

/** Keep one change. Nothing is written when the item did not really change. Returns the change set's number, or null. */
export async function record(o: { userId: number | null; source: 'app' | 'claude_plugin'; kind: string; id: string | number; before: Raw | null; after: Raw | null; reason?: string | null; revertsSet?: number | null }): Promise<number | null> {
  if (same(o.before, o.after)) return null;
  const k = KINDS[o.kind];
  const act = (r: Raw | null) => (k.active && r ? Number(r.row[k.active]) : null);
  const onlySwitch = !!o.before && !!o.after && k.active && act(o.before) !== act(o.after)
    && same({ ...o.before, row: { ...o.before.row, [k.active]: 1 } }, { ...o.after, row: { ...o.after.row, [k.active]: 1 } });
  const action = o.revertsSet ? 'revert' : !o.before ? 'create' : !o.after ? 'delete' : onlySwitch ? (act(o.after) ? 'switch_on' : 'switch_off') : 'update';
  const changes = await readable(o.kind, o.before, o.after, o.id);
  const main = await mainAdminId();
  const r = await exec(`INSERT INTO change_sets (user_id, source, entity, entity_id, entity_name, action, before_json, after_json, changes_json, reason, needs_review, reverts_set) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [o.userId, o.source, o.kind, String(o.id), nameOf(o.after) ?? nameOf(o.before), action, o.before ? JSON.stringify(o.before) : null, o.after ? JSON.stringify(o.after) : null, JSON.stringify(changes),
      o.reason?.slice(0, 2000) || null, o.userId !== main ? 1 : 0, o.revertsSet ?? null]);
  return r.insertId;
}

// ---------- catching the changes: one middleware in front of the setup routes ----------
type Target = { kind: string; id?: (m: RegExpExecArray, req: Request) => string | number | null | Promise<string | number | null>; created?: (body: any, m: RegExpExecArray) => string | number | null };
const byParam = (m: RegExpExecArray) => m[1];
const made = (body: any) => body?.id ?? body?.code ?? null;
const byName = (table: string) => async (_m: RegExpExecArray, req: Request) => { const n = String(req.body?.name ?? '').trim(); return n ? (await query<any>(`SELECT id FROM ${table} WHERE name=? LIMIT 1`, [n]))[0]?.id ?? null : null; };
/** Every setup route that changes something: [method, path, what it changes]. */
const ROUTES: [string, RegExp, Target][] = [
  ['POST', /^\/projects$/, { kind: 'project', created: made }], ['PATCH|DELETE', /^\/projects\/(\d+)$/, { kind: 'project', id: byParam }],
  ['POST', /^\/industries$/, { kind: 'industry', created: made }], ['PATCH|DELETE', /^\/industries\/(\d+)$/, { kind: 'industry', id: byParam }],
  ['POST', /^\/admin\/tags$/, { kind: 'tag', created: made }], ['PATCH|DELETE', /^\/admin\/tags\/(\d+)$/, { kind: 'tag', id: byParam }],
  ['POST', /^\/admin\/categories$/, { kind: 'tag_category', created: made }], ['PATCH|DELETE', /^\/admin\/categories\/(\d+)$/, { kind: 'tag_category', id: byParam }],
  ['POST', /^\/profiles$/, { kind: 'profile', created: made }], ['PATCH|DELETE', /^\/profiles\/(\d+)$/, { kind: 'profile', id: byParam }],
  ['POST', /^\/looms$/, { kind: 'loom_video', created: made }], ['PATCH|DELETE', /^\/looms\/(\d+)$/, { kind: 'loom_video', id: byParam }],
  ['POST', /^\/admin\/rules$/, { kind: 'rule', created: made }], ['PATCH', /^\/admin\/rules\/([A-Z]\d{1,3})$/, { kind: 'rule', id: byParam }],
  ['POST', /^\/signals$/, { kind: 'signal', created: made }], ['PATCH|DELETE', /^\/signals\/(\d+)$/, { kind: 'signal', id: byParam }],
  ['POST', /^\/signals\/\d+\/values$/, { kind: 'signal_value', created: made }], ['PATCH|DELETE', /^\/signal-values\/(\d+)$/, { kind: 'signal_value', id: byParam }],
  ['POST', /^\/templates$/, { kind: 'template', created: made }], ['PATCH|DELETE', /^\/templates\/(\d+)$/, { kind: 'template', id: byParam }], ['PUT', /^\/templates\/(\d+)\/signals$/, { kind: 'template', id: byParam }],
  ['POST', /^\/templates\/\d+\/samples$/, { kind: 'template_sample', created: made }], ['PATCH|DELETE', /^\/template-samples\/(\d+)$/, { kind: 'template_sample', id: byParam }],
  ['PUT', /^\/writing-docs\/(\d+)$/, { kind: 'writing_doc', id: byParam }],
  ['POST', /^\/opening-templates$/, { kind: 'opening_template', created: made }], ['PATCH', /^\/opening-templates\/(\d+)$/, { kind: 'opening_template', id: byParam }],
  ['POST', /^\/shortcuts$/, { kind: 'word_shortcut', created: made }], ['PATCH|DELETE', /^\/shortcuts\/(\d+)$/, { kind: 'word_shortcut', id: byParam }],
  ['PUT', /^\/admin\/settings\/([\w.]+)$/, { kind: 'setting', id: byParam }],
  ['POST', /^\/admin\/skill\/\d+\/activate$/, { kind: 'gate_instructions', id: () => GATE_ID }],
  ['POST', /^\/admin\/reviewer\/\d+\/activate$/, { kind: 'reviewer_instructions', id: () => GATE_ID }],
  ['POST', /^\/plugin\/projects$/, { kind: 'project', id: byName('projects'), created: made }], ['POST', /^\/plugin\/profiles$/, { kind: 'profile', id: byName('upwork_profiles'), created: made }],
];
/** Reads the item before the route runs and after it answered, and keeps the difference as a change set. */
export function recordSetupChanges(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || !req.user) return next();
  const hit = ROUTES.map(([m, re, t]) => (m.split('|').includes(req.method) ? { m: re.exec(req.path), t } : null)).find((x) => x && x.m);
  if (!hit || !hit.m) return next();
  const { t, m } = hit;
  (async () => {
    const id = t.id ? await t.id(m, req) : null;
    const before = id != null ? await raw(t.kind, id) : null;
    let body: any = null; const json = res.json.bind(res);
    res.json = ((b: any) => { body = b; return json(b); }) as any;
    res.on('finish', () => {
      if (res.statusCode >= 300) return;
      (async () => {
        const nowId = id ?? (t.created ? t.created(body, m) : null); if (nowId == null) return;
        const after = await raw(t.kind, nowId);
        await record({ userId: req.user!.id, source: req.viaToken ? 'claude_plugin' : 'app', kind: t.kind, id: nowId, before, after, reason: (req as any).changeReason ?? null });
      })().catch((e) => console.error('change set not recorded', (e as Error).message));
    });
    next();
  })().catch(next);
}

// ---------- putting a change back ----------
/** Write a stored copy over the item: the row and its linked lists. A missing copy means the item did not exist: switch it off (or remove it when it has no on/off). */
export async function restore(kind: string, id: string | number, snap: Raw | null, userId: number, note: string): Promise<void> {
  const k = KINDS[kind], key = k.key ?? 'id';
  if (VERSIONED[kind]) { if (snap?.row.active_version_id) await exec(`UPDATE ${VERSIONED[kind]} SET is_active = (id=?)`, [snap.row.active_version_id]); return; }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [cur]: any = await conn.query(`SELECT * FROM ${k.table} WHERE ${key}=? FOR UPDATE`, [id]);
    if (!snap) {
      if (cur.length) { if (k.active) await conn.query(`UPDATE ${k.table} SET ${k.active}=0 WHERE ${key}=?`, [id]); else await conn.query(`DELETE FROM ${k.table} WHERE ${key}=?`, [id]); }
      await conn.commit(); return;
    }
    const cols = Object.keys(snap.row).filter((c) => c !== 'created_at' && c !== 'updated_at' && c !== key);
    const vals = cols.map((c) => (c === 'updated_by' ? userId : snap.row[c]));
    if (cur.length) await conn.query(`UPDATE ${k.table} SET ${cols.map((c) => '`' + c + '`=?').join(', ')} WHERE ${key}=?`, [...vals, id]);
    else await conn.query(`INSERT INTO ${k.table} (\`${key}\`, ${cols.map((c) => '`' + c + '`').join(', ')}) VALUES (?${', ?'.repeat(cols.length)})`, [snap.row[key], ...vals]);
    const rowId = snap.row.id ?? id;
    for (const [field, link, self, other, otherTable] of k.links ?? []) {
      await conn.query(`DELETE FROM ${link} WHERE ${self}=?`, [rowId]);
      const ids = snap.links[field] ?? [];
      if (ids.length) await conn.query(`INSERT IGNORE INTO ${link} (${self}, ${other}) SELECT ?, id FROM ${otherTable} WHERE id IN (?)`, [rowId, ids]); // an item deleted since is left out
    }
    for (const [field, table, fk] of k.rows ?? []) {
      await conn.query(`DELETE FROM ${table} WHERE ${fk}=?`, [rowId]);
      for (const r of snap.rows[field] ?? []) { const c = Object.keys(r); await conn.query(`INSERT INTO ${table} (${c.map((x) => '`' + x + '`').join(', ')}) VALUES (?${', ?'.repeat(c.length - 1)})`, c.map((x) => r[x])); }
    }
    // a writing guide document keeps every text as a version: the text put back is a new version too
    if (kind === 'writing_doc' && cur.length && cur[0].content !== snap.row.content) await conn.query('INSERT INTO writing_doc_versions (doc_id, content, note, created_by) VALUES (?,?,?,?)', [rowId, snap.row.content, note.slice(0, 250), userId]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}
export class ChangedSince extends Error { constructor(public changes: Change[]) { super('This item was changed again after that change'); } }
/**
 * Put a change back: the item returns to how it was before that change. Refuses (ChangedSince) when the item was changed again
 * since, unless `force`. The revert is a change set of its own, so it can be put back too.
 */
export async function revert(setId: number, userId: number, force = false): Promise<{ id: number | null; entity: string; name: string | null }> {
  const cs = (await query<any>('SELECT * FROM change_sets WHERE id=?', [setId]))[0];
  if (!cs) throw Object.assign(new Error('Not found'), { status: 404 });
  if (cs.status === 'reverted') throw Object.assign(new Error('This change was already put back'), { status: 409 });
  const before: Raw | null = cs.before_json ? JSON.parse(cs.before_json) : null, after: Raw | null = cs.after_json ? JSON.parse(cs.after_json) : null;
  const id = /^\d+$/.test(cs.entity_id) && !KINDS[cs.entity].key ? Number(cs.entity_id) : cs.entity_id;
  const now = await raw(cs.entity, id);
  if (!same(now, after) && !force) throw new ChangedSince(await readable(cs.entity, after, now, id));
  await restore(cs.entity, id, before, userId, `Put back change #${setId}`);
  const newId = await record({ userId, source: 'app', kind: cs.entity, id, before: now, after: await raw(cs.entity, id), reason: `Put back change #${setId}${cs.reason ? ': ' + cs.reason : ''}`, revertsSet: setId });
  await exec(`UPDATE change_sets SET status='reverted', reverted_by=?, reverted_at=NOW(), reverted_by_set=?, needs_review=0, reviewed_by=COALESCE(reviewed_by, ?), reviewed_at=COALESCE(reviewed_at, NOW()) WHERE id=?`, [userId, newId, userId, setId]);
  await audit(userId, 'change_put_back', `change #${setId}: ${KINDS[cs.entity].label} ${cs.entity_name ?? ''}`);
  return { id: newId, entity: cs.entity, name: cs.entity_name };
}
