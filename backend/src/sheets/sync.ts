import { audit, pool } from '../db';
import { getSettings } from '../settings';
import { GoogleSheet, serviceAccount, type SheetIO } from './google';
import { merge, norm, type Kind, type MergeResult, type Rec } from './merge';
import { applyToSheet, keyOf, readProfiles, readProjects, readTags, TABS } from './model';

/**
 * Two-way sync of projects, tags and profiles between the Google Sheet and the app. Both are sources of truth (see merge.ts).
 * Runs on a timer in the worker, after every library edit in the app, and from the Sheet sync page. One run at a time (a MySQL lock).
 */
const LOCK = 'upwork_pro_sheet_sync';
const PROFILE_FIELDS = ['profile_url', 'tagline', 'price', 'lowest_price', 'github_url', 'gitlab_account', 'services', 'industries', 'voice', 'signature', 'stats_allowed', 'submitted_by', 'rules', 'notes'];
const PROJECT_FIELDS = ['landing_link', 'system_link', 'mobile_link', 'staging_link', 'case_study_link', 'overview', 'case_study_summary'];

export function connected(): { ok: boolean; email?: string; reason?: string } {
  try { const k = serviceAccount(); return k ? { ok: true, email: k.client_email } : { ok: false, reason: 'No Google service account key in .env (GOOGLE_SERVICE_ACCOUNT_FILE).' }; }
  catch (e) { return { ok: false, reason: (e as Error).message }; }
}

// ---------- the app's side as records ----------
const num = (v: any) => (v === null || v === undefined || v === '' ? null : String(Number(v)));
async function loadApp(conn: any): Promise<Record<Kind, Map<string, Rec>>> {
  const q = async (sql: string, p: any[] = []) => (await conn.query(sql, p))[0] as any[];
  // an industry made on the Industries page needs an Industry tag to have a column in the sheet
  const [[indCat]] = await conn.query("SELECT id FROM tag_categories WHERE name='Industry'") as any;
  if (indCat) await conn.query(`INSERT IGNORE INTO tags (category_id, name, weight, sort_order) SELECT ?, i.name, 2, 999 FROM industries i
    WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.name=i.name)`, [indCat.id]);
  const tags = new Map<string, Rec>();
  for (const t of await q('SELECT t.name, c.name AS category, t.weight, t.description FROM tags t JOIN tag_categories c ON c.id=t.category_id WHERE t.sheet_removed_at IS NULL'))
    tags.set(keyOf(t.name), { name: t.name, category: t.category, weight: num(t.weight), description: norm(t.description) });
  const projects = new Map<string, Rec>();
  const plinks = await q(`SELECT pt.project_id, t.name FROM project_tags pt JOIN tags t ON t.id=pt.tag_id JOIN tag_categories c ON c.id=t.category_id
    WHERE c.name<>'Industry' AND t.sheet_removed_at IS NULL`);
  const pinds = await q('SELECT pi.project_id, i.name FROM project_industries pi JOIN industries i ON i.id=pi.industry_id');
  for (const p of await q(`SELECT id, name, showable_publicly, ${PROJECT_FIELDS.join(', ')} FROM projects WHERE sheet_removed_at IS NULL`)) {
    const rec: Rec = { name: p.name, showable: norm(p.showable_publicly) };
    for (const f of PROJECT_FIELDS) rec[f] = norm(p[f]);
    rec.tags = [...plinks.filter((x) => x.project_id === p.id).map((x) => x.name), ...pinds.filter((x) => x.project_id === p.id).map((x) => x.name)];
    projects.set(keyOf(p.name), rec);
  }
  const profiles = new Map<string, Rec>();
  for (const p of await q(`SELECT name, active, ${PROFILE_FIELDS.join(', ')} FROM upwork_profiles WHERE sheet_removed_at IS NULL`)) {
    const rec: Rec = { name: p.name, active: Number(p.active) ? 'Yes' : 'No' };
    for (const f of PROFILE_FIELDS) rec[f] = f.includes('price') ? num(p[f]) : norm(p[f]);
    profiles.set(keyOf(p.name), rec);
  }
  return { tag: tags, project: projects, profile: profiles };
}

// ---------- applying the sheet's changes to the app ----------
const liveLinkOf = (r: Rec) => (r.landing_link as string) || ((r.mobile_link as string) || '').split(/\s+/)[0] || (r.system_link as string) || null;
const price = (v: any) => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return v == null || v === '' || !Number.isFinite(n) ? null : n; };

