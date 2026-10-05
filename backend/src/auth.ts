import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import { exec, query } from './db';
import { config } from './config';

export type Role = 'admin' | 'manager' | 'employee';
export interface AuthUser { id: number; name: string; email: string; role: Role }

declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

const COOKIE = 'ug_session';
const SESSION_DAYS = 7;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// A fixed hash so a login for an unknown email costs the same time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser } | null> {
  const rows = await query<any>('SELECT id, name, email, role, active, password_hash FROM users WHERE email=? LIMIT 1', [email.toLowerCase().trim()]);
  const u = rows[0];
  const ok = await checkPassword(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok || !u.active) return null;
  const token = randomBytes(32).toString('hex');
  await exec('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?, DATE_ADD(NOW(), INTERVAL ? DAY))', [sha(token), u.id, SESSION_DAYS]);
  return { token, user: { id: u.id, name: u.name, email: u.email, role: u.role } };
}

export const setSessionCookie = (res: Response, token: string) =>
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.prod, maxAge: SESSION_DAYS * 86_400_000, path: '/' });

export async function logout(req: Request, res: Response) {
  const t = req.cookies?.[COOKIE];
  if (t) await exec('DELETE FROM sessions WHERE token_hash=?', [sha(t)]);
  res.clearCookie(COOKIE, { path: '/' });
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const t = req.cookies?.[COOKIE];
  if (t) {
    const rows = await query<any>(
      `SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=? AND s.expires_at > NOW() AND u.active=1`, [sha(t)]);
    if (rows[0]) req.user = rows[0];
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return void res.status(401).json({ error: 'Not signed in' });
    if (roles.length && !roles.includes(req.user.role)) return void res.status(403).json({ error: 'Not allowed' });
    next();
  };
}

/** Minimal in-memory login throttle: 8 tries per 10 minutes per IP+email. */
const attempts = new Map<string, { n: number; reset: number }>();
export function loginThrottled(key: string): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) { attempts.set(key, { n: 1, reset: now + 600_000 }); return false; }
  a.n++;
  return a.n > 8;
}
