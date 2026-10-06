import 'dotenv/config';
import { audit, exec, pool, query, withRetry } from './db';
import { config } from './config';
import { LlmCallError, killAllChildren, sweepOldScratch } from './llm/claude-runner';
import { providerName } from './llm';
import { COLUMN_KEYS } from './screening/contract';
import { loadContext, loadDictionary, loadLibraryProjects } from './screening/context';
import { rankProjects, type JobTag } from './screening/matching';
import { tagJob } from './screening/tagging';
import { detectSignals, queueEarlyDraft, runChat, runEarlyDraft, runProposal } from './proposal/pipeline';
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
  if (/LLM_BASE_URL \/ LLM_API_KEY are not set/.test(m)) return { code: 'llm_config', message: 'The AI key is not set on the server. Tell an admin to add LLM_API_KEY to the .env file and restart the worker.' };
  if (m === 'missing_inputs') return { code: 'missing_inputs', message: 'The selected projects or the profile are missing. Confirm them first.' };
  if (m === 'no_template') return { code: 'no_template', message: 'There is no active template. An admin can add one under Templates.' };
  if (m === 'no_version') return { code: 'no_version', message: 'The proposal has no text yet.' };
  if (m === 'no_tags') return { code: 'no_tags', message: 'The model found no matching tags. Try again.' };
  if (m === 'invalid_output') return { code: 'invalid_output', message: 'The AI answer was not in the expected format. Try again.' };
  if (m === 'no_active_skill') return { code: 'no_skill', message: 'No active skill version. Tell an admin.' };
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
    const rep = await screenJobText(jobText ?? row.raw_input, skill.content, ctx);
    const v = sheetValues(rep, ctx.rules.map((r) => r.code), ctx.projects.map((p) => p.name));
    await exec(
      // PASS needs no decision, so tagging and signals start now; FLAG and FAIL wait until the person continues with a reason
      `UPDATE screenings SET status='done', job_text=?, title=?, verdict=?, report_json=?, skill_version_id=?, model=?, provider=?, finished_at=NOW(),
         fail_reasons=?, flag_reasons=?, rule_codes=?, ${COLUMN_KEYS.map((k) => `${k}=?`).join(', ')},
         tagging_status=IF(? = 'PASS', COALESCE(tagging_status, 'queued'), tagging_status)
       WHERE id=?`,
      [jobText, v.title, v.verdict, JSON.stringify(rep), skill.id, config.llm.model, providerName,
       v.fail_reasons || null, v.flag_reasons || null, v.rule_codes || null, ...COLUMN_KEYS.map((k) => v.columns[k]), v.verdict, row.id],
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
    const s = (await query<any>('SELECT job_text, raw_input FROM screenings WHERE id=?', [id]))[0];
    const jobText: string = s.job_text ?? s.raw_input;
    // not awaited: the projects show as soon as tagging is done, and a proposal started meanwhile waits for these signals
    if (!(await query<any>('SELECT 1 FROM job_signals WHERE screening_id=? LIMIT 1', [id])).length) {
      detectSignals(id, jobText, () => !stopping).catch((e) => console.error('signals failed, the proposal will read them itself:', (e as Error).message));
    }
    const dict = await loadDictionary();
    const tagged = await tagJob(jobText, dict);
    const jobTags: JobTag[] = tagged.map((x) => ({ id: x.tag.id, name: x.tag.name, category: x.tag.category, weight: x.tag.weight, compliance: !!x.tag.compliance }));
    const matches = rankProjects(jobTags, await loadLibraryProjects());
    await withRetry(async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM job_matches WHERE screening_id=?', [id]); // a retry replaces the old result
      await conn.query('DELETE FROM job_tags WHERE screening_id=?', [id]);
      for (const x of tagged) {
        await conn.query('INSERT INTO job_tags (screening_id, tag_id, tag_name, category_name, weight, reason) VALUES (?,?,?,?,?,?)',
          [id, x.tag.id, x.tag.name, x.tag.category, x.tag.weight, x.reason]);
      }
      for (const m of matches) {
        await conn.query(
          `INSERT INTO job_matches (screening_id, project_id, project_name, rank_no, score, max_score, compliance_gap, recommended, shared_tags) VALUES (?,?,?,?,?,?,?,?,?)`,
          [id, m.project_id, m.project_name, m.rank, m.score, m.max_score, m.compliance_gap, m.recommended ? 1 : 0, JSON.stringify(m.shared)]);
      }
      await conn.query(`UPDATE screenings SET tagging_status='done', tagging_error_code=NULL, tagging_error_message=NULL, tagging_model=?, tagged_at=NOW(),
        selection_confirmed_at=NULL, selection_confirmed_by=NULL WHERE id=?`, [config.llm.model, id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    });
    await queueEarlyDraft(id).catch((e) => console.error('early draft not queued:', (e as Error).message)); // a missed early draft only costs time
  } catch (e) {
    if (stopping) { await exec(`UPDATE screenings SET tagging_status='queued' WHERE id=?`, [id]); return; } // killed by a deploy: run again
    const info = errorInfo(e);
    await exec(`UPDATE screenings SET tagging_status='error', tagging_error_code=?, tagging_error_message=? WHERE id=?`, [info.code, info.message, id]);
    await audit(null, 'tagging_error', `id=${id} code=${info.code}`);
  }
}

