// Seeds the writing guide (proposal types, writing rules, banned phrases, modules, screening answers, checklist) from seed/writing/*.md,
// the files the Claude plugin used to carry. Insert-if-missing only: an edit made in the app (Writing guide page) is never overwritten.
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';
import { exec, pool, query } from '../src/db';

const KINDS: Record<string, [string, number]> = { 'writing-rules': ['rules', 10], 'banned-phrases': ['banned', 20], modules: ['modules', 30], 'screening-answers': ['screening', 40], 'verification-checklist': ['checklist', 50], 'type-selection': ['selection', 60] };

(async () => {
  const dir = join(appRoot, 'seed', 'writing');
  let added = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    const key = f.replace(/\.md$/, ''), content = readFileSync(join(dir, f), 'utf8');
    const title = (/^#\s+(.+)$/m.exec(content)?.[1] ?? key).trim();
    const t = /^(\d+)-/.exec(key);
    const [kind, sort] = t ? ['type', Number(t[1])] : KINDS[key] ?? ['rules', 90];
    if ((await query('SELECT id FROM writing_docs WHERE doc_key=?', [key])).length) continue;
    const r = await exec('INSERT INTO writing_docs (doc_key, kind, title, sort_order, content) VALUES (?,?,?,?,?)', [key, kind, title, sort, content]);
    await exec('INSERT INTO writing_doc_versions (doc_id, content, note) VALUES (?,?,?)', [r.insertId, content, 'From the Claude plugin']);
    added++;
  }
  console.log(`writing guide: ${added} document(s) added`);
  await pool.end();
})().catch((e) => { console.error('seed-writing failed:', e.message); process.exit(1); });
