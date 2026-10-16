/**
 * Returning clients (R106, Hamza): a job from a client we have seen before. The pasted page shows the client's recent history and
 * other open jobs, so a job we screened weeks ago turns up in the next job's history, and the client's member-since date and country
 * stay the same. Jobs found to be from one client share a client profile, and the job page says so before anyone writes.
 * No AI: the match is worked out from the post's fields (posting.ts), so it is cheap enough to run for every job.
 */
import { exec, query } from './db';

export interface ClientPost { title: string; history: { title: string; dates: string }[]; open: string[]; country: string; memberSince: string; city: string; company: string; contact: string; jobId: string }
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

/** A job's client, from its post's fields. jobId: the Upwork job id from the job's link, when there is one. */
export function clientPost(title: string | null, posting: any, jobId?: string | null): ClientPost | null {
  if (!posting || typeof posting !== 'object') return null;
  const real = (v: unknown) => { const t = String(v ?? '').trim(); return /^(not (shown|known|stated|given)|none|n\/a|unknown|-)$/i.test(t) ? '' : t; }; // a placeholder is no value
  const pair = (re: RegExp) => real(((posting.client ?? []) as any[]).find((c) => re.test(String(c?.label ?? '')))?.value);
  return {
    title: String(posting.title || title || ''),
    history: ((posting.client_history ?? []) as any[]).map((h) => ({ title: String(h?.title ?? ''), dates: String(h?.dates ?? '') })).filter((h) => norm(h.title)),
    open: ((posting.other_open_jobs ?? []) as any[]).map((x) => String(x ?? '')).filter((x) => norm(x)),
    country: pair(/^country$/i),
    memberSince: pair(/member since/i).replace(/^member since\s*/i, ''),
    // the city, without the local time Upwork shows beside it ("Charlotte Amalie 11:58 AM")
    city: pair(/^city/i).replace(/\s*\d{1,2}:\d{2}\s*(am|pm)?.*$/i, '').trim(),
    company: real(posting.company_name), contact: real(posting.client_name), // R107: only when the post states them
    jobId: jobId ? String(jobId) : '',
  };
}

/**
 * Why two jobs are from the same client, or [] when nothing says so. a is the newer job.
 * R111 (Hamza): a brand-new client (no history, one job, no reviews) shares nothing with another one but, at most, the day they joined
 * and the country, and many new clients join on the same day. So that alone never joins two jobs: it counts only beside the same city,
 * the same job or a past job in common. Every reason here is one a new client cannot match by chance.
 */
export function sameClient(a: ClientPost, b: ClientPost): string[] {
  const why: string[] = [];
  const countriesDiffer = !!(norm(a.country) && norm(b.country) && norm(a.country) !== norm(b.country));
  if (a.jobId && a.jobId === b.jobId) why.push('the same Upwork job (the same link)');
  const twin = sameTitle(a.title, b.title); // the same title: most likely this same job, saved twice
  // a job of one is listed on the other's page (history or open jobs), and nothing says they are in different countries
  if (!countriesDiffer) {
    if (a.history.some((h) => sameTitle(h.title, b.title))) why.push('the earlier job is in this client\'s recent history');
    else if (a.open.some((t) => sameTitle(t, b.title))) why.push('the earlier job is one of this client\'s open jobs');
    else if (b.open.some((t) => sameTitle(t, a.title)) || b.history.some((h) => sameTitle(h.title, a.title))) why.push('this job was listed on the earlier job\'s page');
  }
  const shared = a.history.filter((h) => b.history.some((g) => sameTitle(g.title, h.title) && norm(g.dates) === norm(h.dates))).length;
  if (shared >= 2) why.push(`${shared} past jobs in common in the client's history`);
  // the member-since day and country: only beside something a new client cannot share by chance
  const sameDay = !!(norm(a.memberSince) && /\d{4}/.test(a.memberSince) && norm(a.memberSince) === norm(b.memberSince) && norm(a.country) && norm(a.country) === norm(b.country));
  const sameCity = !!(norm(a.city) && norm(a.city) === norm(b.city));
  if (sameDay && (sameCity || twin || shared >= 1 || why.length)) why.push(`the same member-since date (${a.memberSince}) and country${sameCity ? ` and city (${a.city})` : ''}`);
  // R107: the same company, or the same full name in the same country (a first name alone says nothing)
  const co = norm(a.company).replace(/\b(inc|llc|ltd|limited|corp|co|gmbh|pty|the)\b/g, '').trim();
  if (co.length >= 4 && co === norm(b.company).replace(/\b(inc|llc|ltd|limited|corp|co|gmbh|pty|the)\b/g, '').trim()) why.push(`the same company (${a.company})`);
  if (norm(a.contact).split(' ').length >= 2 && norm(a.contact) === norm(b.contact) && norm(a.country) && norm(a.country) === norm(b.country)) why.push(`the same client name (${a.contact}) and country`);
  // the same title alone joins nothing (two clients can post the same title); beside a reason above, it says it may be one job twice
  if (why.length && twin) why.unshift('the same job title: it may be this same job saved again');
  return why;
}

