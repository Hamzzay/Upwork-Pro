/**
 * Project matching, as described in the "How matching works" sheet:
 * - every tag carries a weight (its category's weight; "AI powered" is 0)
 * - a project scores the sum of the weights of the tags it shares with the job
 * - if the job needs a tag from a compliance category, projects missing it are pushed below projects that have it
 * - the top N are shown and the best few recommended; N, the recommended count and the minimum score are admin settings
 * Pure functions: no database, no model.
 */
export interface MatchOptions { shown: number; recommended: number; minScore: number; related?: Map<string, string[]> }
export const DEFAULT_MATCH: MatchOptions = { shown: 5, recommended: 2, minScore: 1 };

export type Platform = 'web' | 'mobile' | 'desktop';
export interface JobTag { id: number; name: string; category: string; weight: number; compliance?: boolean }
export interface LibProject { id: number; name: string; tagIds: Set<number>; industries?: string[]; platforms?: Set<Platform> }
export type Pool = 'same' | 'related' | 'other' | 'none';
export interface Match {
  project_id: number; project_name: string; rank: number; score: number; max_score: number;
  compliance_gap: number; recommended: boolean; shared: JobTag[]; pool: Pool; alternative: boolean; platform: string;
}

const WEB = ['web app', 'saas platform', 'website / landing page', 'admin dashboard', 'marketplace', 'chrome extension', 'internal tool'];
/** What the job runs on, from its product type tags: web, mobile, both, backend or API only, desktop, or not stated. */
export function jobPlatform(tags: { name: string }[]): 'web' | 'mobile' | 'web and mobile' | 'backend' | 'desktop' | 'not stated' {
  const n = new Set(tags.map((t) => t.name.toLowerCase()));
  const web = WEB.some((x) => n.has(x)), mobile = n.has('mobile app');
  if (web && mobile) return 'web and mobile';
  if (mobile) return 'mobile';
  if (web) return 'web';
  if (n.has('desktop app')) return 'desktop';
  if (n.has('api / backend service')) return 'backend';
  return 'not stated';
}
/** What a project runs on, from its links and tags. */
export function projectPlatforms(p: { landing_link?: string | null; system_link?: string | null; mobile_link?: string | null }, tagNames: string[]): Set<Platform> {
  const n = new Set(tagNames.map((t) => t.toLowerCase())), out = new Set<Platform>();
  if (p.landing_link || p.system_link || WEB.some((x) => n.has(x))) out.add('web');
  if (p.mobile_link || n.has('mobile app')) out.add('mobile');
  if (n.has('desktop app')) out.add('desktop');
  return out;
}

/**
 * The shortlist, as the team's project matcher does it:
 * 1. platform: a project that does not run on what the job builds is left out (a mobile app never proves a web build). A project with no
 *    platform known is kept. Backend jobs and jobs that state no platform are not filtered.
 * 2. industry: when the job has industry tags, projects in the same industry come first, then related industries, then the rest.
 *    Industry tags are not part of the score.
 * 3. tags: the sum of the weights of the other tags a project shares with the job ("AI powered" is 0). A project missing a compliance tag
 *    the job needs goes below those that have it, within its pool.
 * The top N are shown and the first few recommended. Below them, a project from another industry whose score is at least 1.5 times the
 * best same-industry score is added as an "alternative from another industry" (shown, never recommended).
 */
