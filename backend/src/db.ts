import mysql from 'mysql2/promise';
import { config } from './config';

export const pool = mysql.createPool({
  ...config.db,
  connectionLimit: 10,
  dateStrings: true,
  charset: 'utf8mb4',
});

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function exec(sql: string, params: any[] = []): Promise<mysql.ResultSetHeader> {
  const [res] = await pool.query(sql, params);
  return res as mysql.ResultSetHeader;
}

export async function audit(userId: number | null, action: string, detail?: string) {
  await exec('INSERT INTO audit_log (user_id, action, detail) VALUES (?,?,?)', [
    userId,
    action,
    detail?.slice(0, 500) ?? null,
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