/**
 * Finds the earlier jobs from this job's client and links them all to one client profile (created on the second job). Run once the
 * post is read into fields; a job without them is left to be checked later.
 */
export async function linkClient(screeningId: number): Promise<ClientMatch[] | null> {
  const me = (await query<any>('SELECT id, title, posting_json, client_id, client_manual, upwork_job_id FROM screenings WHERE id=?', [screeningId]))[0];
  if (!me) return null;
  if (Number(me.client_manual) && me.client_id) { await exec('UPDATE screenings SET client_checked_at=NOW() WHERE id=?', [me.id]); return []; } // placed by a person: left where they put it
  let posting: any = null; try { posting = me.posting_json ? JSON.parse(me.posting_json) : null; } catch { posting = null; }
  const mine = clientPost(me.title, posting, me.upwork_job_id);
  if (!mine) return null;
  const others = await query<any>('SELECT id, title, posting_json, client_id, client_manual, upwork_job_id FROM screenings WHERE id<>? AND discarded_at IS NULL AND posting_json IS NOT NULL ORDER BY id DESC LIMIT 5000', [me.id]);
  const matches: (ClientMatch & { client_id: number | null })[] = [];
  for (const o of others) {
    let p: any = null; try { p = JSON.parse(o.posting_json); } catch { continue; }
    const theirs = clientPost(o.title, p, o.upwork_job_id); if (!theirs) continue;
    const why = o.id < me.id ? sameClient(mine, theirs) : sameClient(theirs, mine);
    if (why.length) matches.push({ job_id: o.id, why, client_id: o.client_id ?? null });
  }
  let clientId: number | null = me.client_id ?? null;
  // R107: every job has a profile; the second job from a client joins the first one's
  const known = [...new Set([clientId, ...matches.map((m) => m.client_id)].filter((x): x is number => !!x))].sort((x, y) => x - y);
  if (known.length) clientId = known[0];
  else clientId = Number((await exec('INSERT INTO clients (country, member_since) VALUES (?,?)', [mine.country || null, mine.memberSince || null])).insertId);
  if (matches.length) {
    // every job of these profiles is one client now (a new job can show that two profiles were the same client); a job a person placed stays
    if (known.length > 1) {
      await exec('UPDATE screenings SET client_id=? WHERE client_id IN (?) AND client_manual=0', [clientId, known.slice(1)]);
      await exec(`UPDATE clients c SET merged_into=? WHERE c.id IN (?) AND NOT EXISTS (SELECT 1 FROM screenings s WHERE s.client_id=c.id)`, [clientId, known.slice(1)]);
    }
    await exec('UPDATE screenings SET client_id=? WHERE id IN (?) AND (client_id IS NULL OR client_manual=0)', [clientId, matches.map((m) => m.job_id)]);
  }
  await exec('UPDATE clients SET country=COALESCE(country, ?), member_since=COALESCE(member_since, ?), company=COALESCE(company, ?), contact_name=COALESCE(contact_name, ?) WHERE id=?',
    [mine.country || null, mine.memberSince || null, mine.company || null, mine.contact || null, clientId]);
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
  const c = (await query<any>('SELECT id, name, company, contact_name, country, member_since, notes FROM clients WHERE id=?', [s.client_id]))[0];
  if (!c) return null;
  let why: ClientMatch[] = []; try { why = s.client_match_json ? JSON.parse(s.client_match_json) : []; } catch { why = []; }
  const jobs = await query<any>(`SELECT s.id, s.user_id, s.title, s.created_at, s.verdict, s.proceeded, s.continued_at IS NOT NULL AS continued, COALESCE(s.proposal_sent_at, s.proposal_sent_date) AS sent_at,
      s.client_viewed, s.client_replied, s.interviewed, s.outcome, u.name AS user_name, pr.name AS profile_name, p.template_name
    FROM screenings s JOIN users u ON u.id=s.user_id LEFT JOIN upwork_profiles pr ON pr.id=s.upwork_profile_id LEFT JOIN proposals p ON p.screening_id=s.id
    WHERE s.client_id=? AND s.id<>? AND s.discarded_at IS NULL ORDER BY s.id DESC`, [c.id, s.id]);
  return { ...c, jobs: jobs.map((j) => ({ ...j, continued: !!Number(j.continued), why: why.find((w) => w.job_id === j.id)?.why ?? null })) };
}

