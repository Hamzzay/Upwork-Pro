import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';
import { pool } from '../src/db';
import { splitMobile } from '../src/library/mobile';

const statements = (sql: string) => sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean);

// MariaDB accepts `ADD/DROP COLUMN|KEY|INDEX|FOREIGN KEY ... IF [NOT] EXISTS`; MySQL rejects it at parse time.
// Strip only that guard (never the valid `CREATE TABLE IF NOT EXISTS` / `DROP TABLE IF EXISTS`) so the statement
// parses on MySQL, then ignore the "already there / not there" errors below so it stays idempotent on both.
const forMySQL = (sql: string) =>
  sql.replace(/\b(ADD|DROP)\s+(COLUMN|KEY|INDEX|UNIQUE(?:\s+KEY)?|FOREIGN\s+KEY|CONSTRAINT)\s+IF\s+(?:NOT\s+)?EXISTS\b/gi,
    (_m, verb, obj) => `${verb} ${obj}`)
    // and `CREATE [UNIQUE] INDEX IF NOT EXISTS` (MySQL rejects it too; a second run then fails with 1061, ignored below)
    .replace(/\bCREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b/gi, (_m, u) => `CREATE ${u || ''}INDEX`);

// errno: 1060 duplicate column, 1061 duplicate key name, 1091 can't DROP missing column/key, 1826 duplicate foreign key.
// These are exactly the cases MariaDB's IF [NOT] EXISTS would have silently skipped.
const IDEMPOTENT = new Set([1060, 1061, 1091, 1826]);

const run = async (stmt: string) => {
  try {
    await pool.query(forMySQL(stmt));
  } catch (e: any) {
    if (IDEMPOTENT.has(e?.errno)) return;
    throw e;
  }
};

(async () => {
  // 001: the base schema, safe to run again (CREATE TABLE IF NOT EXISTS)
  for (const stmt of statements(readFileSync(join(appRoot, 'sql', 'schema.sql'), 'utf8'))) await run(stmt);
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const done = new Set(((await pool.query('SELECT name FROM schema_migrations'))[0] as any[]).map((r) => r.name));
  const dir = join(appRoot, 'sql', 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    for (const stmt of statements(readFileSync(join(dir, f), 'utf8'))) await run(stmt);
    await pool.query('INSERT INTO schema_migrations (name) VALUES (?)', [f]);
    console.log('applied', f);
  }
  // data steps: changes to rows that SQL alone cannot make well, each run once
  const steps: [string, () => Promise<number>][] = [
    ['030_android_ios_links.data', async () => { // split the old mobile link into Android, iOS and anything else (kept)
      const rows = ((await pool.query("SELECT id, mobile_link FROM projects WHERE mobile_link IS NOT NULL AND mobile_link<>'' AND android_link IS NULL AND ios_link IS NULL"))[0] as any[]);
      for (const r of rows) { const m = splitMobile(r.mobile_link); await pool.query('UPDATE projects SET android_link=?, ios_link=?, mobile_link=? WHERE id=?', [m.android, m.ios, m.other, r.id]); }
      return rows.length;
    }],
  ];
  for (const [name, fn] of steps) {
    if (done.has(name)) continue;
    const n = await fn();
    await pool.query('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
    console.log('applied', name, `(${n} row${n === 1 ? '' : 's'})`);
  }
  console.log('schema up to date');
  await pool.end();
})().catch((e) => { console.error('migrate failed:', e.message); process.exit(1); });
