import mysql from 'mysql2/promise';
import { APP_TZ_OFFSET, config } from './config';

export const pool = mysql.createPool({
  ...config.db,
  connectionLimit: 10,
  dateStrings: true,
  timezone: APP_TZ_OFFSET,
  charset: 'utf8mb4',
});
// every connection works in Pakistan time, so NOW(), DATE() and the times sent to the page are Pakistan time on a UTC server too
(pool as any).pool.on('connection', (c: any) => { c.query(`SET time_zone = '${APP_TZ_OFFSET}'`); });

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function exec(sql: string, params: any[] = []): Promise<mysql.ResultSetHeader> {
  const [res] = await pool.query(sql, params);
  return res as mysql.ResultSetHeader;
}

/** Who did what. `changes` (from src/changes.ts) says what changed: old and new values, lines, names added and removed. */
export async function audit(userId: number | null, action: string, detail?: string, changes?: { field: string }[] | null) {
  await exec('INSERT INTO audit_log (user_id, action, detail, changes) VALUES (?,?,?,?)', [
    userId,
    action,
    detail?.slice(0, 500) ?? null,
    changes && changes.length ? JSON.stringify(changes) : null,
  ]);
}

/** Runs a transaction again when MySQL picks it as a deadlock victim (two jobs writing at once). */
export async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e: any) {
      if ((e?.code === 'ER_LOCK_DEADLOCK' || e?.errno === 1213) && i < tries) { await new Promise((r) => setTimeout(r, 40 * i + Math.random() * 120)); continue; }
      throw e;
    }
  }
}
