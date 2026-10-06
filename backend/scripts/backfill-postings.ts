import 'dotenv/config';
import { exec, pool, query } from '../src/db';

// Queues "read the job post into fields" for jobs pasted before that existed. The worker does the reading, one AI
// call per job, so this spends quota: run it on purpose, not as part of setup. Add --dry-run to only count.
(async () => {
  const dry = process.argv.includes('--dry-run');
  const rows = await query<{ id: number }>(`SELECT id FROM screenings WHERE posting_json IS NULL AND status='done' AND (posting_status IS NULL OR posting_status='error') ORDER BY id`);
  if (!dry && rows.length) await exec(`UPDATE screenings SET posting_status='queued', posting_error=NULL WHERE id IN (?)`, [rows.map((r) => r.id)]);
  console.log(`${dry ? 'would queue' : 'queued'} ${rows.length} job${rows.length === 1 ? '' : 's'} for posting extraction${dry || !rows.length ? '' : ' (the worker reads them one at a time)'}`);
  await pool.end();
})().catch((e) => { console.error('backfill:postings failed:', e.message); process.exit(1); });