export function rankProjects(jobTags: JobTag[], projects: LibProject[], o: MatchOptions = DEFAULT_MATCH): Match[] {
  const unique = [...new Map(jobTags.map((t) => [t.id, t])).values()];
  const industries = unique.filter((t) => t.category === 'Industry').map((t) => t.name.toLowerCase());
  const scored = unique.filter((t) => t.category !== 'Industry');
  const max = scored.reduce((n, t) => n + t.weight, 0);
  const compliance = scored.filter((t) => t.compliance);
  const platform = jobPlatform(unique);
  const related = new Set(industries.flatMap((i) => (o.related?.get(i) ?? []).map((x) => x.toLowerCase())).filter((x) => !industries.includes(x)));
  const fits = (p: LibProject) => {
    const pl = p.platforms; if (!pl || !pl.size) return true;
    if (platform === 'web') return pl.has('web');
    if (platform === 'mobile') return pl.has('mobile');
    if (platform === 'desktop') return pl.has('desktop') || pl.has('web');
    return true;
  };
  const poolOf = (p: LibProject): Pool => {
    if (!industries.length) return 'none';
    const mine = (p.industries ?? []).map((x) => x.toLowerCase());
    return mine.some((x) => industries.includes(x)) ? 'same' : mine.some((x) => related.has(x)) ? 'related' : 'other';
  };
  const order: Record<Pool, number> = { same: 0, related: 1, other: 2, none: 0 };
  const rows = projects.filter(fits).map((p) => {
    const shared = scored.filter((t) => p.tagIds.has(t.id));
    return { p, shared, score: shared.reduce((n, t) => n + t.weight, 0), gap: compliance.filter((t) => !p.tagIds.has(t.id)).length, pool: poolOf(p) };
  }).filter((r) => r.score > 0 && r.score >= o.minScore); // a project that shares nothing of value is noise
  rows.sort((a, b) => order[a.pool] - order[b.pool] || a.gap - b.gap || b.score - a.score || b.shared.length - a.shared.length || a.p.name.localeCompare(b.p.name));
  const top = rows.slice(0, o.shown);
  const bestSame = Math.max(0, ...rows.filter((r) => r.pool === 'same').map((r) => r.score));
  // only when the list shown leans on the job's industry: otherwise every project shown is already from another industry
  const alt = industries.length && top.some((r) => r.pool === 'same') ? rows.filter((r) => r.pool !== 'same' && !top.includes(r) && r.score >= 1.5 * bestSame).sort((a, b) => b.score - a.score)[0] : undefined;
  const show = (r: typeof rows[number]) => [...(r.p.platforms ?? [])].join(' and ') || 'not known';
  const out = top.map((r, i) => ({ r, alternative: false, recommended: i < o.recommended }));
  if (alt) out.push({ r: alt, alternative: true, recommended: false });
  return out.map(({ r, alternative, recommended }, i) => ({
    project_id: r.p.id, project_name: r.p.name, rank: i + 1, score: r.score, max_score: max, compliance_gap: r.gap, recommended,
    shared: r.shared.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)), pool: r.pool, alternative, platform: show(r),
  }));
}

/** One line on what the job needs, from its tags: "Web · SaaS platform, Admin dashboard · Appointment booking / scheduling · Healthcare". */
export function jobNeeds(tags: JobTag[]): string {
  const pick = (c: string, n = 3) => tags.filter((t) => t.category === c).sort((a, b) => b.weight - a.weight).slice(0, n).map((t) => t.name).join(', ');
  const pl = jobPlatform(tags);
  return [pl === 'not stated' ? '' : pl[0].toUpperCase() + pl.slice(1), pick('Product type', 2), pick('Workflow type', 2) || pick('AI capability', 2), pick('Industry', 2)].filter(Boolean).join(' · ');
}

/** The selection rule: between `min` and `max` distinct projects (admin settings), all taken from the matches shown. */
export function validSelection(projectIds: number[], matches: { project_id: number | null }[], min = 2, max = 2): string | null {
  const ids = new Set(projectIds);
  if (ids.size !== projectIds.length) return 'Each project can be chosen once';
  if (ids.size < min || ids.size > max) return min === max ? `Select exactly ${min} project${min === 1 ? '' : 's'}` : `Select ${min} to ${max} projects`;
  const allowed = new Set(matches.map((m) => m.project_id));
  if (![...ids].every((i) => allowed.has(i))) return 'You can only choose from the projects shown';
  return null;
}
