// Backup and restore of everything Upwork Pro needs to work, without any job: the gate instructions, rules, signals, proposal types
// (templates with their signal mapping and samples), the writing guide, the project library (categories, tags, projects with their
// tags and industries), Upwork profiles and settings. Rows are matched by their name or code, never by database id, so a backup
// restores into a fresh database too (go live: migrate, seed the admin, then restore).
//   npm run setup:export                 writes seed/setup/setup.json (commit it: it is the copy we go live with)
//   npm run setup:import                 dry run: what a restore would add and change
//   npm run setup:import -- --apply      restores it (adds what is missing, makes what exists match; deletes nothing)
// Add a new setup table to SPEC below so it is backed up too.
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appRoot } from '../src/config';
import { pool } from '../src/db';

const FILE = join(appRoot, 'seed', 'setup', 'setup.json');
type Row = Record<string, any>;
/**
 * key: the natural key column(s). refs: a foreign id column stored as the referenced row's natural key.
 * links: many-to-many tables stored as a list of the other side's natural keys. children: rows that belong to this one.
 */
interface Spec { table: string; key: string[]; skip?: string[]; refs?: Record<string, { table: string; key: string }>; links?: Record<string, { table: string; self: string; other: string; otherTable: string; otherKey: string }> }
const SPEC: Spec[] = [
  { table: 'signal_layers', key: ['code'] },
  { table: 'signals', key: ['number'], refs: { layer_id: { table: 'signal_layers', key: 'code' } } },
  { table: 'signal_values', key: ['signal_id', 'name'], refs: { signal_id: { table: 'signals', key: 'number' } } },
  { table: 'tag_categories', key: ['name'] },
  { table: 'tags', key: ['name'], refs: { category_id: { table: 'tag_categories', key: 'name' } } },
  { table: 'industries', key: ['name'], skip: ['created_at'] },
  { table: 'projects', key: ['name'], skip: ['created_at', 'updated_at'], links: {
    tags: { table: 'project_tags', self: 'project_id', other: 'tag_id', otherTable: 'tags', otherKey: 'name' },
    industries: { table: 'project_industries', self: 'project_id', other: 'industry_id', otherTable: 'industries', otherKey: 'name' } } },
  { table: 'upwork_profiles', key: ['name'], skip: ['created_at'] },
  { table: 'loom_videos', key: ['profile_id', 'title'], skip: ['created_at', 'updated_at'], refs: { profile_id: { table: 'upwork_profiles', key: 'name' } }, links: {
    tags: { table: 'loom_video_tags', self: 'video_id', other: 'tag_id', otherTable: 'tags', otherKey: 'name' } } },
  { table: 'rules', key: ['code'], skip: ['created_at', 'updated_at'] },
  { table: 'skill_versions', key: ['version'], skip: ['created_by', 'created_at'] },
  { table: 'writing_docs', key: ['doc_key'], skip: ['updated_by', 'updated_at'] },
  { table: 'templates', key: ['name'], skip: ['created_at', 'updated_at'] },
  { table: 'template_signals', key: ['template_id', 'signal_id', 'value_id'], refs: { template_id: { table: 'templates', key: 'name' }, signal_id: { table: 'signals', key: 'number' }, value_id: { table: 'signal_values', key: 'name' } } },
  { table: 'template_samples', key: ['template_id', 'author', 'job_url'], skip: ['created_at'], refs: { template_id: { table: 'templates', key: 'name' } } },
  { table: 'app_settings', key: ['k'], skip: ['updated_by', 'updated_at'] },
];

const q = async (sql: string, p: any[] = []) => (await pool.query(sql, p))[0] as Row[];
const cols = async (t: string) => (await q(`SHOW COLUMNS FROM ${t}`)).map((c) => ({ name: c.Field as string, auto: /auto_increment/.test(c.Extra) }));
const hasId = async (t: string) => (await cols(t)).some((c) => c.name === 'id');

