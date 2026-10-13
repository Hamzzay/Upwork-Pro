/**
 * Project matching, as described in the "How matching works" sheet:
 * - every tag carries a weight (its category's weight; "AI powered" is 0)
 * - a project scores the sum of the weights of the tags it shares with the job
 * - if the job needs a tag from a compliance category, projects missing it are pushed below projects that have it
 * - the top N are shown and the best few recommended; N, the recommended count and the minimum score are admin settings
 * Pure functions: no database, no model.
 */
export interface MatchOptions { shown: number; recommended: number; minScore: number; related?: Map<string, string[]>; named?: string[]; more?: number }
export const DEFAULT_MATCH: MatchOptions = { shown: 5, recommended: 2, minScore: 1 };

export type Platform = 'web' | 'mobile' | 'desktop';
export interface JobTag { id: number; name: string; category: string; weight: number; compliance?: boolean; core?: number | null }
export interface LibProject { id: number; name: string; tagIds: Set<number>; industries?: string[]; platforms?: Set<Platform> }
export type Pool = 'same' | 'related' | 'other' | 'none';
export interface Match {
  project_id: number; project_name: string; rank: number; score: number; max_score: number;
  compliance_gap: number; recommended: boolean; shared: JobTag[]; pool: Pool; alternative: boolean; platform: string;
  proves_work: boolean; named_in_screening: boolean; extra: boolean; fits_platform: boolean;
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

/** When the tagger named no core work (older jobs): the work tags of these categories, minus the broad ones, stand in for it. */
export const CORE_CATEGORIES = ['Workflow type', 'AI capability', 'Automation'];
const BROAD = new Set(['workflow automation', 'ai automation', 'ai powered']);
/** The job's core work, main work first. */
export function coreWork(tags: JobTag[]): JobTag[] {
  const named = tags.filter((t) => t.core && t.category !== 'Industry').sort((a, b) => a.core! - b.core!);
  return named.length ? named : tags.filter((t) => CORE_CATEGORIES.includes(t.category) && t.weight > 0 && !BROAD.has(t.name.toLowerCase()));
}
export const MORE_PROJECTS = 10; // kept behind "Show 10 more projects"

/**
 * The shortlist, one rule for the app and the plugin (agreed with Hamza on 13 October):
 * 1. platform: a project that does not run on what the job builds is left out (a mobile app never proves a web build). A project with no
 *    platform known is kept. Backend jobs and jobs that state no platform are not filtered.
 * 2. the work first: the tagger names the job's core work, one to three tags, the main work first. A project proves the job only
 *    if it shares one of them, and only those are recommended. Projects that did the main work come first.
 * 3. then industry: the job has at most one industry (the client's business). Same industry first, then related, then the rest.
 *    Industry tags are not part of the score.
 * 4. then how much of the core work a project shares, then the tags: the sum of the weights of the other tags a project shares with the job ("AI powered" is 0). A project missing a
 *    compliance tag the job needs goes below those that have it.
 * The top N are shown and the first few recommended; the next MORE_PROJECTS are kept for "Show more". A project from another industry
 * scoring at least 1.5 times the best same-industry project is added as an "alternative from another industry" (never recommended).
 * Projects named in screening (`named`) are always in the list, marked, so screening and this step never disagree.
 */
export function rankProjects(jobTags: JobTag[], projects: LibProject[], o: MatchOptions = DEFAULT_MATCH): Match[] {
  const unique = [...new Map(jobTags.map((t) => [t.id, t])).values()];
  const industries = unique.filter((t) => t.category === 'Industry').map((t) => t.name.toLowerCase());
  const scored = unique.filter((t) => t.category !== 'Industry');
  const max = scored.reduce((n, t) => n + t.weight, 0);
  const compliance = scored.filter((t) => t.compliance);
  const core = coreWork(scored);
  const main = core[0];
  const platform = jobPlatform(unique);
  const related = new Set(industries.flatMap((i) => (o.related?.get(i) ?? []).map((x) => x.toLowerCase())).filter((x) => !industries.includes(x)));
  const named = new Set((o.named ?? []).map((x) => x.toLowerCase()));
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
  const all = projects.map((p) => {
    const shared = scored.filter((t) => p.tagIds.has(t.id));
    return { p, shared, score: shared.reduce((n, t) => n + t.weight, 0), gap: compliance.filter((t) => !p.tagIds.has(t.id)).length, pool: poolOf(p),
      proves: !core.length || core.some((t) => p.tagIds.has(t.id)), main: !main || p.tagIds.has(main.id), coreHits: core.filter((t) => p.tagIds.has(t.id)).length,
      fits: fits(p), named: named.has(p.name.toLowerCase()) };
  });
  const rows = all.filter((r) => r.fits && r.score > 0 && r.score >= o.minScore); // a project that shares nothing of value is noise
  rows.sort((a, b) => Number(b.proves) - Number(a.proves) || Number(b.main) - Number(a.main) || order[a.pool] - order[b.pool] || b.coreHits - a.coreHits || a.gap - b.gap || b.score - a.score || b.shared.length - a.shared.length || a.p.name.localeCompare(b.p.name));
  const top = rows.slice(0, o.shown);
  const bestSame = Math.max(0, ...rows.filter((r) => r.pool === 'same' && r.proves).map((r) => r.score));
  // only when the list shown leans on the job's industry: otherwise every project shown is already from another industry
  const alt = industries.length && top.some((r) => r.pool === 'same') ? rows.filter((r) => r.pool !== 'same' && r.proves && !top.includes(r) && r.score >= 1.5 * bestSame).sort((a, b) => b.score - a.score)[0] : undefined;
  const more = rows.filter((r) => !top.includes(r) && r !== alt).slice(0, o.more ?? 0);
  const missingNamed = all.filter((r) => r.named && !top.includes(r) && r !== alt && !more.includes(r)); // shown even below the cut
  const show = (r: typeof all[number]) => [...(r.p.platforms ?? [])].join(' and ') || 'not known';
  let rec = 0;
  const out = top.map((r) => ({ r, alternative: false, extra: false, recommended: r.proves && rec++ < o.recommended }));
  if (alt) out.push({ r: alt, alternative: true, extra: false, recommended: false });
  for (const r of missingNamed) out.push({ r, alternative: false, extra: false, recommended: false });
  for (const r of more) out.push({ r, alternative: false, extra: true, recommended: false });
  return out.map(({ r, alternative, extra, recommended }, i) => ({
    project_id: r.p.id, project_name: r.p.name, rank: i + 1, score: r.score, max_score: max, compliance_gap: r.gap, recommended,
    shared: [...r.shared].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)), pool: r.pool, alternative, platform: show(r),
    proves_work: r.proves, named_in_screening: r.named, extra, fits_platform: r.fits,
  }));
}

