import { config } from '../config';
import { getSettings } from '../settings';
import { exec, pool, query, withRetry } from '../db';
import { htmlToPlain, textToHtml } from '../html';
import { run } from '../llm';
import { lastUsed } from '../llm/context';
import { checkProposal } from './checks';
import { rankTemplates } from './rank';
import { buildDetectionSchema, detectionPrompt, normalizeDetection, type DetectedValue, type SignalDef } from './signals';
import { chatOut, chatSchema, chatSystem, writerOut, writerSchema, writerSystem, type ProjectFact, type SenderFact, type TemplateFact } from './writer';


export async function loadSignalDefs(): Promise<{ defs: SignalDef[]; layers: { code: string; intro: string | null; rule: string | null }[] }> {
  const rows = await query<any>(
    `SELECT s.id, s.number, s.name, s.decides, s.multi_select, s.notes, l.code AS layer, l.intro AS layer_intro, l.rule_note AS layer_rule
     FROM signals s JOIN signal_layers l ON l.id=s.layer_id WHERE s.active=1 ORDER BY s.number`);
  const vals = await query<any>('SELECT id, signal_id, name, detect, move, is_fallback FROM signal_values WHERE active=1 ORDER BY sort_order, id');
  const defs: SignalDef[] = rows.map((r) => ({ id: r.id, number: r.number, layer: r.layer, name: r.name, decides: r.decides, multi_select: !!r.multi_select, notes: r.notes,
    values: vals.filter((v) => v.signal_id === r.id).map((v) => ({ id: v.id, name: v.name, detect: v.detect, move: v.move, is_fallback: !!v.is_fallback })) }))
    .filter((s) => s.values.length);
  const layers = [...new Map(rows.map((r) => [r.layer, { code: r.layer as string, intro: r.layer_intro as string | null, rule: r.layer_rule as string | null }])).values()];
  return { defs, layers };
}

/** "username" or a full link -> a link. */
export const gitlabLink = (v: string | null) => (!v ? null : /^https?:\/\//i.test(v) ? v : `https://gitlab.com/${v}`);

/** The projects and profile a proposal is written for. Confirmed by the person, or guessed for an early draft. */
export interface Basis { projectIds: number[]; profileId: number }
const basisKey = (b: Basis) => [...b.projectIds].sort((x, y) => x - y).join(',') + '|' + b.profileId;

async function loadFacts(screeningId: number, basis?: Basis) {
  const s = (await query<any>('SELECT s.job_text, s.raw_input, s.report_json, s.proposal_profile_id FROM screenings s WHERE s.id=?', [screeningId]))[0];
  const profileId: number | null = basis ? basis.profileId : s.proposal_profile_id;
  const pr = profileId ? (await query<any>('SELECT name, tagline, gitlab_account FROM upwork_profiles WHERE id=?', [profileId]))[0] ?? {} : {};
  const matches = await query<any>(
    `SELECT jm.project_id, jm.project_name, p.live_link, p.notes FROM job_matches jm LEFT JOIN projects p ON p.id=jm.project_id
     WHERE jm.screening_id=? AND ${basis ? 'jm.project_id IN (?)' : 'jm.selected=1'} ORDER BY jm.rank_no`, basis ? [screeningId, basis.projectIds] : [screeningId]);
  const ids = matches.map((m) => m.project_id).filter(Boolean);
  const tags = ids.length ? await query<any>('SELECT pt.project_id, t.name FROM project_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.project_id IN (?) ORDER BY t.sort_order', [ids]) : [];
  const inds = ids.length ? await query<any>('SELECT pi.project_id, i.name FROM project_industries pi JOIN industries i ON i.id=pi.industry_id WHERE pi.project_id IN (?) ORDER BY i.name', [ids]) : [];
  const projects: ProjectFact[] = matches.map((m) => ({ name: m.project_name, live_link: m.live_link || null, notes: m.notes || null,
    tags: tags.filter((t) => t.project_id === m.project_id).map((t) => t.name), industries: inds.filter((t) => t.project_id === m.project_id).map((t) => t.name) }));
  const sender: SenderFact = { name: pr.name, gitlab_link: gitlabLink(pr.gitlab_account), tagline: pr.tagline || null };
  let report: any = null; try { report = JSON.parse(s.report_json); } catch { /* old or missing */ }
  const job = report?.job ?? report?.jobs?.[0] ?? null;
  const requirements: string[] = [];
  for (const n of job?.proposal_notes ?? []) if (n && !/^mock provider/i.test(n)) requirements.push(String(n));
  const passOn = new Set((await getSettings())['writer.requirement_rules']); // flags the writer must treat as client requirements (admin setting)
  for (const f of job?.flags ?? []) if (passOn.has(f.code)) requirements.push(`${f.rule}: ${f.value}`);
  return { jobText: (s.job_text ?? s.raw_input) as string, sender, projects, requirements, profileId, projectIds: ids as number[] };
}

async function loadTemplate(id: number): Promise<(TemplateFact & { id: number }) | null> {
  const t = (await query<any>('SELECT id, name, body_html, prompt FROM templates WHERE id=?', [id]))[0];
  return t ? { id: t.id, name: t.name, body_html: t.body_html, prompt: t.prompt } : null;
}

/** Names that come from samples and templates (their signatures): they must never appear in a new proposal. */
async function foreignNames(): Promise<string[]> {
  const out = new Set<string>();
  const rows = await query<any>('SELECT author, content FROM template_samples UNION ALL SELECT NULL, body_html FROM templates');
  for (const r of rows) {
    if (r.author && String(r.author).trim().length > 2) out.add(String(r.author).trim());
    const text = htmlToPlain(String(r.content));
    for (const m of text.matchAll(/Best regards,\s*\n+\s*([A-Z][\p{L}'-]+(?: [A-Z][\p{L}'-]+){1,2})\s*(?:\n|$)/gu)) out.add(m[1].trim());
  }
  return [...out];
}