async function exportSetup() {
  const out: Record<string, Row[]> = {};
  const ids = new Map<string, Map<number, any>>(); // table -> id -> natural key value
  for (const s of SPEC) {
    const rows = await q(`SELECT * FROM ${s.table}`);
    if (await hasId(s.table)) ids.set(s.table, new Map(rows.map((r) => [r.id, r[s.key[0]]])));
    out[s.table] = [];
    for (const r of rows) {
      const o: Row = {};
      for (const [k, v] of Object.entries(r)) {
        if (k === 'id' || s.skip?.includes(k)) continue;
        const ref = s.refs?.[k];
        o[k] = ref ? (v == null ? null : ref.table === 'signal_values' ? await valueKey(v) : ids.get(ref.table)!.get(v) ?? null) : v instanceof Date ? v.toISOString() : v;
      }
      for (const [name, l] of Object.entries(s.links ?? {})) {
        o[name] = (await q(`SELECT o.${l.otherKey} AS k FROM ${l.table} x JOIN ${l.otherTable} o ON o.id=x.${l.other} WHERE x.${l.self}=? ORDER BY o.${l.otherKey}`, [r.id])).map((x) => x.k);
      }
      out[s.table].push(o);
    }
  }
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify({ exported_at: new Date().toISOString(), note: 'Upwork Pro setup data: no jobs, users or tokens. Restore with npm run setup:import -- --apply', tables: out }, null, 1) + '\n');
  console.log(`wrote ${FILE}`); for (const [t, rows] of Object.entries(out)) console.log(`  ${t}: ${rows.length}`);
}
// a signal value is "signal number|value name", since value names repeat across signals
async function valueKey(id: number) { const r = (await q('SELECT s.number, v.name FROM signal_values v JOIN signals s ON s.id=v.signal_id WHERE v.id=?', [id]))[0]; return r ? `${r.number}|${r.name}` : null; }

async function importSetup(apply: boolean) {
  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  const conn = await pool.getConnection();
  const cq = async (sql: string, p: any[] = []) => (await conn.query(sql, p))[0] as any;
  const report: string[] = [];
  try {
    await conn.beginTransaction();
    const idOf = async (table: string, key: string, value: any): Promise<number | null> => {
      if (value == null) return null;
      if (table === 'signal_values') { const [n, ...rest] = String(value).split('|'); const r = (await cq('SELECT v.id FROM signal_values v JOIN signals s ON s.id=v.signal_id WHERE s.number=? AND v.name=?', [Number(n), rest.join('|')]))[0]; return r ? r.id : null; }
      const r = (await cq(`SELECT id FROM ${table} WHERE ${key}=?`, [value]))[0]; return r ? r.id : null;
    };
    for (const s of SPEC) {
      const rows: Row[] = data.tables[s.table] ?? [];
      const columns = (await cols(s.table)).map((c) => c.name);
      let added = 0, changed = 0;
      for (const r of rows) {
        const vals: Row = {};
        for (const [k, v] of Object.entries(r)) {
          if (s.links?.[k] || !columns.includes(k)) continue;
          const ref = s.refs?.[k];
          vals[k] = ref ? await idOf(ref.table, ref.key, v) : v;
          if (ref && v != null && vals[k] == null) throw new Error(`${s.table}: ${k} "${v}" not found`);
        }
        const where = s.key.map((k) => (vals[k] == null ? `${k} IS NULL` : `${k}=?`)).join(' AND ');
        const wp = s.key.filter((k) => vals[k] != null).map((k) => vals[k]);
        const cur = (await cq(`SELECT * FROM ${s.table} WHERE ${where} LIMIT 1`, wp))[0];
        const keys = Object.keys(vals);
        if (!cur) { added++; if (apply) await cq(`INSERT INTO ${s.table} (${keys.join(', ')}) VALUES (?)`, [keys.map((k) => vals[k])]); }
        else {
          const diff = keys.filter((k) => String(cur[k] ?? '') !== String(vals[k] ?? '') && !(cur[k] instanceof Date));
          if (diff.length) { changed++; if (apply) await cq(`UPDATE ${s.table} SET ${diff.map((k) => k + '=?').join(', ')} WHERE ${where}`, [...diff.map((k) => vals[k]), ...wp]); }
        }
        for (const [name, l] of Object.entries(s.links ?? {})) {
          if (!apply) continue;
          const selfId = (await cq(`SELECT id FROM ${s.table} WHERE ${where} LIMIT 1`, wp))[0]?.id; // the full key, after the insert above
          await cq(`DELETE FROM ${l.table} WHERE ${l.self}=?`, [selfId]);
          for (const other of r[name] ?? []) { const oid = await idOf(l.otherTable, l.otherKey, other); if (oid) await cq(`INSERT IGNORE INTO ${l.table} (${l.self}, ${l.other}) VALUES (?,?)`, [selfId, oid]); }
        }
      }
      report.push(`  ${s.table}: ${rows.length} in the backup, ${added} to add, ${changed} to change`);
    }
    if (apply) await conn.commit(); else await conn.rollback();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  console.log(`${apply ? 'Restored' : 'Dry run (add --apply to restore)'} from ${FILE}, exported ${data.exported_at}`); console.log(report.join('\n'));
}

(async () => {
  const mode = process.argv[2];
  if (mode === 'export') await exportSetup();
  else if (mode === 'import') await importSetup(process.argv.includes('--apply'));
  else console.log('Use: export | import [--apply]');
  await pool.end();
})().catch(async (e) => { console.error('setup-data failed:', e.message); await pool.end(); process.exit(1); });
