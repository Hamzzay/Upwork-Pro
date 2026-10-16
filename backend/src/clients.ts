/**
 * Returning clients (R106, Hamza): a job from a client we have seen before. The pasted page shows the client's recent history and
 * other open jobs, so a job we screened weeks ago turns up in the next job's history, and the client's member-since date and country
 * stay the same. Jobs found to be from one client share a client profile, and the job page says so before anyone writes.
 * No AI: the match is worked out from the post's fields (posting.ts), so it is cheap enough to run for every job.
 */
import { exec, query } from './db';

export interface ClientPost { title: string; history: { title: string; dates: string }[]; open: string[]; country: string; memberSince: string }
export interface ClientMatch { job_id: number; why: string[] }

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** The same job title: equal, or one holds the other when both are long enough to mean it (Upwork cuts long titles in lists). */
export function sameTitle(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (x.length < 12 || y.length < 12) return false;
  if (x === y) return true;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return s.length >= 20 && l.startsWith(s);
}

/** A job's client, from its post's fields. */
export function clientPost(title: string | null, posting: any): ClientPost | null {
  if (!posting || typeof posting !== 'object') return null;
  const pair = (re: RegExp) => String(((posting.client ?? []) as any[]).find((c) => re.test(String(c?.label ?? '')))?.value ?? '').trim();
  return {
    title: String(posting.title || title || ''),
    history: ((posting.client_history ?? []) as any[]).map((h) => ({ title: String(h?.title ?? ''), dates: String(h?.dates ?? '') })).filter((h) => norm(h.title)),
    open: ((posting.other_open_jobs ?? []) as any[]).map((x) => String(x ?? '')).filter((x) => norm(x)),
    country: pair(/^country$/i),
    memberSince: pair(/member since/i).replace(/^member since\s*/i, ''),
  };
}

/** Why two jobs are from the same client, or [] when nothing says so. a is the newer job. */
export function sameClient(a: ClientPost, b: ClientPost): string[] {
  const why: string[] = [];
  const twin = sameTitle(a.title, b.title); // the same title: most likely this same job, saved twice
  if (a.history.some((h) => sameTitle(h.title, b.title))) why.push('the earlier job is in this client\'s recent history');
  else if (a.open.some((t) => sameTitle(t, b.title))) why.push('the earlier job is one of this client\'s open jobs');
  else if (b.open.some((t) => sameTitle(t, a.title)) || b.history.some((h) => sameTitle(h.title, a.title))) why.push('this job was listed on the earlier job\'s page');
  if (norm(a.memberSince) && /\d{4}/.test(a.memberSince) && norm(a.memberSince) === norm(b.memberSince) && norm(a.country) && norm(a.country) === norm(b.country)) why.push(`the same member-since date (${a.memberSince}) and country`);
  const shared = a.history.filter((h) => b.history.some((g) => sameTitle(g.title, h.title) && norm(g.dates) === norm(h.dates))).length;
  if (shared >= 2) why.push(`${shared} past jobs in common in the client's history`);
  if (why.length && twin) why.unshift('the same job title: it may be this same job saved again');
  return why;
}

/**
 * Finds the earlier jobs from this job's client and links them all to one client profile (created on the second job). Run once the
 * post is read into fields; a job without them is left to be checked later.
 */
export async function linkClient(screeningId: number): Promise<ClientMatch[] | null> {
  const me = (await query<any>('SELECT id, title, posting_json, client_id FROM screenings WHERE id=?', [screeningId]))[0];
  if (!me) return null;
  let posting: any = null; try { posting = me.posting_json ? JSON.parse(me.posting_json) : null; } catch { posting = null; }
  const mine = clientPost(me.title, posting);
  if (!mine) return null;
  const others = await query<any>('SELECT id, title, posting_json, client_id FROM screenings WHERE id<>? AND discarded_at IS NULL AND posting_json IS NOT NULL ORDER BY id DESC LIMIT 5000', [me.id]);
  const matches: (ClientMatch & { client_id: number | null })[] = [];
  for (const o of others) {
    let p: any = null; try { p = JSON.parse(o.posting_json); } catch { continue; }
    const theirs = clientPost(o.title, p); if (!theirs) continue;
    const why = o.id < me.id ? sameClient(mine, theirs) : sameClient(theirs, mine);
    if (why.length) matches.push({ job_id: o.id, why, client_id: o.client_id ?? null });
  }
  let clientId: number | null = me.client_id ?? null;
  if (matches.length) {
    const known = [...new Set([clientId, ...matches.map((m) => m.client_id)].filter((x): x is number => !!x))].sort((x, y) => x - y);
    if (known.length) clientId = known[0];
    else clientId = Number((await exec('INSERT INTO clients (country, member_since) VALUES (?,?)', [mine.country || null, mine.memberSince || null])).insertId);
    // every job of these clients is one client now (a new job can show that two profiles were the same client)
    if (known.length > 1) await exec('UPDATE screenings SET client_id=? WHERE client_id IN (?)', [clientId, known.slice(1)]);
    await exec('UPDATE screenings SET client_id=? WHERE id IN (?) AND client_id IS NULL', [clientId, matches.map((m) => m.job_id)]);
    await exec('UPDATE clients SET country=COALESCE(country, ?), member_since=COALESCE(member_since, ?) WHERE id=?', [mine.country || null, mine.memberSince || null, clientId]);
  }
  const found = matches.map(({ job_id, why }) => ({ job_id, why }));
  await exec('UPDATE screenings SET client_id=?, client_match_json=?, client_checked_at=NOW() WHERE id=?', [clientId, found.length ? JSON.stringify(found) : null, me.id]);
  return found;
}

/** Jobs whose post has been read but whose client was never checked (the jobs saved before R106, and any the worker missed). */
export async function linkUnchecked(limit = 500): Promise<number> {
  const rows = await query<any>(`SELECT id FROM screenings WHERE client_checked_at IS NULL AND posting_json IS NOT NULL AND discarded_at IS NULL ORDER BY id LIMIT ?`, [limit]);
  for (const r of rows) await linkClient(r.id);
  return rows.length;
}

/** The client of a job, for its page and for Claude: the other jobs from the same client, and why they were matched. */
export async function clientFor(screeningId: number) {
  const s = (await query<any>('SELECT id, client_id, client_match_json FROM screenings WHERE id=?', [screeningId]))[0];
  if (!s?.client_id) return null;
  const c = (await query<any>('SELECT id, name, country, member_since, notes FROM clients WHERE id=?', [s.client_id]))[0];
  if (!c) return null;
  let why: ClientMatch[] = []; try { why = s.client_match_json ? JSON.parse(s.client_match_json) : []; } catch { why = []; }
  const jobs = await query<any>(`SELECT s.id, s.user_id, s.title, s.created_at, s.verdict, s.proceeded, s.continued_at IS NOT NULL AS continued, COALESCE(s.proposal_sent_at, s.proposal_sent_date) AS sent_at,
      s.client_viewed, s.client_replied, s.interviewed, s.outcome, u.name AS user_name, pr.name AS profile_name, p.template_name
    FROM screenings s JOIN users u ON u.id=s.user_id LEFT JOIN upwork_profiles pr ON pr.id=s.upwork_profile_id LEFT JOIN proposals p ON p.screening_id=s.id
    WHERE s.client_id=? AND s.id<>? AND s.discarded_at IS NULL ORDER BY s.id DESC`, [c.id, s.id]);
  return { ...c, jobs: jobs.map((j) => ({ ...j, continued: !!Number(j.continued), why: why.find((w) => w.job_id === j.id)?.why ?? null })) };
}