/**
 * R107 (Hamza): one place for a client: their jobs with us (who had them, from which profile, invites, how each went), what Upwork
 * shows about them (the newest post's client section), and their history and other open jobs on Upwork, from every post we saw.
 */
export async function clientProfile(clientId: number) {
  const c = (await query<any>('SELECT id, name, company, contact_name, country, member_since, notes, merged_into, created_at FROM clients WHERE id=?', [clientId]))[0];
  if (!c) return null;
  const posts = await query<any>('SELECT id, posting_json, created_at FROM screenings WHERE client_id=? AND discarded_at IS NULL AND posting_json IS NOT NULL ORDER BY id DESC', [clientId]);
  let about: { label: string; value: string }[] = [], aboutFrom: number | null = null;
  const history = new Map<string, any>(), open = new Map<string, { title: string; seen: string }>();
  for (const r of posts) {
    let p: any = null; try { p = JSON.parse(r.posting_json); } catch { continue; }
    if (!about.length && Array.isArray(p.client) && p.client.length) { about = p.client.filter((x: any) => x && x.label && x.value); aboutFrom = r.id; }
    for (const h of p.client_history ?? []) { const k = norm(h?.title) + '|' + norm(h?.dates); if (norm(h?.title) && !history.has(k)) history.set(k, { ...h, seen_on: r.id }); }
    for (const t of p.other_open_jobs ?? []) { const k = norm(t); if (k && !open.has(k)) open.set(k, { title: String(t), seen: r.created_at }); }
  }
  return { ...c, about, about_from: aboutFrom, history: [...history.values()], open_jobs: [...open.values()] };
}

/** A job taken out of its client by hand: it gets a profile of its own, and the matching leaves it there. */
export async function separateJob(screeningId: number): Promise<number> {
  const s = (await query<any>('SELECT id, posting_json FROM screenings WHERE id=?', [screeningId]))[0];
  let p: any = null; try { p = s?.posting_json ? JSON.parse(s.posting_json) : null; } catch { p = null; }
  const cp = clientPost(null, p);
  const id = Number((await exec('INSERT INTO clients (country, member_since, company, contact_name) VALUES (?,?,?,?)', [cp?.country || null, cp?.memberSince || null, cp?.company || null, cp?.contact || null])).insertId);
  await exec('UPDATE screenings SET client_id=?, client_manual=1, client_match_json=NULL, client_checked_at=NOW() WHERE id=?', [id, screeningId]);
  return id;
}

