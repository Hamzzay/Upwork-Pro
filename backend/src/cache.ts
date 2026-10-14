/**
 * A small memory for the worker (PLAN-SPEED point 8): settings, the writing guide, the tag dictionary, the library and the signal
 * definitions change only when an admin changes the setup, so the worker keeps them instead of reading them again for every step.
 * Every setup change is a change set (changesets.ts), so the newest change set id is the version: when it moves, everything is read
 * again. It is checked at most once a second, and nothing is kept longer than a minute (for a change made outside the setup routes).
 * Only the worker turns it on; the web app always reads fresh.
 */
import { query } from './db';

let on = false;
export const enableSetupCache = () => { on = true; };
let version = -1, checkedAt = 0;
const store = new Map<string, { v: number; at: number; value: Promise<unknown> }>();

async function setupVersion(): Promise<number> {
  if (Date.now() - checkedAt < 1000) return version;
  checkedAt = Date.now();
  version = Number((await query<any>('SELECT COALESCE(MAX(id), 0) AS n FROM change_sets'))[0]?.n ?? 0);
  return version;
}
export async function cached<T>(key: string, load: () => Promise<T>, ttlMs = 60_000): Promise<T> {
  if (!on) return load();
  const v = await setupVersion();
  const hit = store.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { v, at: Date.now(), value });
  value.catch(() => store.delete(key)); // a failed read is never kept
  return value;
}