async function nextVersion(conn: any, proposalId: number) {
  const [r]: any = await conn.query('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM proposal_versions WHERE proposal_id=? FOR UPDATE', [proposalId]);
  return Number(r[0].n);
}
export async function addVersion(proposalId: number, html: string, source: 'ai' | 'manual' | 'chat' | 'restore', userId: number | null, note: string | null, basedOn: number | null) {
  return withRetry(async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const no = await nextVersion(conn, proposalId);
      await conn.query('INSERT INTO proposal_versions (proposal_id, version_no, content_html, source, note, based_on_version, created_by) VALUES (?,?,?,?,?,?,?)', [proposalId, no, html, source, note, basedOn, userId]);
      await conn.query('UPDATE proposals SET updated_at=NOW() WHERE id=?', [proposalId]);
      await conn.commit();
      return no;
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  });
}

async function setStage(id: number, stage: string) { await exec('UPDATE proposals SET stage=? WHERE id=?', [stage, id]); }

const storedSignals = async (screeningId: number): Promise<DetectedValue[]> =>
  (await query<any>('SELECT * FROM job_signals WHERE screening_id=?', [screeningId])).map((r) => ({ signal_id: r.signal_id, signal_number: r.signal_number, signal_name: r.signal_name,
    value_id: r.value_id, value_name: r.value_name, is_fallback: !!r.is_fallback, is_primary: !!r.is_primary, confidence: r.confidence, evidence: r.evidence ?? '', reason: r.reason ?? '',
    move: r.move_text, defaulted: false }));

/** Signal readings in progress in this worker, so a proposal waits for one instead of starting a second. */
const signalsInFlight = new Map<number, Promise<DetectedValue[] | null>>();

/** Reads the signals from the job text alone, so it can run alongside tagging, before the projects and profile are chosen. */
export function detectSignals(screeningId: number, jobText: string, stillWanted: () => boolean = () => true): Promise<DetectedValue[] | null> {
  const running = signalsInFlight.get(screeningId);
  if (running) return running;
  const p = readSignals(screeningId, jobText, stillWanted).finally(() => signalsInFlight.delete(screeningId));
  signalsInFlight.set(screeningId, p);
  return p;
}

/** One call per signal layer, all at once: each writes a third of the answer (reasons included), so the step takes about a third of the time.
 *  Layer rules only compare signals within their own layer, so reading the layers apart loses nothing. */