/** Two profiles that are one client: every job of the first moves to the second, which keeps its own name and notes (the first's notes are added). */
export async function mergeClients(fromId: number, intoId: number) {
  const from = (await query<any>('SELECT name, notes FROM clients WHERE id=?', [fromId]))[0];
  await exec('UPDATE screenings SET client_id=?, client_manual=1 WHERE client_id=?', [intoId, fromId]);
  await exec(`UPDATE clients SET name=COALESCE(name, ?), notes=IF(? IS NULL OR ? = '', notes, CONCAT_WS('\n\n', notes, ?)) WHERE id=?`, [from?.name ?? null, from?.notes ?? null, from?.notes ?? null, from?.notes ?? null, intoId]);
  await exec('UPDATE clients SET merged_into=? WHERE id=?', [intoId, fromId]);
}

/**
 * R111 (Hamza): every client worked out again with the current rules, so a grouping made by a looser rule is undone. Jobs a person
 * placed by hand stay where they are. A group keeps the profile most of its jobs had (with its name and notes); a job that no longer
 * matches anyone gets a profile of its own. Returns how many jobs changed client.
 */
export async function regroupAll(): Promise<number> {
  const rows = await query<any>('SELECT id, title, posting_json, client_id, upwork_job_id FROM screenings WHERE discarded_at IS NULL AND posting_json IS NOT NULL AND client_manual=0 ORDER BY id');
  const posts = rows.map((r) => { let p: any = null; try { p = JSON.parse(r.posting_json); } catch { p = null; } return { id: r.id as number, old: (r.client_id ?? null) as number | null, cp: clientPost(r.title, p, r.upwork_job_id) }; }).filter((x) => x.cp);
  // the groups: jobs joined by any reason, directly or through another job
  const parent = new Map<number, number>(posts.map((x) => [x.id, x.id]));
  const find = (x: number): number => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  const reasons = new Map<number, ClientMatch[]>();
  for (let i = 0; i < posts.length; i++) for (let j = 0; j < i; j++) {
    const why = sameClient(posts[i].cp!, posts[j].cp!); // i is the newer job
    if (!why.length) continue;
    parent.set(find(posts[i].id), find(posts[j].id));
    for (const [me, other] of [[posts[i].id, posts[j].id], [posts[j].id, posts[i].id]]) { const l = reasons.get(me) ?? []; l.push({ job_id: other, why }); reasons.set(me, l); }
  }
  const groups = new Map<number, typeof posts>();
  for (const x of posts) { const g = groups.get(find(x.id)) ?? []; g.push(x); groups.set(find(x.id), g); }
  // a profile goes to the group that holds most of its jobs; the biggest groups choose first
  const taken = new Set<number>(); let changed = 0;
  for (const g of [...groups.values()].sort((x, y) => y.length - x.length)) {
    const count = new Map<number, number>(); for (const x of g) if (x.old && !taken.has(x.old)) count.set(x.old, (count.get(x.old) ?? 0) + 1);
    let id = [...count.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0] ?? null;
    if (!id) { const c = g[0].cp!; id = Number((await exec('INSERT INTO clients (country, member_since, company, contact_name) VALUES (?,?,?,?)', [c.country || null, c.memberSince || null, c.company || null, c.contact || null])).insertId); }
    taken.add(id);
    for (const x of g) {
      if (x.old !== id) changed++;
      const why = reasons.get(x.id) ?? [];
      await exec('UPDATE screenings SET client_id=?, client_match_json=?, client_checked_at=NOW() WHERE id=?', [id, why.length ? JSON.stringify(why) : null, x.id]);
    }
  }
  return changed;
}
