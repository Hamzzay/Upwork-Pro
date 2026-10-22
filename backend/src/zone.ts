/**
 * Which time zone a request counts days in. A person's own zone (Settings, Your time zone; Pakistan time unless they choose
 * another) for the app; the team's working day (Settings, "The team's working day", US Eastern by default) for Claude's update
 * tools. A request may ask for one with `time_zone`: "team", "mine", or a zone name such as America/New_York.
 */
import type { NextFunction, Request, Response } from 'express';
import { query } from './db';
import { getSettings } from './settings';
import { DB_ZONE, isZone, zoneLabel } from './tz';

export async function personZone(userId: number | null | undefined): Promise<string> {
  if (!userId) return DB_ZONE;
  const row = (await query<any>('SELECT prefs_json FROM users WHERE id=?', [userId]))[0];
  try { const z = JSON.parse(row?.prefs_json || '{}')?.time_zone; return isZone(z) ? z : DB_ZONE; } catch { return DB_ZONE; }
}
export const teamZone = async () => { const z = (await getSettings())['time.team_zone']; return isZone(z) ? z : 'America/New_York'; };

/** Sets req.zone (and req.zoneLabel) for every API request. */
export async function attachZone(req: Request, _res: Response, next: NextFunction) {
  try {
    const ask = String((req.query as any)?.time_zone ?? '').trim();
    const plugin = req.path.startsWith('/plugin/');
    let z: string;
    if (ask === 'team') z = await teamZone();
    else if (ask === 'mine') z = await personZone((req as any).user?.id);
    else if (ask && isZone(ask)) z = ask;
    else z = plugin ? await teamZone() : await personZone((req as any).user?.id);
    (req as any).zone = z; (req as any).zoneLabel = zoneLabel(z);
  } catch { (req as any).zone = DB_ZONE; (req as any).zoneLabel = zoneLabel(DB_ZONE); }
  next();
}
