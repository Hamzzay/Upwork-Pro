import 'dotenv/config';
import { audit, exec, pool, query, withRetry } from './db';
import { config } from './config';
import { LlmCallError, killAllChildren, sweepOldScratch } from './llm/claude-runner';
import { withCallContext } from './llm/context';
import { enableSetupCache } from './cache';
import { providerName } from './llm';
import { lastUsed } from './llm/context';
import { COLUMN_KEYS } from './screening/contract';
import { loadContext, loadDictionary, loadLibraryProjects, loadRelatedIndustries } from './screening/context';
import { coreWork, jobNeeds, MORE_PROJECTS, rankProjects, TECH_STACK, type JobTag } from './screening/matching';
import { applyJudgement, judgeProjects } from './screening/judge';
import { getSettings } from './settings';
import { tagJob } from './screening/tagging';
import { extractPosting } from './screening/posting';
import { detectSignals, queueEarlyDraft, runChat, runEarlyDraft, runGapUpdate, runPartsRefresh, runProposal, runReview } from './proposal/pipeline';
import { runOpenings } from './proposal/openings';
import { docsBlock, runAttachmentRead } from './screening/attachments';
import { sheetValues } from './screening/persist';
import { screenJobText } from './screening/service';
import { getUpworkClient, renderJobText, UpworkError } from './upwork/client';

let stopping = false;
let inFlight = 0;

async function activeSkill() {
  const rows = await query<{ id: number; content: string }>('SELECT id, content FROM skill_versions WHERE is_active=1 LIMIT 1');
  if (!rows.length) throw new Error('no_active_skill');
  return rows[0];
}

function errorInfo(e: unknown): { code: string; message: string } {
  console.error('job failed:', e instanceof Error ? `${e.name}: ${e.message}` : 'unknown error'); // for the server log only; never shown to users
  if (e instanceof UpworkError) return { code: e.code, message: e.message };
  if (e instanceof LlmCallError && (e.status === 401 || e.status === 403)) {
    return { code: 'llm_auth', message: 'The AI service rejected the key. Tell an admin.' };
  }
  if (e instanceof LlmCallError && e.status === 429) {
    return { code: 'llm_rate_limit', message: 'The AI service is busy or out of quota. Try again later.' };
  }
  const m = e instanceof Error ? e.message : '';
  const miss = /^llm_key_missing:(\w+)/.exec(m);
  if (miss) { const k = miss[1] === 'claude' ? 'ANTHROPIC_API_KEY or LLM_OAUTH_TOKEN' : miss[1] === 'openai' ? 'OPENAI_API_KEY' : 'LLM_API_KEY'; return { code: 'llm_config', message: `The AI key is not set on the server. Tell an admin to add ${k} to the .env file and restart the worker, or choose another AI in Settings.` }; }
  if (/LLM_BASE_URL \/ LLM_API_KEY are not set/.test(m)) return { code: 'llm_config', message: 'The AI key is not set on the server. Tell an admin to add LLM_API_KEY to the .env file and restart the worker.' };
  if (m === 'missing_inputs') return { code: 'missing_inputs', message: 'The selected projects or the profile are missing. Confirm them first.' };
  if (m === 'no_template') return { code: 'no_template', message: 'There is no active template. An admin can add one under Templates.' };
  if (m === 'no_version') return { code: 'no_version', message: 'The proposal has no text yet.' };
  if (m === 'no_tags') return { code: 'no_tags', message: 'The model found no matching tags. Try again.' };
  if (m === 'invalid_output') return { code: 'invalid_output', message: 'The AI answer was not in the expected format. Try again.' };
  if (m === 'no_active_skill') return { code: 'no_skill', message: 'No active gate instructions version. Tell an admin.' };
  if (m.startsWith('timeout')) return { code: 'timeout', message: 'The AI call timed out. Try again.' };
  return { code: 'error', message: 'Screening failed. Try again.' }; // never echo model text or stderr
}