async function applyToApp(conn: any, m: Record<Kind, MergeResult>) {
  const q = async (sql: string, p: any[] = []) => (await conn.query(sql, p))[0] as any;
  const catId = async (name: string) => {
    const [r] = await q('SELECT id FROM tag_categories WHERE name=?', [name]);
    if (r) return r.id;
    const ins = await q('INSERT INTO tag_categories (name, sort_order) VALUES (?, 99)', [name]); return ins.insertId;
  };
  // tags first: projects point at them
  for (const { rec } of m.tag.toApp.create) {
    const [old] = await q('SELECT id FROM tags WHERE name=?', [rec.name]);
    if (old) await q('UPDATE tags SET sheet_removed_at=NULL, active=1, category_id=?, weight=?, description=? WHERE id=?', [await catId(String(rec.category)), price(rec.weight) ?? 0, rec.description, old.id]);
    else await q('INSERT INTO tags (category_id, name, weight, description, sort_order) VALUES (?,?,?,?,999)', [await catId(String(rec.category)), rec.name, price(rec.weight) ?? 0, rec.description]);
  }
  for (const { key, fields } of m.tag.toApp.update) {
    const full = m.tag.base.get(key)!;
    if ('category' in fields) await q('UPDATE tags SET category_id=? WHERE name=?', [await catId(String(full.category)), full.name]);
    if ('weight' in fields) await q('UPDATE tags SET weight=? WHERE name=?', [price(full.weight) ?? 0, full.name]);
    if ('description' in fields) await q('UPDATE tags SET description=? WHERE name=?', [full.description, full.name]);
  }
  for (const key of m.tag.toApp.remove) await q('UPDATE tags SET sheet_removed_at=NOW(), active=0 WHERE LOWER(name)=?', [key]);

  const tagRows: any[] = await q("SELECT t.id, t.name, c.name AS category FROM tags t JOIN tag_categories c ON c.id=t.category_id");
  const tagByKey = new Map(tagRows.map((t) => [keyOf(t.name), t]));
  const setTags = async (pid: number, names: string[]) => {
    const ts = names.map((n) => tagByKey.get(keyOf(n))).filter(Boolean);
    await q('DELETE FROM project_tags WHERE project_id=?', [pid]);
    if (ts.length) await q('INSERT INTO project_tags (project_id, tag_id) VALUES ?', [ts.map((t: any) => [pid, t.id])]);
    await q('DELETE FROM project_industries WHERE project_id=?', [pid]);
    for (const t of ts.filter((x: any) => x.category === 'Industry')) {
      let [ind] = await q('SELECT id FROM industries WHERE name=?', [t.name]);
      if (!ind) ind = { id: (await q('INSERT INTO industries (name) VALUES (?)', [t.name])).insertId };
      await q('INSERT IGNORE INTO project_industries (project_id, industry_id) VALUES (?,?)', [pid, ind.id]);
    }
  };
  const projectValues = (r: Rec) => [...PROJECT_FIELDS.map((f) => r[f] ?? null), r.showable ?? null];
  for (const { key, rec } of m.project.toApp.create) {
    const [old] = await q('SELECT id FROM projects WHERE name=?', [rec.name]);
    let pid: number;
    if (old) { pid = old.id; await q(`UPDATE projects SET ${PROJECT_FIELDS.map((f) => f + '=?').join(', ')}, showable_publicly=?, sheet_removed_at=NULL, active=1 WHERE id=?`, [...projectValues(rec), pid]); }
    else pid = (await q(`INSERT INTO projects (name, ${PROJECT_FIELDS.join(', ')}, showable_publicly, live_link, added_via) VALUES (?)`, [[rec.name, ...projectValues(rec), liveLinkOf(rec), 'sheet']])).insertId;
    await q('UPDATE projects SET live_link=COALESCE(live_link, ?) WHERE id=?', [liveLinkOf(rec), pid]);
    await setTags(pid, (m.project.base.get(key)!.tags as string[]) ?? []);
  }
  for (const { key, fields } of m.project.toApp.update) {
    const full = m.project.base.get(key)!;
    const [p] = await q('SELECT id, live_link, landing_link, mobile_link, system_link FROM projects WHERE LOWER(name)=? AND sheet_removed_at IS NULL', [key]);
    if (!p) continue;
    const cols = Object.keys(fields).filter((f) => PROJECT_FIELDS.includes(f));
    if (cols.length) await q(`UPDATE projects SET ${cols.map((f) => f + '=?').join(', ')} WHERE id=?`, [...cols.map((f) => full[f] ?? null), p.id]);
    if ('showable' in fields) await q('UPDATE projects SET showable_publicly=? WHERE id=?', [full.showable ?? null, p.id]);
    // the proposal link follows the links unless someone set it by hand
    if (!p.live_link || p.live_link === liveLinkOf({ landing_link: p.landing_link, mobile_link: p.mobile_link, system_link: p.system_link })) await q('UPDATE projects SET live_link=? WHERE id=?', [liveLinkOf(full), p.id]);
    if ('tags' in fields) await setTags(p.id, (full.tags as string[]) ?? []);
  }
  for (const key of m.project.toApp.remove) await q('UPDATE projects SET sheet_removed_at=NOW(), active=0 WHERE LOWER(name)=? AND sheet_removed_at IS NULL', [key]);

  const profileValues = (r: Rec) => PROFILE_FIELDS.map((f) => (f.includes('price') ? price(r[f]) : r[f] ?? null));
  for (const { rec } of m.profile.toApp.create) {
    const [old] = await q('SELECT id FROM upwork_profiles WHERE name=?', [rec.name]);
    if (old) await q(`UPDATE upwork_profiles SET ${PROFILE_FIELDS.map((f) => f + '=?').join(', ')}, active=?, sheet_removed_at=NULL WHERE id=?`, [...profileValues(rec), rec.active === 'No' ? 0 : 1, old.id]);
    else await q(`INSERT INTO upwork_profiles (name, ${PROFILE_FIELDS.join(', ')}, active, added_via) VALUES (?)`, [[rec.name, ...profileValues(rec), rec.active === 'No' ? 0 : 1, 'sheet']]);
  }
  for (const { key, fields } of m.profile.toApp.update) {
    const full = m.profile.base.get(key)!;
    const cols = Object.keys(fields).filter((f) => PROFILE_FIELDS.includes(f));
    if (cols.length) await q(`UPDATE upwork_profiles SET ${cols.map((f) => f + '=?').join(', ')} WHERE LOWER(name)=?`, [...cols.map((f) => (f.includes('price') ? price(full[f]) : full[f] ?? null)), key]);
    if ('active' in fields) await q('UPDATE upwork_profiles SET active=? WHERE LOWER(name)=?', [full.active === 'No' ? 0 : 1, key]);
  }
  for (const key of m.profile.toApp.remove) await q('UPDATE upwork_profiles SET sheet_removed_at=NOW(), active=0 WHERE LOWER(name)=? AND sheet_removed_at IS NULL', [key]);
}

