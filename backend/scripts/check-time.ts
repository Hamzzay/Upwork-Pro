// Shows the times the app works in: the database session, the server and Pakistan. npx ts-node scripts/check-time.ts
import 'dotenv/config';
import { pool, query } from '../src/db';
(async () => {
  const [r] = await query<any>('SELECT @@session.time_zone AS session_zone, NOW() AS db_now, UTC_TIMESTAMP() AS utc_now');
  console.log({ ...r, server_now: new Date().toString(), pakistan_now: new Date().toLocaleString('sv', { timeZone: 'Asia/Karachi' }) });
  await pool.end();
})();
