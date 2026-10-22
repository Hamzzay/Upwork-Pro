/**
 * Everything else Upwork Pro keeps about a job, for Claude's deep analysis (R114): what the gate wrote, the project shortlist with
 * the AI's reasons, the proposal types ranked, the chats with the AI (proposal and opening), the AI's work per step, every hand change
 * with old and new values, and every review. Shared by analyze_jobs (`include`) and get_proposal_record.
 */
import { query } from './db';

export const DEEP_INCLUDES = ['gate', 'shortlist', 'types', 'chats', 'ai', 'changes', 'reviews'] as const;
export type DeepKey = typeof DEEP_INCLUDES[number];
type When = (v: any) => string | null;
const group = (rows: any[]) => { const m = new Map<number, any[]>(); for (const r of rows) (m.get(r.screening_id) ?? m.set(r.screening_id, []).get(r.screening_id)!).push(r); return m; };
const parse = (s: any) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

/** Small facts for every row: why it was skipped, what the job needs, its core work, the type suggested, the version sent, the AI's work. */
export async function cheapFacts(ids: number[]) {
  const out = new Map<number, { skip: string | null; job_needs: string | null; core_work: string | null; suggested_type: string | null; sent_version: number | null; ai_calls: number; ai_seconds: number }>();
  if (!ids.length) return out;
  const s = await query<any>(`SELECT s.id, s.skip_reason, s.skip_note, s.job_needs, p.template_ranking, p.sent_version_no FROM screenings s LEFT JOIN proposals p ON p.screening_id=s.id WHERE s.id IN (?)`, [ids]);
  const core = group(await query<any>('SELECT screening_id, tag_name FROM job_tags WHERE core_rank IS NOT NULL AND screening_id IN (?) ORDER BY core_rank', [ids]));
  const ai = new Map((await query<any>('SELECT screening_id, COUNT(*) AS n, SUM(ms) AS ms FROM llm_calls WHERE screening_id IN (?) GROUP BY screening_id', [ids])).map((r) => [r.screening_id, r]));
  for (const r of s) {
    const rk = parse(r.template_ranking), first = rk?.items?.find((x: any) => x.qualified) ?? rk?.items?.[0];
    out.set(r.id, {
      skip: [r.skip_reason, r.skip_note].filter(Boolean).join('. ') || null, job_needs: r.job_needs ?? null,
      core_work: (core.get(r.id) ?? []).map((x) => x.tag_name).join('; ') || null,
      suggested_type: first ? first.name + (rk?.defaulted ? ' (default: nothing matched)' : '') : null,
      sent_version: r.sent_version_no == null ? null : Number(r.sent_version_no),
      ai_calls: Number(ai.get(r.id)?.n ?? 0), ai_seconds: Math.round(Number(ai.get(r.id)?.ms ?? 0) / 1000),
    });
  }
  return out;
}

