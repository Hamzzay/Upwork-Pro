/**
 * Days in a chosen time zone. The database keeps Pakistan time (R45); a person may see the app in their own zone (Settings, Your
 * time zone), and Claude's updates count the team's working day (Settings, "The team's working day", US Eastern by default), so a
 * day's proposals are never split across two dates. Each day's start and end are turned into Pakistan time for the queries.
 * Daylight saving is followed (the zone's real clock, not a fixed offset). Pure functions, no database.
 */
export const DB_ZONE = 'Asia/Karachi';
export const ZONES: [string, string][] = [
  ['Asia/Karachi', 'Pakistan time'], ['America/New_York', 'US Eastern'], ['America/Chicago', 'US Central'], ['America/Denver', 'US Mountain'],
  ['America/Los_Angeles', 'US Pacific'], ['Europe/London', 'UK'], ['Asia/Dubai', 'UAE'], ['UTC', 'UTC'],
];
export const zoneLabel = (z: string) => ZONES.find(([k]) => k === z)?.[1] ?? z;
export function isZone(z: unknown): z is string {
  if (typeof z !== 'string' || !z || z.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; }
}

/** The wall clock of an instant in a zone, as "YYYY-MM-DD HH:MM:SS". */
export function wallClock(at: Date, zone: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
/** The instant a zone's wall clock shows "YYYY-MM-DD HH:MM[:SS]" (the first one, on the day the clocks go back). */
export function instantOf(wall: string, zone: string): Date {
  const [d, t = '00:00:00'] = wall.trim().replace('T', ' ').split(' ');
  const [y, mo, da] = d.split('-').map(Number), [h, mi, s = 0] = t.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi, s);
  let at = guess;
  for (let i = 0; i < 3; i++) { // move by the zone's offset until its clock shows the wall time
    const shown = wallClock(new Date(at), zone);
    const [sd, st] = shown.split(' '); const [sy, smo, sda] = sd.split('-').map(Number); const [sh, smi, ss] = st.split(':').map(Number);
    const diff = guess - Date.UTC(sy, smo - 1, sda, sh, smi, ss);
    if (!diff) break; at += diff;
  }
  return new Date(at);
}
/** A wall time in one zone, as the wall time in another ("YYYY-MM-DD HH:MM:SS"). */
export const convertWall = (wall: string, from: string, to: string) => wallClock(instantOf(wall, from), to);
/** A stored time (Pakistan) as the wall time in a zone. */
export const fromDb = (stored: string | Date, zone: string) => (stored instanceof Date ? wallClock(stored, zone) : convertWall(String(stored), DB_ZONE, zone));

/** A zone's days "from" to "to" (YYYY-MM-DD, both included) as stored-time bounds: start included, end excluded. */
export function dayBounds(from: string | null | undefined, to: string | null | undefined, zone: string): { start: string | null; end: string | null } {
  const next = (d: string) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
  return { start: from ? convertWall(from + ' 00:00:00', zone, DB_ZONE) : null, end: to ? convertWall(next(to) + ' 00:00:00', zone, DB_ZONE) : null };
}
/** Today in a zone, YYYY-MM-DD. */
export const todayIn = (zone: string, now = new Date()) => wallClock(now, zone).slice(0, 10);
/** A zone's day of a stored time, YYYY-MM-DD. */
export const dayIn = (stored: string | Date, zone: string) => fromDb(stored, zone).slice(0, 10);
/** Minutes from the stored (Pakistan) clock to the zone's clock at an instant: add this to a stored time to get the zone's time. */
export function shiftMinutes(zone: string, at = new Date()): number {
  const a = instantOf(wallClock(at, DB_ZONE), 'UTC').getTime(), b = instantOf(wallClock(at, zone), 'UTC').getTime();
  return Math.round((b - a) / 60000);
}