/** What a sync would do, without changing anything on either side. */
export async function previewSync(io: SheetIO) {
  const conn = await pool.getConnection();
  try {
    const titles = (await io.tabs()).map((t) => t.title);
    const proj = await io.grid(TABS.projects), dict = await io.grid(TABS.tags), prof = titles.includes(TABS.profiles) ? await io.grid(TABS.profiles) : [];
    const sheet: Record<Kind, Map<string, Rec>> = { tag: readTags(dict, proj), project: readProjects(proj), profile: readProfiles(prof) };
    await conn.beginTransaction();
    const app = await loadApp(conn);
    await conn.rollback(); // loadApp may add Industry tags for new industries: not in a preview
    const base: Record<Kind, Map<string, Rec>> = { tag: new Map(), project: new Map(), profile: new Map() };
    for (const b of (await conn.query('SELECT kind, rkey, data FROM sheet_sync_base'))[0] as any[]) base[b.kind as Kind].set(b.rkey, JSON.parse(b.data));
    return { tag: merge(base.tag, sheet.tag, app.tag), project: merge(base.project, sheet.project, app.project), profile: merge(base.profile, sheet.profile, app.profile) };
  } finally { conn.release(); }
}

// ---------- one run ----------
export interface RunSummary {
  skipped?: string;
  sheet: Record<Kind, { created: number; updated: number; removed: number }>;
  app: Record<Kind, { created: number; updated: number; removed: number }>;
  conflicts: number; held_back: { kind: Kind; side: string; keys: string[] }[];
  details: string[];
}

