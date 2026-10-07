import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword } from '../src/auth';
import { appRoot } from '../src/config';
import { exec, pool, query } from '../src/db';

(async () => {
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').toLowerCase();
  const pw = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!email || pw.length < 10) throw new Error('Set SEED_ADMIN_EMAIL and a SEED_ADMIN_PASSWORD of 10+ characters in .env');
  if (!(await query('SELECT id FROM users WHERE email=?', [email])).length) {
    await exec('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)', ['Admin', email, await hashPassword(pw), 'admin']);
    console.log('admin created:', email);
  } else console.log('admin already exists');

  if (!(await query('SELECT id FROM skill_versions LIMIT 1')).length) {
    const content = readFileSync(join(appRoot, 'seed', 'gate-instructions.md'), 'utf8');
    await exec('INSERT INTO skill_versions (version, content, change_note, is_active) VALUES (1, ?, ?, 1)', [content, 'Initial gate instructions']);
    console.log('gate instructions v1 imported and active');
  } else console.log('gate instructions already present');
  await pool.end();
})().catch((e) => { console.error('seed failed:', e.message); process.exit(1); });
