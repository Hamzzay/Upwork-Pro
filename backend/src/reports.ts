/**
 * Reports: the same jobs counted along every dimension we record (profile, person, proposal type, project, industry, tag,
 * signal, rule, verdict, source, Loom video, week and more), each with the funnel from screened to hired.
 * Pure: the route in routes.ts loads the rows, this file only counts, so the numbers can be tested without a database.
 */

/** One job, as the reports read it. Flags are 0/1 (or booleans). */
export interface ReportJob {
  id: number; user_id: number; user_name: string | null; profile_id: number | null; profile_name: string | null;
  source: string | null; verdict: string | null; rule_codes: string | null; overridden: any; override_verdict: string | null;
  continued: any; written: any; template_name: string | null; template_choice: string | null;
  sent: any; sent_at: string | null; viewed: any; chat: any; interview: any; outcome: string | null; outcome_reason: string | null; outcome_at: string | null;
  viewed_at: string | null; chat_at: string | null;
  connects_spent: number | null; boost_connects: number | null; created_at: string;
  client_country: string | null; job_type: string | null; experience_level: string | null;
  loom_video_id: number | null; loom_video_title: string | null; secs_to_proposal: number | null; words: number | null;
}
export interface ReportExtras {
  tags: { screening_id: number; tag_name: string; category_name: string }[];
  projects: { screening_id: number; project_name: string }[];
  signals: { screening_id: number; signal_number: number; signal_name: string; value_name: string; is_fallback: any }[];
}
/** The funnel for one group of jobs. Rates are worked out on screen, from these counts. */
export interface ReportRow {
  key: string; name: string; jobs: number; continued: number; written: number; sent: number; viewed: number; chat: number; interview: number; hired: number; lost: number;
  connects: number; /** Query for the Jobs list that shows the jobs behind this row (null when the list cannot filter by it). */ link: Record<string, string> | null;
}
export interface ReportDim { key: string; label: string; help: string; /** 'sent' when the dimension only means something for sent proposals. */ basis: 'jobs' | 'sent'; rows: ReportRow[] }

const on = (v: any) => v === true || Number(v) === 1;
const day = (s: string | null) => (s ? new Date(String(s).replace(' ', 'T')) : null);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SOURCE: Record<string, string> = { claude_plugin: 'Claude plugin', app: 'Upwork Pro' };
const VERDICT: Record<string, string> = { PASS: 'Pass', FLAG: 'Flag', FAIL: 'Fail' };

class Counter {
  private rows = new Map<string, ReportRow>();
  constructor(private loss: string[]) {}
  add(key: string | number | null | undefined, name: string | null | undefined, j: ReportJob, link: Record<string, string> | null = null) {
    if (key === null || key === undefined || key === '' || !name) return;
    const k = String(key);
    let r = this.rows.get(k);
    if (!r) { r = { key: k, name, jobs: 0, continued: 0, written: 0, sent: 0, viewed: 0, chat: 0, interview: 0, hired: 0, lost: 0, connects: 0, link }; this.rows.set(k, r); }
    r.jobs++;
    if (on(j.continued)) r.continued++;
    if (on(j.written)) r.written++;
    if (on(j.sent)) {
      r.sent++;
      if (on(j.viewed)) r.viewed++;
      if (on(j.chat)) r.chat++;
      if (on(j.interview)) r.interview++;
      if (j.outcome === 'Hired') r.hired++;
      if (j.outcome && this.loss.includes(j.outcome)) r.lost++;
      r.connects += Number(j.connects_spent || 0) + Number(j.boost_connects || 0);
    }
  }
  list(limit = 60, order: 'volume' | 'key' = 'volume') {
    const all = [...this.rows.values()];
    if (order === 'key') return all.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
    return all.sort((a, b) => b.sent - a.sent || b.jobs - a.jobs || a.name.localeCompare(b.name)).slice(0, limit);
  }
}