async function readSignals(screeningId: number, jobText: string, stillWanted: () => boolean): Promise<DetectedValue[] | null> {
  const { defs, layers } = await loadSignalDefs();
  const answers = await Promise.all(layers.map(async (layer) => {
    const mine = defs.filter((d) => d.layer === layer.code);
    if (!mine.length) return [];
    const r = await run({ label: 'signals: ' + layer.code, system: detectionPrompt(mine, [layer]), prompt: `<job_page>\n${jobText}\n</job_page>`, schema: buildDetectionSchema(mine), timeoutMs: config.llm.timeoutMs });
    const got = (r.data as { signals?: unknown } | undefined)?.signals;
    if (!Array.isArray(got)) throw new Error('invalid_output'); // never let one bad layer quietly fall back to defaults
    return got;
  }));
  const detected = normalizeDetection({ signals: answers.flat() }, defs);
  if (!stillWanted()) return null;
  await withRetry(async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM job_signals WHERE screening_id=?', [screeningId]);
      for (const d of detected) {
        await conn.query(`INSERT INTO job_signals (screening_id, signal_id, signal_number, signal_name, value_id, value_name, is_fallback, is_primary, confidence, evidence, reason, move_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [screeningId, d.signal_id, d.signal_number, d.signal_name, d.value_id, d.value_name, d.is_fallback ? 1 : 0, d.is_primary ? 1 : 0, d.confidence, d.evidence || null, d.reason || null, d.move]);
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  });
  return detected;
}

type Facts = Awaited<ReturnType<typeof loadFacts>>;
interface Draft { template: { id: number; name: string; score: number; choice: 'auto' | 'manual'; ranking: string }; text: string; warnings: { source: string; text: string }[]; model: string }

/** Signals, template, writing and checks for one set of facts. Stores nothing about the proposal, so an early draft can use it too. */
async function compose(screeningId: number, f: Facts, opts: { templateId?: number | null; stillWanted: () => boolean; stage?: (s: string) => Promise<void>; onTemplate?: (t: Draft['template']) => Promise<void> }): Promise<Draft | null> {
  const stage = opts.stage ?? (async () => undefined);
  // 1. signals: they depend only on the job text, so reuse the ones read alongside tagging (or by an earlier run)
  let detected = await storedSignals(screeningId);
  if (!detected.length) {
    await stage('signals');
    const early = signalsInFlight.get(screeningId); // started alongside tagging and not finished yet
    if (early) await early.catch(() => null);
    detected = await storedSignals(screeningId);
  }
  if (!detected.length) {
    const d = await detectSignals(screeningId, f.jobText, opts.stillWanted);
    if (!d) return null;
    detected = d;
  }

  // 2. template: the best fit for the signals, or the one the user chose
  await stage('template');
  const tpls = await query<any>('SELECT id, name, priority FROM templates WHERE active=1');
  const maps = await query<any>('SELECT template_id, signal_id, value_id, weight FROM template_signals');
  const ranked = rankTemplates(detected.map((d) => ({ signal_id: d.signal_id, value_id: d.value_id, is_fallback: d.is_fallback })),
    tpls.map((t) => ({ id: t.id, name: t.name, priority: t.priority, mappings: maps.filter((m) => m.template_id === t.id).map((m) => ({ signal_id: m.signal_id, value_id: m.value_id, weight: m.weight })) })));
  if (!ranked.chosen) throw new Error('no_template');
  let chosen = ranked.chosen; let choice: 'auto' | 'manual' = 'auto';
  if (opts.templateId) { const m = ranked.ranking.find((x) => x.id === opts.templateId); if (m) { chosen = m; choice = 'manual'; } }
  const sigLabel = new Map(detected.map((d) => [`${d.signal_id}:${d.value_id}`, `${d.signal_name}: ${d.value_name}`]));
  const sigOnly = new Map(detected.map((d) => [d.signal_id, `${d.signal_name}: ${d.value_name}`]));
  const ranking = JSON.stringify({ defaulted: ranked.defaulted && choice === 'auto', items: ranked.ranking.map((r) => ({ id: r.id, name: r.name, score: r.score, rank: r.rank,
    matched: r.matched.map((m) => ({ label: (m.value_id ? sigLabel.get(`${m.signal_id}:${m.value_id}`) : sigOnly.get(m.signal_id)) ?? 'signal', weight: m.weight })) })) });
  if (opts.onTemplate) await opts.onTemplate({ id: chosen.id, name: chosen.name, score: chosen.score, choice, ranking });
  if (!opts.stillWanted()) return null;
  const template = (await loadTemplate(chosen.id))!;

  // 3. write
  await stage('writing');
  const samples = (await query<any>('SELECT title, content FROM template_samples WHERE template_id=? AND active=1 ORDER BY id LIMIT 3', [chosen.id])).map((s) => ({ title: s.title, content: s.content }));
  const requirements = [...f.requirements];
  const ss = (await getSettings())['writer.structured_signal']; // which signal value means "answer in the post's own structure" (admin setting)
  const structured = detected.find((d) => d.signal_number === ss.signal && d.value_name.trim().toLowerCase() === ss.value.trim().toLowerCase());
  if (structured) requirements.push('The post demands a structured submission: follow its structure exactly, first, before anything else.');
  const w = await run({ label: 'writing', system: writerSystem({ template, detected, samples, sender: f.sender, projects: f.projects, clientRequirements: requirements }),
    prompt: `<job_page>\n${f.jobText}\n</job_page>\n\nWrite the proposal now.`, schema: writerSchema, timeoutMs: config.llm.timeoutMs });
  const parsed = writerOut.safeParse(w.data);
  if (!parsed.success) throw new Error('invalid_output');
  if (!opts.stillWanted()) return null;

  // 4. check what the writer cannot be trusted to check
  const library = (await query<any>('SELECT name FROM projects')).map((r) => r.name as string);
  const warnings = [...parsed.data.warnings.map((t) => ({ source: 'writer', text: t })),
    ...checkProposal({ text: parsed.data.proposal, selectedProjects: f.projects.map((x) => ({ name: x.name, live_link: x.live_link, notes: x.notes })), otherProjectNames: library, foreignNames: await foreignNames(),
      sender: { name: f.sender.name, gitlab_link: f.sender.gitlab_link } }).map((t) => ({ source: 'check', text: t }))];
  return { template: { id: chosen.id, name: chosen.name, score: chosen.score, choice, ranking }, text: parsed.data.proposal, warnings, model: lastUsed()?.model ?? config.llm.model };
}

// ---------- early drafts ----------
// Once projects are matched, a draft is written with the recommended projects and the likely profile, before the person
// has confirmed either. If they confirm the same ones, the proposal uses it instead of starting from scratch.

/** Early drafts being written in this worker, so a confirmed proposal can wait for one instead of writing a second. */
const earlyInFlight = new Map<number, Promise<void>>();

/** The profile to guess: the only active one, or the one this person used last. None means no early draft. */
async function likelyProfile(userId: number): Promise<number | null> {
  const active = await query<any>('SELECT id FROM upwork_profiles WHERE active=1');
  if (active.length === 1) return active[0].id;
  const last = (await query<any>(
    `SELECT s.proposal_profile_id AS id FROM screenings s JOIN upwork_profiles pr ON pr.id=s.proposal_profile_id AND pr.active=1
     WHERE s.user_id=? AND s.proposal_profile_confirmed_at IS NOT NULL ORDER BY s.proposal_profile_confirmed_at DESC LIMIT 1`, [userId]))[0];
  return last ? last.id : null;
}

/** Called when matching is done. Queues nothing when there is no clear guess or a proposal already exists. */
export async function queueEarlyDraft(screeningId: number) {
  const s = (await query<any>('SELECT user_id FROM screenings WHERE id=?', [screeningId]))[0];
  if (!s || (await query<any>('SELECT 1 FROM proposals WHERE screening_id=? LIMIT 1', [screeningId])).length) return;
  const rec = (await query<any>('SELECT project_id FROM job_matches WHERE screening_id=? AND recommended=1 AND project_id IS NOT NULL ORDER BY rank_no', [screeningId])).map((r) => r.project_id as number);
  const profileId = await likelyProfile(s.user_id);
  const cfg = await getSettings();
  const take = rec.slice(0, cfg['selection.max']);
  if (take.length < cfg['selection.min'] || !profileId) return;
  await exec(`INSERT INTO early_drafts (screening_id, project_ids, profile_id) VALUES (?,?,?)
    ON DUPLICATE KEY UPDATE status=IF(status IN ('error','skipped'), 'queued', status), project_ids=IF(status IN ('error','skipped'), VALUES(project_ids), project_ids),
      profile_id=IF(status IN ('error','skipped'), VALUES(profile_id), profile_id), error_code=NULL`, [screeningId, take.join(','), profileId]);
}

/** Worker job: write the early draft and keep the result until the person confirms. */
export function runEarlyDraft(screeningId: number, stillWanted: () => boolean): Promise<void> {
  const p = (async () => {
    const row = (await query<any>('SELECT project_ids, profile_id FROM early_drafts WHERE screening_id=?', [screeningId]))[0];
    const basis: Basis = { projectIds: String(row.project_ids).split(',').map(Number), profileId: row.profile_id };
    const f = await loadFacts(screeningId, basis);
    if (!f.sender.name || f.projects.length < 1) throw new Error('missing_inputs');
    const d = await compose(screeningId, f, { stillWanted });
    if (!d) { await exec(`UPDATE early_drafts SET status='queued' WHERE screening_id=? AND status='running'`, [screeningId]); return; }
    await exec(`UPDATE early_drafts SET status='done', result_json=?, finished_at=NOW() WHERE screening_id=? AND status='running'`, [JSON.stringify(d), screeningId]);
  })().finally(() => earlyInFlight.delete(screeningId));
  earlyInFlight.set(screeningId, p.catch(() => undefined));
  return p;
}

/** The early draft, when it was written for exactly what the person confirmed. Waits for it if it is still being written. */
async function takeEarlyDraft(screeningId: number, basis: Basis, onWait: () => Promise<void>): Promise<Draft | null> {
  let row = (await query<any>('SELECT status, project_ids, profile_id FROM early_drafts WHERE screening_id=?', [screeningId]))[0];
  if (!row) return null;
  const same = basisKey({ projectIds: String(row.project_ids).split(',').map(Number), profileId: row.profile_id }) === basisKey(basis);
  // not started yet, or written for other choices: it is no use, so it never runs
  const skip = await exec(`UPDATE early_drafts SET status='skipped' WHERE screening_id=? AND (status='queued' OR (? AND status<>'running'))`, [screeningId, same ? 0 : 1]);
  if (!same || skip.affectedRows) return null;
  if (row.status === 'running' || earlyInFlight.has(screeningId)) {
    const running = earlyInFlight.get(screeningId);
    if (!running) return null; // running in another process that may be gone: write it here instead
    await onWait();
    await running;
    row = (await query<any>('SELECT status FROM early_drafts WHERE screening_id=?', [screeningId]))[0];
  }
  const done = (await query<any>(`SELECT result_json FROM early_drafts WHERE screening_id=? AND status='done' AND used_at IS NULL`, [screeningId]))[0];
  if (!done) return null;
  await exec('UPDATE early_drafts SET used_at=NOW() WHERE screening_id=?', [screeningId]);
  return JSON.parse(done.result_json) as Draft;
}

/** Step 4: signals, template, writing and checks, then store the result as the next version. */
export async function runProposal(proposalId: number, stillWanted: () => boolean) {
  const p = (await query<any>('SELECT id, screening_id, template_id, template_choice, created_by FROM proposals WHERE id=?', [proposalId]))[0];
  const f = await loadFacts(p.screening_id);
  if (!f.sender.name || f.projects.length < 1) throw new Error('missing_inputs');
  await exec('UPDATE proposals SET profile_id=? WHERE id=?', [f.profileId, proposalId]); // the profile this text is signed with
  const stage = (st: string) => setStage(proposalId, st);
  // the first automatic write can use the early draft; a rewrite or a chosen template always writes again
  const firstWrite = p.template_choice === 'auto' && !(await query<any>('SELECT 1 FROM proposal_versions WHERE proposal_id=? LIMIT 1', [proposalId])).length;
  const early = firstWrite && f.profileId ? await takeEarlyDraft(p.screening_id, { projectIds: f.projectIds, profileId: f.profileId }, () => stage('writing')) : null;
  const saveTemplate = (t: Draft['template']) => exec('UPDATE proposals SET template_id=?, template_name=?, template_score=?, template_choice=?, template_ranking=? WHERE id=?',
    [t.id, t.name, t.score, t.choice, t.ranking, proposalId]).then(() => undefined);
  const d = early ?? await compose(p.screening_id, f, { templateId: p.template_choice === 'manual' ? p.template_id : null, stillWanted, stage, onTemplate: saveTemplate });
  if (!d || !stillWanted()) return;
  if (early) await saveTemplate(d.template);
  await addVersion(proposalId, textToHtml(d.text), 'ai', null, `Written with "${d.template.name}"${early ? ' (drafted early)' : ''}`, null);
  await exec(`UPDATE proposals SET status='done', stage=NULL, warnings=?, model=?, error_code=NULL, error_message=NULL, finished_at=NOW() WHERE id=?`, [JSON.stringify(d.warnings), d.model, proposalId]);
}

/** One chat turn: answer, and revise the proposal when asked. The revision becomes a new version and never replaces the person's own text silently. */
export async function runChat(messageId: number) {
  const m = (await query<any>('SELECT id, proposal_id, content, user_id FROM proposal_messages WHERE id=?', [messageId]))[0];
  const p = (await query<any>('SELECT id, screening_id, template_id FROM proposals WHERE id=?', [m.proposal_id]))[0];
  const cur = (await query<any>('SELECT version_no, content_html FROM proposal_versions WHERE proposal_id=? ORDER BY version_no DESC LIMIT 1', [p.id]))[0];
  if (!cur) throw new Error('no_version');
  const f = await loadFacts(p.screening_id);
  const detected = await storedSignals(p.screening_id);
  const template = p.template_id ? await loadTemplate(p.template_id) : null;
  const history = await query<any>(`SELECT role, content FROM proposal_messages WHERE proposal_id=? AND status='done' AND id<? ORDER BY id DESC LIMIT 12`, [p.id, m.id]);
  const transcript = history.reverse().map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
  const basedOn = Number(cur.version_no);
  const r = await run({ label: 'chat', system: chatSystem({ template, detected, sender: f.sender, projects: f.projects, clientRequirements: f.requirements, currentProposal: htmlToPlain(cur.content_html) }),
    prompt: `${transcript ? 'EARLIER MESSAGES\n' + transcript + '\n\n' : ''}USER REQUEST\n${m.content}\n\n<job_page>\n${f.jobText}\n</job_page>`, schema: chatSchema, timeoutMs: config.llm.timeoutMs });
  const parsed = chatOut.safeParse(r.data);
  if (!parsed.success) throw new Error('invalid_output');
  let resultVersion: number | null = null;
  const revised = parsed.data.proposal?.trim();
  if (revised && revised.replace(/\s+/g, ' ') !== htmlToPlain(cur.content_html).replace(/\s+/g, ' ')) {
    const latest = (await query<any>('SELECT MAX(version_no) AS n FROM proposal_versions WHERE proposal_id=?', [p.id]))[0].n;
    const note = Number(latest) > basedOn ? `AI revision of v${basedOn}; v${latest} was saved meanwhile` : `AI revision of v${basedOn}`;
    resultVersion = await addVersion(p.id, textToHtml(revised), 'chat', null, note, basedOn);
    const library = (await query<any>('SELECT name FROM projects')).map((x) => x.name as string);
    const warnings = checkProposal({ text: revised, selectedProjects: f.projects.map((x) => ({ name: x.name, live_link: x.live_link, notes: x.notes })), otherProjectNames: library, foreignNames: await foreignNames(),
      sender: { name: f.sender.name, gitlab_link: f.sender.gitlab_link } }).map((t) => ({ source: 'check', text: t }));
    await exec('UPDATE proposals SET warnings=? WHERE id=?', [JSON.stringify(warnings), p.id]);
  }
  await exec(`INSERT INTO proposal_messages (proposal_id, role, content, status, based_on_version, result_version) VALUES (?, 'assistant', ?, 'done', ?, ?)`, [p.id, parsed.data.reply.slice(0, 4000), basedOn, resultVersion]);
  await exec(`UPDATE proposal_messages SET status='done', based_on_version=?, result_version=? WHERE id=?`, [basedOn, resultVersion, m.id]);
}