async function process_(row: { id: number; input_type: 'link' | 'text'; raw_input: string; upwork_job_id: string | null; job_text: string | null }) {
  try {
    let jobText = row.job_text;
    if (row.input_type === 'link') {
      if (!row.upwork_job_id) throw new UpworkError('unsupported_link', 'Could not read a job id from that link. Paste the job page text instead.');
      const data = await getUpworkClient().fetchJob(row.upwork_job_id);
      jobText = renderJobText(data);
    }
    const skill = await activeSkill();
    const ctx = await loadContext();
    const rep = await screenJobText((jobText ?? row.raw_input) + (await docsBlock(row.id)), skill.content, ctx); // with the client's documents (R74)
    const v = sheetValues(rep, ctx.rules.map((r) => r.code), ctx.projects.map((p) => p.name));
    // PLAN-SPEED point 11 (Ahmad's rule): matching starts by itself only for a PASS, or a FLAG with few flags; else it waits for a person
    const flags = new Set((rep.job?.flags ?? []).map((f: { code: string }) => f.code)).size;
    const autoMatch = v.verdict === 'PASS' || (v.verdict === 'FLAG' && flags <= (await getSettings())['matching.auto_max_flags']);
    await exec(
      // a PASS, or a FLAG with few flags, starts matching now, so the projects are ready; the rest wait until the person continues
      `UPDATE screenings SET status='done', job_text=?, title=?, verdict=?, report_json=?, skill_version_id=?, gate_rules=?, model=?, provider=?, finished_at=NOW(),
         fail_reasons=?, flag_reasons=?, rule_codes=?, ${COLUMN_KEYS.map((k) => `${k}=?`).join(', ')},
         tagging_status=IF(?, COALESCE(tagging_status, 'queued'), tagging_status)
       WHERE id=?`,
      [jobText, v.title, v.verdict, JSON.stringify(rep), skill.id, JSON.stringify(ctx.rules), lastUsed()?.model ?? config.llm.model, lastUsed()?.provider ?? 'mock',
       v.fail_reasons || null, v.flag_reasons || null, v.rule_codes || null, ...COLUMN_KEYS.map((k) => v.columns[k]), autoMatch ? 1 : 0, row.id],
    );
  } catch (e) {
    if (stopping) { await exec(`UPDATE screenings SET status='queued' WHERE id=?`, [row.id]); return; } // killed by a deploy: run again
    const info = errorInfo(e);
    await exec(`UPDATE screenings SET status='error', error_code=?, error_message=?, finished_at=NOW() WHERE id=?`, [info.code, info.message, row.id]);
    await audit(null, 'screening_error', `id=${row.id} code=${info.code}`);
  }
}

/** Step 2: tag the job with the dictionary, score the library projects, and store everything (reasons included).
 *  The proposal's signals depend only on the job text, so they are read at the same time; the proposal reuses them. */