/** One line on what the job needs, from its tags: "Web · SaaS platform, Admin dashboard · Appointment booking / scheduling · Healthcare". */
export function jobNeeds(tags: JobTag[]): string {
  const pick = (c: string, n = 3) => tags.filter((t) => t.category === c).sort((a, b) => b.weight - a.weight).slice(0, n).map((t) => t.name).join(', ');
  const pl = jobPlatform(tags);
  const core = tags.some((t) => t.core) ? coreWork(tags).map((t) => t.name).join(', ') : pick('Workflow type', 2) || pick('AI capability', 2);
  return [pl === 'not stated' ? '' : pl[0].toUpperCase() + pl.slice(1), pick('Product type', 2), core, pick('Industry', 1)].filter(Boolean).join(' · ');
}

export interface LoomVideo { id: number; title: string; url: string; topic?: string | null; tags: string[]; sort_order?: number }
/**
 * The Loom video that fits a job best: the one whose tags share the most weight with the job's tags (industry counts here: a dental
 * walkthrough suits a dental job). Ties go to more shared tags, then the video's order, then the title. Null when none shares anything.
 */
export function pickLoom(jobTags: { name: string; weight: number }[], videos: LoomVideo[]): { video: LoomVideo; score: number; shared: string[] } | null {
  const w = new Map(jobTags.map((t) => [t.name.toLowerCase(), Number(t.weight)]));
  const rows = videos.map((v) => {
    const shared = [...new Set(v.tags)].filter((t) => w.has(t.toLowerCase()));
    return { video: v, shared, score: shared.reduce((n, t) => n + (w.get(t.toLowerCase()) ?? 0), 0) };
  }).filter((r) => r.shared.length && r.score > 0);
  rows.sort((a, b) => b.score - a.score || b.shared.length - a.shared.length || (a.video.sort_order ?? 0) - (b.video.sort_order ?? 0) || a.video.title.localeCompare(b.video.title));
  return rows[0] ?? null;
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
