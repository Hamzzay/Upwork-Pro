import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';
import { pool } from '../src/db';

const statements = (sql: string) => sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean);

(async () => {
  // 001: the base schema, safe to run again (CREATE TABLE IF NOT EXISTS)
  for (const stmt of statements(readFileSync(join(appRoot, 'sql', 'schema.sql'), 'utf8'))) await pool.query(stmt);
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const done = new Set(((await pool.query('SELECT name FROM schema_migrations'))[0] as any[]).map((r) => r.name));
  const dir = join(appRoot, 'sql', 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    for (const stmt of statements(readFileSync(join(dir, f), 'utf8'))) await pool.query(stmt);
    await pool.query('INSERT INTO schema_migrations (name) VALUES (?)', [f]);
    console.log('applied', f);
  }
  console.log('schema up to date');
  await pool.end();
})().catch((e) => { console.error('migrate failed:', e.message); process.exit(1); });
