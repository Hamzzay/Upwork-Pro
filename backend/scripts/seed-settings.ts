import 'dotenv/config';
import { exec, pool, query } from '../src/db';
import { SETTINGS } from '../src/settings';

// Adds every admin setting that is missing, with the default defined in src/settings.ts (the one source of the
// defaults). Insert-if-missing: a value an admin has changed is never overwritten. Safe to run any time.
(async () => {
  const have = new Set((await query<{ k: string }>('SELECT k FROM app_settings')).map((r) => r.k));
  const added: string[] = [];
  for (const [k, d] of Object.entries(SETTINGS)) {
    if (have.has(k)) continue;
    await exec('INSERT IGNORE INTO app_settings (k, v) VALUES (?, ?)', [k, JSON.stringify(d.def)]);
    added.push(k);
  }
  console.log(added.length ? `settings added: ${added.join(', ')}` : `settings already present (${have.size})`);
  await pool.end();
})().catch((e) => { console.error('seed:settings failed:', e.message); process.exit(1); });