/** Step 4: signals, template, proposal. */
async function processProposal(id: number) {
  try {
    await runProposal(id, () => !stopping);
    if (stopping) await exec(`UPDATE proposals SET status='queued' WHERE id=? AND status='running'`, [id]);
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

async function tick() {
  while (!stopping && inFlight < config.llm.concurrency) {
    const rows = await query<any>(
      `SELECT id, input_type, raw_input, upwork_job_id, job_text FROM screenings WHERE status='queued' ORDER BY id LIMIT 1`,
    );
    if (rows.length) {
      // single worker process, but the guarded UPDATE keeps a second one from double-running a job
      const res = await exec(`UPDATE screenings SET status='running', started_at=NOW() WHERE id=? AND status='queued'`, [rows[0].id]);
      if (!res.affectedRows) continue;
      inFlight++;
      process_(rows[0])
        .catch((e) => console.error('job failed', (e as Error).message)) // a DB blip must not kill the worker
        .finally(() => { inFlight--; });
      continue;
    }
    const t = await query<{ id: number }>(`SELECT id FROM screenings WHERE tagging_status='queued' ORDER BY continued_at IS NULL, continued_at, id LIMIT 1`); // jobs a person continued first, then PASS jobs started early
    if (t.length) {
      const res = await exec(`UPDATE screenings SET tagging_status='running' WHERE id=? AND tagging_status='queued'`, [t[0].id]);
      if (!res.affectedRows) continue;
      inFlight++;
      processTagging(t[0].id)
        .catch((e) => console.error('tagging failed', (e as Error).message))
        .finally(() => { inFlight--; });
      continue;
    }
    const pr = await query<{ id: number }>(`SELECT id FROM proposals WHERE status='queued' ORDER BY id LIMIT 1`);
    if (pr.length) {
      const res = await exec(`UPDATE proposals SET status='running', stage='signals' WHERE id=? AND status='queued'`, [pr[0].id]);
      if (!res.affectedRows) continue;
      inFlight++;
      processProposal(pr[0].id).catch((e) => console.error('proposal failed', (e as Error).message)).finally(() => { inFlight--; });
      continue;
    }
    const ch = await query<{ id: number }>(`SELECT id FROM proposal_messages WHERE role='user' AND status='queued' ORDER BY id LIMIT 1`);
    if (ch.length) {
      const res = await exec(`UPDATE proposal_messages SET status='running' WHERE id=? AND status='queued'`, [ch[0].id]);
      if (!res.affectedRows) continue;
      inFlight++;
      processChat(ch[0].id).catch((e) => console.error('chat failed', (e as Error).message)).finally(() => { inFlight--; });
      continue;
    }
    // last: early drafts only save time, so anything a person is waiting on goes first
    const ed = await query<{ screening_id: number }>(`SELECT screening_id FROM early_drafts WHERE status='queued' ORDER BY created_at, screening_id LIMIT 1`);
    if (!ed.length) return;
    const res = await exec(`UPDATE early_drafts SET status='running' WHERE screening_id=? AND status='queued'`, [ed[0].screening_id]);
    if (!res.affectedRows) continue;
    inFlight++;
    processEarlyDraft(ed[0].screening_id).catch((e) => console.error('early draft failed', (e as Error).message)).finally(() => { inFlight--; });
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
  await exec(`UPDATE proposal_messages SET status='queued' WHERE status='running'`).catch(() => undefined);
  await exec(`UPDATE early_drafts SET status='queued' WHERE status='running'`).catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(0);
}
process.on('SIGINT', shutdown); // PM2 stops with SIGINT by default
process.on('SIGTERM', shutdown);

async function main() {
  sweepOldScratch();
  await exec(`UPDATE screenings SET status='queued' WHERE status='running'`); // a crashed worker left these
  await exec(`UPDATE screenings SET tagging_status='queued' WHERE tagging_status='running'`);
  await exec(`UPDATE proposals SET status='queued' WHERE status='running'`);
  await exec(`UPDATE proposal_messages SET status='queued' WHERE status='running'`);
  await exec(`UPDATE early_drafts SET status='queued' WHERE status='running'`);
  console.log(`worker started provider=${providerName} concurrency=${config.llm.concurrency}`);
  while (!stopping) {
    try { await tick(); } catch (e) { console.error('tick failed', (e as Error).message); }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
main();
