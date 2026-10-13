// Fills the "First two lines" rules of each proposal type from seed/templates.json, only where a type has none yet, so nothing the
// team wrote is overwritten. Safe to run again.  npm run upgrade:openings
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';
import { exec, pool } from '../src/db';
(async () => {
  const seed = JSON.parse(readFileSync(join(appRoot, 'seed', 'templates.json'), 'utf8')).templates;
  let n = 0;
  for (const t of seed) {
    if (!t.opening_rules) continue;
    n += (await exec(`UPDATE templates SET opening_rules=?, opening_no_us=?, opening_starts=? WHERE name=? AND (opening_rules IS NULL OR opening_rules='')`,
      [t.opening_rules, t.opening_no_us ? 1 : 0, t.opening_starts ?? null, t.name])).affectedRows;
  }
  console.log(`first two lines filled for ${n} proposal type(s)`);
  await pool.end();
})().catch(async (e) => { console.error(e.message); await pool.end(); process.exit(1); });