/** The heavier details, each only when asked for, as structured values per job (the caller turns them into text or keeps them). */
export async function deepDetails(ids: number[], keys: Set<string>, when: When) {
  const out = new Map<number, Partial<Record<DeepKey, any>>>();
  for (const id of ids) out.set(id, {});
  if (!ids.length) return out;
  const set = (id: number, k: DeepKey, v: any) => { out.get(id)![k] = v; };
  const pid = new Map((await query<any>('SELECT id, screening_id FROM proposals WHERE screening_id IN (?)', [ids])).map((r) => [r.id, r.screening_id]));
  const pids = [...pid.keys()];
  if (keys.has('gate')) for (const r of await query<any>('SELECT id, report_json FROM screenings WHERE id IN (?)', [ids])) {
    const j = parse(r.report_json); const job = j?.job ?? j?.jobs?.[0] ?? null;
    set(r.id, 'gate', job ? { fit: job.fit ?? null, proposal_notes: job.proposal_notes ?? [], override_note: job.override_note || null } : null);
  }
  if (keys.has('shortlist')) for (const [id, rows] of group(await query<any>(`SELECT screening_id, rank_no, project_name, score, max_score, recommended, selected, ai_fits, ai_reason, pool, extra, alternative, named_in_screening
      FROM job_matches WHERE screening_id IN (?) ORDER BY rank_no`, [ids]))) {
    set(id, 'shortlist', rows.map((m) => ({ rank: m.rank_no, project: m.project_name, picked: !!m.selected, recommended: !!m.recommended, fits: m.ai_fits == null ? null : !!m.ai_fits,
      reason: m.ai_reason ?? null, score: m.score, of: m.max_score, industry_pool: m.pool, shown: !m.extra, alternative: !!m.alternative })));
  }
  if (keys.has('types') && pids.length) for (const r of await query<any>('SELECT id, template_name, template_choice, template_ranking FROM proposals WHERE id IN (?)', [pids])) {
    const rk = parse(r.template_ranking);
    set(pid.get(r.id)!, 'types', { chosen: r.template_name, chosen_how: r.template_choice, defaulted: !!rk?.defaulted,
      ranking: (rk?.items ?? []).map((x: any) => ({ rank: x.rank, type: x.name, qualified: !!x.qualified, score: x.score, because: (x.matched ?? []).map((m: any) => m.label), ruled_out_by: (x.excluded_by ?? []).map((m: any) => m.label ?? m) })) });
  }
  if (keys.has('chats') && pids.length) {
    const pc = await query<any>(`SELECT m.proposal_id, m.role, m.content, m.status, m.based_on_version, m.result_version, m.created_at, u.name AS who FROM proposal_messages m LEFT JOIN users u ON u.id=m.user_id
      WHERE m.proposal_id IN (?) ORDER BY m.id`, [pids]);
    const oc = await query<any>(`SELECT m.proposal_id, m.opening_index, m.role, m.content, m.draft, m.status, m.created_at, u.name AS who FROM opening_messages m LEFT JOIN users u ON u.id=m.user_id
      WHERE m.proposal_id IN (?) ORDER BY m.id`, [pids]);
    for (const p of pids) set(pid.get(p)!, 'chats', {
      proposal: pc.filter((m) => m.proposal_id === p).map((m) => ({ at: when(m.created_at), from: m.role === 'user' ? (m.who || 'person') : 'AI', text: m.content, on_version: m.based_on_version, made_version: m.result_version, status: m.status })),
      opening: oc.filter((m) => m.proposal_id === p).map((m) => ({ at: when(m.created_at), opening: m.opening_index == null ? null : Number(m.opening_index) + 1, from: m.role === 'user' ? (m.who || 'person') : 'AI', text: m.content, draft: m.draft || null, status: m.status })),
    });
  }
  if (keys.has('ai')) for (const [id, rows] of group(await query<any>(`SELECT screening_id, kind, step, model, COUNT(*) AS calls, SUM(ok=0) AS failed, ROUND(SUM(ms)/1000) AS seconds
      FROM llm_calls WHERE screening_id IN (?) GROUP BY screening_id, kind, step, model ORDER BY MIN(id)`, [ids]))) {
    set(id, 'ai', rows.map((r) => ({ step: r.step || r.kind, model: r.model, calls: Number(r.calls), failed: Number(r.failed), seconds: Number(r.seconds) })));
  }
  if (keys.has('changes')) for (const [id, rows] of group(await query<any>(`SELECT f.screening_id, f.field, f.old_value, f.new_value, f.source, f.created_at, u.name AS who FROM field_changes f
      LEFT JOIN users u ON u.id=f.user_id WHERE f.screening_id IN (?) ORDER BY f.id`, [ids]))) {
    set(id, 'changes', rows.map((r) => ({ at: when(r.created_at), field: r.field, from: r.old_value, to: r.new_value, by: r.who, how: r.source })));
  }
  if (keys.has('reviews') && pids.length) for (const r of await query<any>('SELECT proposal_id, version_no, reviewer_version, score, review_json, created_at FROM proposal_reviews WHERE proposal_id IN (?) ORDER BY id', [pids])) {
    const v = parse(r.review_json) ?? {}; const id = pid.get(r.proposal_id)!;
    const list = out.get(id)!.reviews ?? []; list.push({ at: when(r.created_at), of_version: r.version_no, reviewer_version: r.reviewer_version, score: r.score == null ? null : Number(r.score), verdict: v.verdict ?? null,
      strengths: v.strengths ?? [], problems: v.problems ?? [], suggestions: (v.suggestions ?? []).map((x: any) => x.title ?? x),
      criteria: v.criteria_scores ?? null, weighted: v.weighted ?? null, parts: v.parts ?? null, capped_by: v.capped_by ?? null, reviewer_said: v.ai_score ?? null });
    set(id, 'reviews', list);
  }
  return out;
}

/** One detail as short text for a cell of analyze_jobs. */
export function deepText(k: DeepKey, v: any): string | null {
  if (v == null || (Array.isArray(v) && !v.length)) return null;
  switch (k) {
    case 'gate': return [v.fit ? 'Fit: ' + v.fit : null, v.proposal_notes?.length ? 'Notes: ' + v.proposal_notes.join(' / ') : null, v.override_note ? 'Override note: ' + v.override_note : null].filter(Boolean).join(' | ') || null;
    case 'shortlist': return v.map((x: any) => `${x.rank}. ${x.project}${x.picked ? ' [picked]' : ''}${x.recommended ? ' [recommended]' : ''}${x.fits === false ? ' [weak fit]' : ''}${!x.shown ? ' [in more]' : ''} ${x.score}/${x.of}${x.reason ? ': ' + x.reason : ''}`).join(' || ');
    case 'types': return `Chosen: ${v.chosen ?? '-'} (${v.chosen_how ?? '-'})${v.defaulted ? ', default' : ''}. Ranked: ` + v.ranking.map((x: any) => `${x.rank}. ${x.type}${x.qualified ? '' : ' (does not qualify)'}${x.because.length ? ' because ' + x.because.join(', ') : ''}${x.ruled_out_by.length ? ' ruled out by ' + x.ruled_out_by.join(', ') : ''}`).join('; ');
    case 'chats': { const a = v.proposal.map((m: any) => `${m.from}${m.made_version ? ' (made v' + m.made_version + ')' : ''}: ${m.text}`); const b = v.opening.map((m: any) => `Opening ${m.opening ?? ''} ${m.from}: ${m.text}`);
      return [a.length ? 'Proposal chat: ' + a.join(' / ') : null, b.length ? 'Opening chat: ' + b.join(' / ') : null].filter(Boolean).join(' || ') || null; }
    case 'ai': return v.map((x: any) => `${x.step}: ${x.calls} call${x.calls === 1 ? '' : 's'}, ${x.seconds} s${x.failed ? ', ' + x.failed + ' failed' : ''} (${x.model})`).join('; ');
    case 'changes': return v.map((x: any) => `${x.at} ${x.field}: ${x.from ?? 'empty'} -> ${x.to ?? 'empty'}${x.by ? ' by ' + x.by : ''}`).join('; ');
    case 'reviews': return v.map((x: any) => `v${x.of_version ?? '?'}: ${x.score ?? '-'}/10 ${x.verdict ?? ''}`).join(' || ');
  }
  return null;
}