/** Monday of the week a date falls in, as YYYY-MM-DD. */
export function weekStart(d: Date): string { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); }
const bucket = (n: number, steps: [number, string][], rest: string) => { for (const [max, label] of steps) if (n <= max) return label; return rest; };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function buildReport(jobs: ReportJob[], extra: ReportExtras, lossOutcomes: string[]) {
  const C = () => new Counter(lossOutcomes);
  const total = C();
  const d: Record<string, Counter> = {};
  for (const k of ['profile', 'person', 'type', 'type_choice', 'project', 'project_count', 'industry', 'tag', 'signal', 'rule', 'verdict', 'decision', 'source', 'loom', 'loom_video',
    'country', 'job_type', 'experience', 'boost', 'connects', 'length', 'speed', 'week', 'sent_weekday', 'sent_time', 'loss_reason', 'outcome']) d[k] = C();
  const byJob = <T extends { screening_id: number }>(rows: T[]) => { const m = new Map<number, T[]>(); for (const r of rows) { const a = m.get(r.screening_id); if (a) a.push(r); else m.set(r.screening_id, [r]); } return m; };
  const tags = byJob(extra.tags), projects = byJob(extra.projects), signals = byJob(extra.signals);
  const toView: number[] = [], toChat: number[] = [], toClose: number[] = [], toProposal: number[] = [];

  for (const j of jobs) {
    total.add('all', 'All jobs', j);
    d.profile.add(j.profile_id ?? 'none', j.profile_name ?? 'No profile yet', j, j.profile_id ? { profile: String(j.profile_id) } : null);
    d.person.add(j.user_id, j.user_name ?? 'Unknown', j, { user: String(j.user_id) });
    d.source.add(j.source || 'app', SOURCE[j.source || 'app'] ?? j.source, j, { source: j.source || 'app' });
    if (j.verdict) d.verdict.add(j.verdict, VERDICT[j.verdict] ?? j.verdict, j, { v: j.verdict });
    if (on(j.continued)) d.decision.add(on(j.overridden) ? 'over_' + j.override_verdict : 'clean', on(j.overridden) ? `Continued past a ${(VERDICT[j.override_verdict || ''] || 'flag').toLowerCase()}` : 'Continued on a pass', j);
    else if (j.verdict) d.decision.add('stopped', 'Not continued', j);
    for (const code of String(j.rule_codes || '').split(/\s*,\s*/).filter(Boolean)) d.rule.add(code, code, j, { rule: code });
    if (j.template_name) { d.type.add(j.template_name, j.template_name, j, { ptype: j.template_name }); d.type_choice.add(j.template_choice || 'auto', j.template_choice === 'manual' ? 'Type chosen by hand' : 'Type chosen from the signals', j); }
    const ps = projects.get(j.id) ?? [];
    for (const p of ps) d.project.add(p.project_name, p.project_name, j, { project: p.project_name });
    if (ps.length) d.project_count.add(ps.length, ps.length === 1 ? '1 project shown' : `${ps.length} projects shown`, j);
    for (const t of tags.get(j.id) ?? []) {
      if (/^industry$/i.test(t.category_name)) d.industry.add(t.tag_name, t.tag_name, j, { tag: t.tag_name });
      else d.tag.add(t.tag_name, `${t.tag_name} (${t.category_name})`, j, { tag: t.tag_name });
    }
    for (const s of signals.get(j.id) ?? []) if (!on(s.is_fallback)) d.signal.add(`${s.signal_number}|${s.value_name}`, `${s.signal_name}: ${s.value_name}`, j);
    const country = (j.client_country || '').split(',')[0].trim();
    if (country && !/^not (shown|known)$/i.test(country)) d.country.add(country.toLowerCase(), country, j, { q: country });
    if (j.job_type && !/^not shown$/i.test(j.job_type)) d.job_type.add(j.job_type.toLowerCase(), j.job_type[0].toUpperCase() + j.job_type.slice(1), j);
    if (j.experience_level && !/^not shown$/i.test(j.experience_level)) d.experience.add(j.experience_level.toLowerCase(), j.experience_level[0].toUpperCase() + j.experience_level.slice(1), j);
    if (j.secs_to_proposal != null && j.source !== 'claude_plugin') {
      toProposal.push(Number(j.secs_to_proposal));
      d.speed.add(bucket(Number(j.secs_to_proposal), [[300, '1'], [900, '2'], [3600, '3']], '4'), bucket(Number(j.secs_to_proposal), [[300, 'Proposal ready within 5 minutes'], [900, 'Within 15 minutes'], [3600, 'Within an hour']], 'Over an hour'), j);
    }
    if (j.words) d.length.add(bucket(j.words, [[120, '1'], [180, '2'], [240, '3'], [320, '4']], '5'), bucket(j.words, [[120, 'Up to 120 words'], [180, '121 to 180 words'], [240, '181 to 240 words'], [320, '241 to 320 words']], 'Over 320 words'), j);
    const created = day(j.created_at);
    if (created) { const ws = weekStart(created); const end = new Date(ws + 'T00:00:00'); end.setDate(end.getDate() + 6); d.week.add(ws, 'Week of ' + ws, j, { from: ws, to: ymd(end) }); }
    if (on(j.sent)) {
      d.loom.add(j.loom_video_id || j.loom_video_title ? 'yes' : 'no', j.loom_video_id || j.loom_video_title ? 'With a Loom video' : 'No Loom video', j, { loom: j.loom_video_id || j.loom_video_title ? 'yes' : 'no' });
      if (j.loom_video_title) d.loom_video.add(j.loom_video_title, j.loom_video_title, j);
      d.boost.add(Number(j.boost_connects) > 0 ? 'yes' : 'no', Number(j.boost_connects) > 0 ? 'Boosted' : 'Not boosted', j);
      if (j.connects_spent != null) d.connects.add(bucket(Number(j.connects_spent), [[8, '1'], [16, '2'], [24, '3']], '4'), bucket(Number(j.connects_spent), [[8, 'Up to 8 Connects'], [16, '9 to 16 Connects'], [24, '17 to 24 Connects']], '25 or more Connects'), j);
      const sent = day(j.sent_at);
      if (sent) {
        d.sent_weekday.add(String((sent.getDay() + 6) % 7), WEEKDAYS[sent.getDay()], j);
        // a sent date without a time (midnight) says nothing about the time of day
        if (sent.getHours() || sent.getMinutes()) { const hr = sent.getHours(); d.sent_time.add(hr < 6 ? '4' : hr < 12 ? '1' : hr < 18 ? '2' : '3', hr < 6 ? 'Night (before 6:00)' : hr < 12 ? 'Morning (6:00 to 12:00)' : hr < 18 ? 'Afternoon (12:00 to 18:00)' : 'Evening (after 18:00)', j); }
        const v = day(j.viewed_at), c = day(j.chat_at), o = day(j.outcome_at);
        if (v && v >= sent) toView.push((v.getTime() - sent.getTime()) / 3_600_000);
        if (c && c >= sent) toChat.push((c.getTime() - sent.getTime()) / 3_600_000);
        if (o && j.outcome && j.outcome !== 'Pending' && o >= sent) toClose.push((o.getTime() - sent.getTime()) / 86_400_000);
      }
      if (j.outcome && j.outcome !== 'Pending') d.outcome.add(j.outcome, j.outcome, j, { outcome: j.outcome });
      if (j.outcome && lossOutcomes.includes(j.outcome)) d.loss_reason.add(j.outcome_reason || 'none', j.outcome_reason || 'No reason recorded', j);
    }
  }

  const dim = (key: string, label: string, help: string, basis: 'jobs' | 'sent' = 'jobs', order: 'volume' | 'key' = 'volume', limit = 60): ReportDim => ({ key, label, help, basis, rows: d[key].list(limit, order) });
  const dims: ReportDim[] = [
    dim('profile', 'Profile', 'The Upwork profile the proposal is sent from.'),
    dim('person', 'Person', 'Who screened and submitted the job.'),
    dim('type', 'Proposal type', 'The type the proposal was written with.'),
    dim('type_choice', 'How the type was chosen', 'Picked from the signals, or changed by hand.'),
    dim('project', 'Project attached', 'Each project shown in the proposal. A job with two projects counts under both.'),
    dim('project_count', 'Number of projects', 'How many projects the proposal showed.', 'jobs', 'key'),
    dim('industry', 'Industry', 'The job\'s industry tags.'),
    dim('tag', 'Job tag', 'Every other tag the job was given. A job counts under each of its tags.', 'jobs', 'volume', 80),
    dim('signal', 'Signal', 'What the AI read in the post (stated values only, not defaults). A job counts under each.', 'jobs', 'volume', 80),
    dim('rule', 'Rule fired', 'The gate rules that fired. A job counts under each rule.'),
    dim('verdict', 'Gate result', 'Pass, flag or fail at screening.', 'jobs', 'key'),
    dim('decision', 'Decision', 'Whether the job was continued, and past what.'),
    dim('source', 'Written in', 'Upwork Pro itself, or Claude with the plugin.'),
    dim('loom', 'Loom video', 'Sent proposals with a Loom video against those without.', 'sent', 'key'),
    dim('loom_video', 'Which Loom video', 'Each video that went with a proposal.', 'sent'),
    dim('boost', 'Boost', 'Sent proposals that were boosted against those that were not.', 'sent', 'key'),
    dim('connects', 'Connects spent', 'Sent proposals by what they cost.', 'sent', 'key'),
    dim('length', 'Proposal length', 'Words in the finished proposal.', 'jobs', 'key'),
    dim('speed', 'Speed to proposal', 'Time from pasting the job to the proposal being ready (Upwork Pro only).', 'jobs', 'key'),
    dim('sent_weekday', 'Day sent', 'The weekday the proposal was sent.', 'sent', 'key'),
    dim('sent_time', 'Time sent', 'The time of day the proposal was sent (server time). Only proposals with a recorded time.', 'sent', 'key'),
    dim('country', 'Client country', 'Where the client is.'),
    dim('job_type', 'Job type', 'Hourly or fixed price, as the post states it.'),
    dim('experience', 'Experience level', 'The level the client asked for.'),
    dim('outcome', 'Outcome', 'How sent proposals ended.', 'sent'),
    dim('loss_reason', 'Why lost', 'The reason recorded for each lost proposal.', 'sent'),
    dim('week', 'Week', 'By the week the job was screened.', 'jobs', 'key', 104),
  ];
  const round = (v: number | null, digits = 1) => (v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits);
  return {
    jobs: jobs.length,
    totals: total.list()[0] ?? { key: 'all', name: 'All jobs', jobs: 0, continued: 0, written: 0, sent: 0, viewed: 0, chat: 0, interview: 0, hired: 0, lost: 0, connects: 0, link: null },
    dims,
    timing: { hours_to_view: round(avg(toView)), hours_to_chat: round(avg(toChat)), days_to_close: round(avg(toClose)), secs_to_proposal: toProposal.length ? Math.round(avg(toProposal)!) : null },
  };
}

/**
 * Fit as many rows as the character budget allows into one answer (Claude reads about 25k tokens from one tool call), always at
 * least one. Returns the rows that fit and whether more are left, so a bulk read can be taken in pages without ever being cut off.
 */
export function packRows<T>(rows: T[], budget: number): { rows: T[]; more: boolean } {
  const out: T[] = []; let used = 0;
  for (const r of rows) {
    const size = JSON.stringify(r).length + 1;
    if (out.length && used + size > budget) return { rows: out, more: true };
    out.push(r); used += size;
  }
  return { rows: out, more: false };
}