async function processTagging(id: number) {
  try {
    const s = (await query<any>('SELECT job_text, raw_input, sample_match, skip_tech_stack, rematch_only, source FROM screenings WHERE id=?', [id]))[0];
    const fromClaude = s.source === 'claude_plugin'; // Claude reads the signals and writes the proposal itself: only the matching is wanted
    const jobText: string = (s.job_text ?? s.raw_input) + (await docsBlock(id)); // with the client's documents (R74)
    // "Skip tech stack tags" was switched: score the tags this job already has again, without reading it a second time
    const saved = s.rematch_only ? await query<any>(`SELECT jt.tag_id, jt.tag_name, jt.category_name, jt.weight, jt.reason, jt.core_rank, c.is_compliance FROM job_tags jt
      LEFT JOIN tag_categories c ON c.name=jt.category_name WHERE jt.screening_id=? AND jt.tag_id IS NOT NULL`, [id]) : [];
    const rematch = saved.length > 0;
    // not awaited: the projects show as soon as tagging is done, and a proposal started meanwhile waits for these signals
    if (!fromClaude && !(await query<any>('SELECT 1 FROM job_signals WHERE screening_id=? LIMIT 1', [id])).length) {
      detectSignals(id, jobText, () => !stopping).catch((e) => console.error('signals failed, the proposal will read them itself:', (e as Error).message));
    }
    const tagged = rematch
      ? saved.map((r) => ({ tag: { id: r.tag_id, name: r.tag_name, category: r.category_name, weight: Number(r.weight), compliance: !!r.is_compliance }, reason: r.reason, core: r.core_rank ?? null }))
      : await tagJob(jobText, await loadDictionary());
    const jobTags: JobTag[] = tagged.map((x) => ({ id: x.tag.id, name: x.tag.name, category: x.tag.category, weight: x.tag.weight, compliance: !!x.tag.compliance, core: x.core }));
    const cfg = await getSettings();
    const lib = await loadLibraryProjects(); // once per tagging (it was read twice)
    const matches = rankProjects(jobTags, lib, { shown: cfg['matching.shown'], recommended: cfg['matching.recommended'], minScore: cfg['matching.min_score'], related: await loadRelatedIndustries(),
      named: String(s.sample_match ?? '').split(';').map((x) => x.trim()).filter((x) => x && x.toLowerCase() !== 'none'), more: MORE_PROJECTS, skip: s.skip_tech_stack ? [TECH_STACK] : [] });
    // the last step: the AI reads the shortlisted projects' overviews and case studies and orders them for this job, with a reason
    let final: (typeof matches[number] & { ai_reason?: string | null; ai_fits?: boolean | null })[] = matches, order: 'ai' | 'tags' = 'tags';
    if (cfg['matching.ai_order'] && matches.length > 1) {
      try {
        const facts = await query<any>('SELECT id, overview, case_study_summary FROM projects WHERE id IN (?)', [matches.map((m) => m.project_id)]);
        const candidates = matches.map((m) => ({ name: m.project_name, overview: facts.find((f) => f.id === m.project_id)?.overview ?? null, case_study: facts.find((f) => f.id === m.project_id)?.case_study_summary ?? null,
          industries: lib.find((l) => l.id === m.project_id)?.industries ?? [], platform: m.platform, shared: m.shared.map((t) => t.name) }));
        const judged = await judgeProjects(jobText, candidates, coreWork(jobTags.filter((t) => t.category !== 'Industry')).map((t) => t.name), jobTags.find((t) => t.category === 'Industry')?.name ?? null);
        final = applyJudgement(matches, judged, { shown: cfg['matching.shown'], recommended: cfg['matching.recommended'] }); order = 'ai';
      } catch (e) { console.error('matching order by the AI failed, the tag order is kept:', (e as Error).message); }
    }
    await withRetry(async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM job_matches WHERE screening_id=?', [id]); // a retry replaces the old result
      await conn.query('DELETE FROM job_tags WHERE screening_id=?', [id]);
      // one statement each for the tags and the matches (PLAN-SPEED point 8)
      if (tagged.length) await conn.query('INSERT INTO job_tags (screening_id, tag_id, tag_name, category_name, weight, reason, core_rank) VALUES ?',
        [tagged.map((x) => [id, x.tag.id, x.tag.name, x.tag.category, x.tag.weight, x.reason, x.core])]);
      if (final.length) await conn.query(
        `INSERT INTO job_matches (screening_id, project_id, project_name, rank_no, score, max_score, compliance_gap, recommended, shared_tags, pool, alternative, platform, proves_work, named_in_screening, extra, ai_reason, ai_fits) VALUES ?`,
        [final.map((m) => [id, m.project_id, m.project_name, m.rank, m.score, m.max_score, m.compliance_gap, m.recommended ? 1 : 0, JSON.stringify(m.shared), m.pool, m.alternative ? 1 : 0, m.platform,
          m.proves_work ? 1 : 0, m.named_in_screening ? 1 : 0, m.extra ? 1 : 0, m.ai_reason ?? null, m.ai_fits == null ? null : m.ai_fits ? 1 : 0])]);
      await conn.query(`UPDATE screenings SET tagging_status='done', tagging_error_code=NULL, tagging_error_message=NULL, tagging_model=IF(?, tagging_model, ?), tagged_at=NOW(),
        selection_confirmed_at=NULL, selection_confirmed_by=NULL, job_needs=?, matching_order=?, rematch_only=0 WHERE id=?`, [rematch ? 1 : 0, lastUsed()?.model ?? config.llm.model, jobNeeds(jobTags) || null, order, id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    });
    if (fromClaude) return;
    await queueEarlyDraft(id).catch((e) => console.error('early draft not queued:', (e as Error).message)); // a missed early draft only costs time
    // and it starts right here, as soon as the projects are matched, instead of waiting at the back of the queue (PLAN-SPEED point 1)
    if (!stopping && (await exec(`UPDATE early_drafts SET status='running' WHERE screening_id=? AND status='queued'`, [id])).affectedRows) {
      await withCallContext({ kind: 'early_draft', screeningId: id }, () => processEarlyDraft(id));
    }
  } catch (e) {
    if (stopping) { await exec(`UPDATE screenings SET tagging_status='queued' WHERE id=?`, [id]); return; } // killed by a deploy: run again
    const info = errorInfo(e);
    await exec(`UPDATE screenings SET tagging_status='error', tagging_error_code=?, tagging_error_message=? WHERE id=?`, [info.code, info.message, id]);
    await audit(null, 'tagging_error', `id=${id} code=${info.code}`);
  }
}

/** The job post in fields, read at the same time as screening. Failing only loses the structured view: the pasted text stays. */
async function processPosting(id: number) {
  try {
    const s = (await query<any>('SELECT job_text, raw_input FROM screenings WHERE id=?', [id]))[0];
    const p = await extractPosting(s.job_text ?? s.raw_input);
    await exec(`UPDATE screenings SET posting_json=?, posting_status='done', posting_error=NULL WHERE id=?`, [JSON.stringify(p), id]);
  } catch (e) {
    if (stopping) { await exec(`UPDATE screenings SET posting_status='queued' WHERE id=?`, [id]); return; }
    const info = errorInfo(e);
    await exec(`UPDATE screenings SET posting_status='error', posting_error=? WHERE id=?`, [info.message, id]);
  }
}

/** Step 4: signals, template, proposal. */
async function processProposal(id: number) {
  try {
    await runProposal(id, () => !stopping);
    if (stopping) { await exec(`UPDATE proposals SET status='queued' WHERE id=? AND status='running'`, [id]); return; }
    // the review starts right here, in the same job, instead of waiting for the next look at the queues (PLAN-SPEED point 6)
    if ((await exec(`UPDATE proposals SET review_status='running' WHERE id=? AND review_status='queued' AND status='done'`, [id])).affectedRows) {
      const sid = (await query<any>('SELECT screening_id FROM proposals WHERE id=?', [id]))[0]?.screening_id ?? null;
      await withCallContext({ kind: 'review', proposalId: id, screeningId: sid }, () => processReview(id));
    }
  } catch (e) {
    if (stopping) { await exec(`UPDATE proposals SET status='queued' WHERE id=?`, [id]); return; }
    const info = errorInfo(e);
    await exec(`UPDATE proposals SET status='error', stage=NULL, error_code=?, error_message=? WHERE id=?`, [info.code, info.message, id]);
    await audit(null, 'proposal_error', `id=${id} code=${info.code}`);
  }
}

/** An early draft. Failing costs nothing but time: the confirmed proposal then writes its own. */
async function processEarlyDraft(screeningId: number) {
  try { await runEarlyDraft(screeningId, () => !stopping); }
  catch (e) {
    if (stopping) { await exec(`UPDATE early_drafts SET status='queued' WHERE screening_id=? AND status='running'`, [screeningId]); return; }
    const info = errorInfo(e);
    await exec(`UPDATE early_drafts SET status='error', error_code=? WHERE screening_id=? AND status='running'`, [info.code, screeningId]);
  }
}

/** One chat turn. */
async function processChat(id: number) {
  try { await runChat(id); }
  catch (e) {
    if (stopping) { await exec(`UPDATE proposal_messages SET status='queued' WHERE id=?`, [id]); return; }
    const info = errorInfo(e);
    await exec(`UPDATE proposal_messages SET status='error', error_message=? WHERE id=?`, [info.message, id]);
    await audit(null, 'chat_error', `message=${id} code=${info.code}`);
  }
}

/**
 * One pass over the queues (PLAN-SPEED point 3). Work a person is waiting on goes first, in this order: a proposal someone asked
 * for, a chat answer, a new screening, the matching of a job someone just continued, reading the post (the writer needs its
 * screening questions), the review. Background work comes last: matching started by itself after a PASS, then early drafts.
 * Background work may never take the last free slot, so a person who presses a button never waits behind it.
 */
const NOT_READING = (col: string) => `NOT EXISTS (SELECT 1 FROM job_attachments ja WHERE ja.screening_id=${col} AND ja.status IN ('queued','running'))`;
type Job = { kind: string; claim: () => Promise<boolean>; run: () => Promise<unknown>; background?: boolean };
let bgInFlight = 0;
async function nextJob(allowBackground: boolean): Promise<Job | null> {
  // a file attached to a job is read first (R74): its screening, matching and proposal wait for it
  const at = await query<{ id: number; screening_id: number }>(`SELECT id, screening_id FROM job_attachments WHERE status='queued' ORDER BY id LIMIT 1`);
  if (at.length) return { kind: 'attachment', claim: async () => !!(await exec(`UPDATE job_attachments SET status='running' WHERE id=? AND status='queued'`, [at[0].id])).affectedRows,
    run: () => withCallContext({ kind: 'screening', screeningId: at[0].screening_id }, () => processAttachment(at[0].id)) };
  const pr = await query<{ id: number; screening_id: number }>(`SELECT id, screening_id FROM proposals WHERE status='queued' AND ${NOT_READING('proposals.screening_id')} ORDER BY id LIMIT 1`);
  if (pr.length) return { kind: 'proposal', claim: async () => !!(await exec(`UPDATE proposals SET status='running', stage='signals' WHERE id=? AND status='queued'`, [pr[0].id])).affectedRows,
    run: () => withCallContext({ kind: 'proposal', proposalId: pr[0].id, screeningId: pr[0].screening_id }, () => processProposal(pr[0].id)) };
  const ch = await query<{ id: number; proposal_id: number; screening_id: number }>(`SELECT m.id, p.id AS proposal_id, p.screening_id FROM proposal_messages m JOIN proposals p ON p.id=m.proposal_id WHERE m.role='user' AND m.status='queued' ORDER BY m.id LIMIT 1`);
  if (ch.length) return { kind: 'chat', claim: async () => !!(await exec(`UPDATE proposal_messages SET status='running' WHERE id=? AND status='queued'`, [ch[0].id])).affectedRows,
    run: () => withCallContext({ kind: 'chat', proposalId: ch[0].proposal_id, screeningId: ch[0].screening_id }, () => processChat(ch[0].id)) };
  // the proposal updated with experience the person confirmed (R67)
  const gp = await query<{ id: number; screening_id: number }>(`SELECT id, screening_id FROM proposals WHERE gaps_status='queued' AND status='done' ORDER BY id LIMIT 1`);
  if (gp.length) return { kind: 'gaps', claim: async () => !!(await exec(`UPDATE proposals SET gaps_status='running' WHERE id=? AND gaps_status='queued'`, [gp[0].id])).affectedRows,
    run: () => withCallContext({ kind: 'proposal', proposalId: gp[0].id, screeningId: gp[0].screening_id }, () => processGaps(gp[0].id)) };
  // a written proposal brought up to date after its projects, profile or video changed (only those parts are redone)
  const pa = await query<{ id: number; screening_id: number }>(`SELECT id, screening_id FROM proposals WHERE parts_status='queued' AND status='done' ORDER BY id LIMIT 1`);
  if (pa.length) return { kind: 'parts', claim: async () => !!(await exec(`UPDATE proposals SET parts_status='running' WHERE id=? AND parts_status='queued'`, [pa[0].id])).affectedRows,
    run: () => withCallContext({ kind: 'proposal', proposalId: pa[0].id, screeningId: pa[0].screening_id }, () => processParts(pa[0].id)) };
  const sc = await query<any>(`SELECT id, input_type, raw_input, upwork_job_id, job_text FROM screenings WHERE status='queued' AND discarded_at IS NULL AND ${NOT_READING('screenings.id')} ORDER BY id LIMIT 1`);
  if (sc.length) return { kind: 'screening', claim: async () => !!(await exec(`UPDATE screenings SET status='running', started_at=NOW() WHERE id=? AND status='queued'`, [sc[0].id])).affectedRows,
    run: () => withCallContext({ kind: 'screening', screeningId: sc[0].id }, () => process_(sc[0])) };
  const tagging = (id: number, background: boolean): Job => ({ kind: 'tagging', background, claim: async () => !!(await exec(`UPDATE screenings SET tagging_status='running' WHERE id=? AND tagging_status='queued'`, [id])).affectedRows,
    run: () => withCallContext({ kind: 'tagging', screeningId: id }, () => processTagging(id)) });
  const tc = await query<{ id: number }>(`SELECT id FROM screenings WHERE tagging_status='queued' AND discarded_at IS NULL AND continued_at IS NOT NULL AND ${NOT_READING('screenings.id')} ORDER BY continued_at, id LIMIT 1`);
  if (tc.length) return tagging(tc[0].id, false);
  const po = await query<{ id: number }>(`SELECT id FROM screenings WHERE posting_status='queued' AND discarded_at IS NULL AND (job_text IS NOT NULL OR input_type='text') ORDER BY id LIMIT 1`);
  if (po.length) return { kind: 'posting', claim: async () => !!(await exec(`UPDATE screenings SET posting_status='running' WHERE id=? AND posting_status='queued'`, [po[0].id])).affectedRows,
    run: () => withCallContext({ kind: 'posting', screeningId: po[0].id }, () => processPosting(po[0].id)) };
  const rv = await query<{ id: number; screening_id: number }>(`SELECT id, screening_id FROM proposals WHERE review_status='queued' AND status='done' ORDER BY id LIMIT 1`);
  if (rv.length) return { kind: 'review', claim: async () => !!(await exec(`UPDATE proposals SET review_status='running' WHERE id=? AND review_status='queued'`, [rv[0].id])).affectedRows,
    run: () => withCallContext({ kind: 'review', proposalId: rv[0].id, screeningId: rv[0].screening_id }, () => processReview(rv[0].id)) };
  // the three openings to pick from (R73), written after the proposal
  const op = await query<{ id: number; screening_id: number }>(`SELECT id, screening_id FROM proposals WHERE openings_status='queued' AND status='done' ORDER BY id LIMIT 1`);
  if (op.length) return { kind: 'openings', claim: async () => !!(await exec(`UPDATE proposals SET openings_status='running' WHERE id=? AND openings_status='queued'`, [op[0].id])).affectedRows,
    run: () => withCallContext({ kind: 'proposal', proposalId: op[0].id, screeningId: op[0].screening_id }, () => processOpenings(op[0].id)) };
  if (!allowBackground) return null;
  const ta = await query<{ id: number }>(`SELECT id FROM screenings WHERE tagging_status='queued' AND discarded_at IS NULL AND continued_at IS NULL AND ${NOT_READING('screenings.id')} ORDER BY id LIMIT 1`);
  if (ta.length) return tagging(ta[0].id, true);
  const ed = await query<{ screening_id: number }>(`SELECT screening_id FROM early_drafts WHERE status='queued' ORDER BY created_at, screening_id LIMIT 1`);
  if (ed.length) return { kind: 'early_draft', background: true, claim: async () => !!(await exec(`UPDATE early_drafts SET status='running' WHERE screening_id=? AND status='queued'`, [ed[0].screening_id])).affectedRows,
    run: () => withCallContext({ kind: 'early_draft', screeningId: ed[0].screening_id }, () => processEarlyDraft(ed[0].screening_id)) };
  return null;
}
/** Starts as much work as there are free slots. Returns whether it started anything, so the loop knows to look again at once. */
async function tick(): Promise<boolean> {
  let started = false;
  while (!stopping && inFlight < config.llm.concurrency) {
    // one slot is always kept for work a person is waiting on (with one slot in all, background work still runs when idle)
    const allowBackground = config.llm.concurrency === 1 ? inFlight === 0 : bgInFlight < config.llm.concurrency - 1;
    const job = await nextJob(allowBackground);
    if (!job) return started;
    if (!(await job.claim())) continue; // a second worker took it: look again
    await getSettings().catch(() => undefined); // from memory: keeps the company name (company.ts) current for this job's prompts
    inFlight++; if (job.background) bgInFlight++; started = true;
    job.run().catch((e) => console.error(job.kind + ' failed', (e as Error).message)) // a DB blip must not kill the worker
      .finally(() => { inFlight--; if (job.background) bgInFlight--; wake(); });
  }
  return started;
}
/** The loop sleeps a quarter of a second when there is nothing to start, and wakes at once when a job ends. */
let wakeUp: (() => void) | null = null;
const wake = () => { const w = wakeUp; wakeUp = null; w?.(); };
const idle = (ms: number) => new Promise<void>((r) => { const t = setTimeout(() => { wakeUp = null; r(); }, ms); wakeUp = () => { clearTimeout(t); r(); }; });

/** The proposal updated with the experience the person confirmed. */
async function processGaps(id: number) {
  try { await runGapUpdate(id); }
  catch (e) {
    console.error('gaps update failed', (e as Error).message);
    await exec(`UPDATE proposals SET gaps_status=?, gaps_error=? WHERE id=?`, [stopping ? 'queued' : 'error', String((e as Error).message).slice(0, 300), id]).catch(() => undefined);
  }
}

/** The parts of a written proposal brought up to date. */
async function processParts(id: number) {
  try { await runPartsRefresh(id); }
  catch (e) {
    console.error('parts failed', (e as Error).message);
    await exec(`UPDATE proposals SET parts_status=?, parts_error=? WHERE id=?`, [stopping ? 'queued' : 'error', String((e as Error).message).slice(0, 300), id]).catch(() => undefined);
  }
}

/** The independent review, as its own job (asked for again, or from the plugin). */
async function processReview(id: number) {
  try { await runReview(id); }
  catch (e) {
    console.error('review failed', (e as Error).message);
    await exec(`UPDATE proposals SET review_status=?, review_error=? WHERE id=?`, [stopping ? 'queued' : 'error', String((e as Error).message).slice(0, 300), id]).catch(() => undefined);
  }
}

/** An attached image or scanned PDF read by the AI (R74). If it cannot be read, the job goes on without it and the person can say what it shows. */
async function processAttachment(id: number) {
  try { await runAttachmentRead(id); }
  catch (e) {
    console.error('attachment failed', (e as Error).message);
    await exec(`UPDATE job_attachments SET status=?, error=? WHERE id=?`, [stopping ? 'queued' : 'error', stopping ? null : 'The AI could not read this file. Type what it shows, or remove it.', id]).catch(() => undefined);
  }
}

/** The three openings (R73). */
async function processOpenings(id: number) {
  try { await runOpenings(id); }
  catch (e) {
    console.error('openings failed', (e as Error).message);
    await exec(`UPDATE proposals SET openings_status=?, openings_error=? WHERE id=?`, [stopping ? 'queued' : 'error', String((e as Error).message).slice(0, 300), id]).catch(() => undefined);
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  killAllChildren(); // running model calls fail now; their temp folders are removed
  const t = Date.now();
  while (inFlight > 0 && Date.now() - t < 8000) await new Promise((r) => setTimeout(r, 100));
  // anything still marked running goes back to the queue
  await exec(`UPDATE screenings SET status='queued' WHERE status='running'`).catch(() => undefined);
  await exec(`UPDATE screenings SET tagging_status='queued' WHERE tagging_status='running'`).catch(() => undefined);
  await exec(`UPDATE proposals SET status='queued' WHERE status='running'`).catch(() => undefined);
  await exec(`UPDATE proposals SET review_status='queued' WHERE review_status='running'`).catch(() => undefined);
  await exec(`UPDATE proposals SET parts_status='queued' WHERE parts_status='running'`).catch(() => undefined);
  await exec(`UPDATE proposals SET gaps_status='queued' WHERE gaps_status='running'`).catch(() => undefined);
  await exec(`UPDATE proposals SET openings_status='queued' WHERE openings_status='running'`).catch(() => undefined);
  await exec(`UPDATE job_attachments SET status='queued' WHERE status='running'`).catch(() => undefined);
  await exec(`UPDATE proposal_messages SET status='queued' WHERE status='running'`).catch(() => undefined);
  await exec(`UPDATE early_drafts SET status='queued' WHERE status='running'`).catch(() => undefined);
  await exec(`UPDATE screenings SET posting_status='queued' WHERE posting_status='running'`).catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(0);
}
process.on('SIGINT', shutdown); // PM2 stops with SIGINT by default
process.on('SIGTERM', shutdown);

async function main() {
  sweepOldScratch();
  enableSetupCache(); // PLAN-SPEED point 8: the setup is kept in memory, read again when it changes
  await exec(`UPDATE screenings SET status='queued' WHERE status='running'`); // a crashed worker left these
  await exec(`UPDATE screenings SET tagging_status='queued' WHERE tagging_status='running'`);
  await exec(`UPDATE proposals SET status='queued' WHERE status='running'`);
  await exec(`UPDATE proposals SET review_status='queued' WHERE review_status='running'`);
  await exec(`UPDATE proposals SET parts_status='queued' WHERE parts_status='running'`);
  await exec(`UPDATE proposals SET gaps_status='queued' WHERE gaps_status='running'`);
  await exec(`UPDATE proposals SET openings_status='queued' WHERE openings_status='running'`);
  await exec(`UPDATE job_attachments SET status='queued' WHERE status='running'`);
  await exec(`UPDATE proposal_messages SET status='queued' WHERE status='running'`);
  await exec(`UPDATE early_drafts SET status='queued' WHERE status='running'`);
  await exec(`UPDATE screenings SET posting_status='queued' WHERE posting_status='running'`);
  console.log(`worker started ai=${providerName === 'mock' ? 'mock' : 'chosen in Settings'} concurrency=${config.llm.concurrency}`);
  while (!stopping) {
    let busy = false;
    try { busy = await tick(); } catch (e) { console.error('tick failed', (e as Error).message); }
    if (!busy) await idle(250); // nothing new: look again in a quarter of a second, or as soon as a job ends
  }
}
main();