export async function runSync(trigger: string, opts: { io?: SheetIO; userId?: number | null } = {}): Promise<RunSummary> {
  const conn = await pool.getConnection();
  try {
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 0) AS ok', [LOCK]) as any;
    if (!Number(lock.ok)) return { skipped: 'A sync is already running', sheet: {} as any, app: {} as any, conflicts: 0, held_back: [], details: [] };
    const [run]: any = await conn.query('INSERT INTO sheet_sync_runs (trigger_kind) VALUES (?)', [trigger]);
    const runId = run.insertId;
    try {
      const s = await getSettings();
      let io = opts.io;
      if (!io) { const k = serviceAccount(); if (!k) throw new Error('No Google service account key in .env (GOOGLE_SERVICE_ACCOUNT_FILE)'); io = new GoogleSheet(s['sheet.spreadsheet_id'], k); }
      const titles = (await io.tabs()).map((t) => t.title);
      for (const t of [TABS.projects, TABS.tags]) if (!titles.includes(t)) throw new Error(`The sheet has no "${t}" tab`);
      const proj = await io.grid(TABS.projects), dict = await io.grid(TABS.tags), prof = titles.includes(TABS.profiles) ? await io.grid(TABS.profiles) : [];
      const sheet: Record<Kind, Map<string, Rec>> = { tag: readTags(dict, proj), project: readProjects(proj), profile: readProfiles(prof) };
      if (!sheet.project.size) throw new Error('The Project Tagging tab has no projects: nothing was changed (check the tab before syncing)');
      const app = await loadApp(conn);
      const base: Record<Kind, Map<string, Rec>> = { tag: new Map(), project: new Map(), profile: new Map() };
      for (const b of (await conn.query('SELECT kind, rkey, data FROM sheet_sync_base'))[0] as any[]) base[b.kind as Kind].set(b.rkey, JSON.parse(b.data));
      const m = { tag: merge(base.tag, sheet.tag, app.tag), project: merge(base.project, sheet.project, app.project), profile: merge(base.profile, sheet.profile, app.profile) };

      await conn.beginTransaction();
      await applyToApp(conn, m);
      await conn.commit();
      await applyToSheet(io, { tags: m.tag.toSheet, projects: m.project.toSheet, profiles: m.profile.toSheet }, { tags: m.tag.base, projects: m.project.base, profiles: m.profile.base });

      // the new base, only once both sides have the changes
      await conn.beginTransaction();
      await conn.query('DELETE FROM sheet_sync_base');
      const rows: any[] = []; for (const k of ['tag', 'project', 'profile'] as Kind[]) for (const [key, rec] of m[k].base) rows.push([k, key, JSON.stringify(rec)]);
      for (let i = 0; i < rows.length; i += 200) await conn.query('INSERT INTO sheet_sync_base (kind, rkey, data) VALUES ?', [rows.slice(i, i + 200)]);
      for (const k of ['tag', 'project', 'profile'] as Kind[]) for (const c of m[k].conflicts) {
        const v = (x: any) => (x == null ? null : Array.isArray(x) ? x.join(', ') : String(x));
        await conn.query(`INSERT INTO sheet_sync_conflicts (run_id, kind, rkey, field, sheet_value, app_value) VALUES (?,?,?,?,?,?)`, [runId, k, c.key, c.field, v(c.sheet), v(c.app)]);
      }
      await conn.commit();

      const count = (k: Kind, side: 'toApp' | 'toSheet') => ({ created: m[k][side].create.length, updated: m[k][side].update.length, removed: m[k][side].remove.length });
      const summary: RunSummary = {
        sheet: { tag: count('tag', 'toSheet'), project: count('project', 'toSheet'), profile: count('profile', 'toSheet') },
        app: { tag: count('tag', 'toApp'), project: count('project', 'toApp'), profile: count('profile', 'toApp') },
        conflicts: m.tag.conflicts.length + m.project.conflicts.length + m.profile.conflicts.length,
        held_back: (['tag', 'project', 'profile'] as Kind[]).flatMap((k) => m[k].heldBack.map((h) => ({ kind: k, side: h.side, keys: h.keys }))),
        details: (['project', 'profile', 'tag'] as Kind[]).flatMap((k) => [
          ...m[k].toApp.create.map((x) => `App: added ${k} ${x.rec.name}`), ...m[k].toSheet.create.map((x) => `Sheet: added ${k} ${x.rec.name}`),
          ...m[k].toApp.update.map((x) => `App: ${k} ${m[k].base.get(x.key)?.name ?? x.key} (${Object.keys(x.fields).join(', ')})`),
          ...m[k].toSheet.update.map((x) => `Sheet: ${k} ${m[k].base.get(x.key)?.name ?? x.key} (${Object.keys(x.fields).join(', ')})`),
          ...m[k].toApp.remove.map((x) => `App: put aside ${k} ${x}`), ...m[k].toSheet.remove.map((x) => `Sheet: removed ${k} ${x}`)]).slice(0, 300),
      };
      await conn.query('UPDATE sheet_sync_runs SET finished_at=NOW(), ok=1, summary=? WHERE id=?', [JSON.stringify(summary), runId]);
      const changed = summary.details.length;
      if (changed) await audit(opts.userId ?? null, 'sheet_sync', `run=${runId} changes=${changed} conflicts=${summary.conflicts}`);
      return summary;
    } catch (e) {
      await conn.rollback().catch(() => undefined);
      await conn.query('UPDATE sheet_sync_runs SET finished_at=NOW(), ok=0, error=? WHERE id=?', [String((e as Error).message).slice(0, 1000), runId]);
      throw e;
    } finally { await conn.query('SELECT RELEASE_LOCK(?)', [LOCK]); }
  } finally { conn.release(); }
}

/** After an edit in the app: sync a few seconds later (edits in a row become one run). Never blocks the request. */
let pending: NodeJS.Timeout | null = null;
export function requestSync(userId?: number | null) {
  if (!connected().ok) return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { pending = null; runSync('app_edit', { userId }).catch((e) => console.error('sheet sync failed:', (e as Error).message)); }, 4000);
}

