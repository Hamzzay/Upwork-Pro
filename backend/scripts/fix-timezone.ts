// Once, after moving to Pakistan time (R45): times the database wrote in its own zone are moved to Pakistan time. On a database
// already in Pakistan time (UTC+5) it changes nothing. Status times people typed (sent, viewed, chat, interview, outcome and the status
// history) were already entered in Pakistan time and are left alone. Run it once, right after deploying, before people use the app:
//   npm run fix:timezone            dry run: says what it would do
//   npm run fix:timezone -- --apply
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { config } from '../src/config';

const SHIFT = [
  ['api_tokens', ['expires_at', 'revoked_at', 'last_used_at']], ['early_drafts', ['finished_at', 'used_at']],
  ['import_batches', ['expires_at', 'committed_at', 'undone_at']], ['oauth_clients', ['last_used_at']], ['oauth_codes', ['expires_at', 'used_at']],
  ['oauth_refresh_tokens', ['expires_at', 'used_at', 'revoked_at']], ['oauth_requests', ['expires_at', 'done_at']], ['proposals', ['finished_at', 'finalized_at']],
  ['screenings', ['started_at', 'finished_at', 'continued_at', 'tagged_at', 'selection_confirmed_at', 'proposal_profile_confirmed_at', 'tracking_updated_at', 'discarded_at']],
  ['sessions', ['expires_at']],
] as const;
(async () => {
  const apply = process.argv.includes('--apply');
  const c = await mysql.createConnection({ ...config.db, dateStrings: true }); // the database's own zone, not the app's
  try {
    const [[z]]: any = await c.query('SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS offset, @@global.time_zone AS g, @@system_time_zone AS s');
    const shift = 300 - Number(z.offset);
    console.log(`database zone: ${z.g} (${z.s}), ${z.offset} minutes from UTC; Pakistan is +300`);
    const [[done]]: any = await c.query("SELECT COUNT(*) AS n FROM audit_log WHERE action='timezone_shift'");
    if (!shift) { console.log('already Pakistan time: nothing to change'); return; }
    if (done.n) { console.log('already done once: nothing to change'); return; }
    for (const [t, cols] of SHIFT) {
      const [[cnt]]: any = await c.query(`SELECT COUNT(*) AS n FROM ${t} WHERE ${cols.map((x) => `${x} IS NOT NULL`).join(' OR ')}`);
      console.log(`  ${t}: ${cnt.n} row(s), ${cols.join(', ')} ${shift > 0 ? '+' : ''}${shift} minutes`);
      if (apply) for (const col of cols) await c.query(`UPDATE ${t} SET ${col} = ${col} + INTERVAL ? MINUTE WHERE ${col} IS NOT NULL`, [shift]);
    }
    if (apply) { await c.query("INSERT INTO audit_log (user_id, action, detail) VALUES (NULL, 'timezone_shift', ?)", [`shift=${shift} minutes`]); console.log('done'); }
    else console.log('dry run: add -- --apply to change them');
  } finally { await c.end(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
