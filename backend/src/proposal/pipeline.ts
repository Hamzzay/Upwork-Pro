import { separateQuestions, jobQuestions } from '../screening/questions';
import { config } from '../config';
import { cached } from '../cache';
import { getSettings } from '../settings';
import { exec, pool, query, withRetry } from '../db';
import { htmlToPlain, textToHtml } from '../html';
import { run } from '../llm';
import { lastUsed } from '../llm/context';
import { checkOpening, checkProposal } from './checks';
import { bannedPatterns, loadGuide, typeFacts, wordRange } from './guide';
import { rankTemplates } from './rank';
import { finalScore, reviewOut, reviewSchemaFor, reviewerSystem, type ReviewerExample, type ReviewerSections } from './reviewer';
import { activeReviewer } from './reviewer_store';
import { pickLoom } from '../screening/matching';
import { docsBlock, postOnly } from '../screening/attachments';
import { jobPostOnly } from '../screening/posting';
import { checkFlags, openingInUse, openingTemplate } from './opening_templates';
import { activeShortcuts, shortenHtml, shortenText } from './shortcuts';
import { buildDetectionSchema, detectionPrompt, normalizeDetection, type DetectedValue, type SignalDef } from './signals';
import { chatOut, chatSchema, chatSystem, GUARDRAILS, writerOut, writerSchemaWithAnswers, questionsPrompt, writerSchema, writerSystem, type ProjectFact, type SenderFact, type TemplateFact } from './writer';
import { answersText, separate, splitText, storeAnswers, type QA } from './answers';
import { assemble, cleanLetter, loomLine, partsOut, partsSchema, proofFor, proofOut, proofSchema, signoff, type Parts, type ProofBlock } from './parts';


export const loadSignalDefs = () => cached('signals', readSignalDefs);
async function readSignalDefs(): Promise<{ defs: SignalDef[]; layers: { code: string; intro: string | null; rule: string | null }[] }> {
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

export async function loadFacts(screeningId: number, basis?: Basis) {
  const s = (await query<any>('SELECT s.job_text, s.raw_input, s.report_json, s.proposal_profile_id, s.loom_video_id, s.posting_json FROM screenings s WHERE s.id=?', [screeningId]))[0];
  // the Loom video the person chose for this proposal; an early draft (a guess) never has one
  const loom = !basis && s.loom_video_id ? (await query<any>('SELECT title, url, topic FROM loom_videos WHERE id=?', [s.loom_video_id]))[0] ?? null : null;
  const profileId: number | null = basis ? basis.profileId : s.proposal_profile_id;
  const pr = profileId ? (await query<any>('SELECT name, tagline, gitlab_account, github_url, voice, signature, stats_allowed, rules, certifications FROM upwork_profiles WHERE id=?', [profileId]))[0] ?? {} : {};
  const matches = await query<any>(
    `SELECT jm.project_id, jm.project_name, p.live_link, p.notes, p.overview, p.case_study_summary FROM job_matches jm LEFT JOIN projects p ON p.id=jm.project_id
     WHERE jm.screening_id=? AND ${basis ? 'jm.project_id IN (?)' : 'jm.selected=1'} ORDER BY jm.rank_no`, basis ? [screeningId, basis.projectIds] : [screeningId]);
  const ids = matches.map((m) => m.project_id).filter(Boolean);
  const tags = ids.length ? await query<any>('SELECT pt.project_id, t.name FROM project_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.project_id IN (?) ORDER BY t.sort_order', [ids]) : [];
  const inds = ids.length ? await query<any>('SELECT pi.project_id, i.name FROM project_industries pi JOIN industries i ON i.id=pi.industry_id WHERE pi.project_id IN (?) ORDER BY i.name', [ids]) : [];
  const projects: ProjectFact[] = matches.map((m) => ({ id: m.project_id ?? null, name: m.project_name, live_link: m.live_link || null, notes: m.notes || null, overview: m.overview || null, case_study: m.case_study_summary || null,
    tags: tags.filter((t) => t.project_id === m.project_id).map((t) => t.name), industries: inds.filter((t) => t.project_id === m.project_id).map((t) => t.name) }));
  const sender: SenderFact = { name: pr.name, gitlab_link: gitlabLink(pr.gitlab_account) || pr.github_url || null, tagline: pr.tagline || null,
    voice: pr.voice || null, signature: pr.signature || null, stats: pr.stats_allowed || null, rules: pr.rules || null, certifications: pr.certifications || null,
    loom: loom ? { title: loom.title, url: loom.url, topic: loom.topic || null } : null };
  let report: any = null; try { report = JSON.parse(s.report_json); } catch { /* old or missing */ }
  const job = report?.job ?? report?.jobs?.[0] ?? null;
  const requirements: string[] = [];
  // R109: a note about the job's weekly hours comes from Upwork's terms box, not the description: the proposal never repeats it
  for (const n of job?.proposal_notes ?? []) if (n && !/^mock provider/i.test(n) && !/hrs?\/week|hours? (per|a) week|\d+\+?\s*hours? weekly|\b(full|part)[- ]time (role|position|hours)/i.test(n)) requirements.push(String(n));
  const passOn = new Set((await getSettings())['writer.requirement_rules']); // flags the writer must treat as client requirements (admin setting)
  for (const f of job?.flags ?? []) if (passOn.has(f.code)) requirements.push(`${f.rule}: ${f.value}`);
  // experience the sender confirmed on the proposal page (R67): true, and it wins over any screening note that it cannot be claimed
  const confirmed = await query<any>(`SELECT g.skill, g.note, (SELECT GROUP_CONCAT(pr.name ORDER BY gp.id SEPARATOR ', ') FROM proposal_gap_projects gp JOIN projects pr ON pr.id=gp.project_id WHERE gp.gap_id=g.id) AS project_name FROM proposal_gaps g JOIN proposals p ON p.id=g.proposal_id
    WHERE p.screening_id=? AND g.status='yes' ORDER BY g.id`, [screeningId]);
  if (confirmed.length) requirements.push(`CONFIRMED BY THE SENDER after the screening (true; it overrides any screening note above that it cannot be claimed or answered): ${confirmed.map((c) => `${c.skill}${c.project_name ? ' (in ' + c.project_name + ')' : ''}${c.note ? ': ' + c.note : ''}`).join('; ')}.`);
  let posting: any = null; try { posting = s.posting_json ? JSON.parse(s.posting_json) : null; } catch { /* none */ }
  const page = (s.job_text ?? s.raw_input) as string;
  // R106: the writer reads the job only, never the client's history, reviews or other jobs on the same page
  const post = jobPostOnly(page, posting);
  // Upwork's separate questions: answered apart from the cover letter, and the letter is written from the job without them
  const questions = jobQuestions(page, posting);
  // the client's attached documents (R74) follow the post everywhere the AI reads it
  const docs = await docsBlock(screeningId);
  return { jobText: post + docs, jobOnly: separateQuestions(post).jobOnly + docs, questions, sender, projects, requirements, profileId, projectIds: ids as number[], loomId: loom ? (s.loom_video_id as number) : null };
}

export async function loadTemplate(id: number): Promise<(TemplateFact & { id: number }) | null> {
  const t = (await query<any>('SELECT id, name, body_html, prompt, opening_rules, opening_no_us, opening_starts, default_opening_id FROM templates WHERE id=?', [id]))[0];
  return t ? { id: t.id, name: t.name, body_html: t.body_html, prompt: t.prompt, opening: await openingTemplate(t.default_opening_id), opening_rules: t.opening_rules, opening_no_us: !!t.opening_no_us, opening_starts: t.opening_starts } : null;
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
/** The newest version of a proposal, as its letter and its answers apart. */
export async function latestVersion(proposalId: number): Promise<{ version_no: number; html: string; answers: QA[]; parts: Parts | null } | null> {
  const v = (await query<any>('SELECT version_no, content_html, answers_json, parts_json FROM proposal_versions WHERE proposal_id=? ORDER BY version_no DESC LIMIT 1', [proposalId]))[0];
  return v ? { version_no: Number(v.version_no), ...separate(v.content_html, v.answers_json), parts: readParts(v.parts_json) } : null;
}
/** A version's parts (PLAN-SPEED point 1), or null when its text was edited by hand or by the chat. */
export function readParts(json: string | null | undefined): Parts | null {
  if (!json) return null;
  try { const p = JSON.parse(json); return p && typeof p.letter === 'string' && Array.isArray(p.proof) ? p as Parts : null; } catch { return null; }
}
/**
 * A new version. `answers` left out: the newest version's screening answers are carried over, so editing the letter never loses them.
 * `parts` is given only when the text was put together from parts; a version without parts is the person's (or the chat's) text.
 */
export async function addVersion(proposalId: number, html: string, source: 'ai' | 'manual' | 'chat' | 'restore', userId: number | null, note: string | null, basedOn: number | null, answers?: QA[] | null, parts?: Parts | null) {
  if (answers === undefined) answers = (await latestVersion(proposalId))?.answers ?? null;
  // R92: what the AI writes uses the short words; a person's own edits and a restored version stay as they were
  if (source === 'ai' || source === 'chat') {
    const sc = await activeShortcuts();
    if (sc.length) { html = shortenHtml(html, sc); if (answers) answers = answers.map((a) => ({ ...a, answer: shortenText(a.answer, sc) })); if (parts) parts = { ...parts, letter: shortenText(parts.letter, sc) }; }
  }
  return withRetry(async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const no = await nextVersion(conn, proposalId);
      await conn.query('INSERT INTO proposal_versions (proposal_id, version_no, content_html, answers_json, parts_json, source, note, based_on_version, created_by) VALUES (?,?,?,?,?,?,?,?,?)', [proposalId, no, html, storeAnswers(answers), parts ? JSON.stringify(parts) : null, source, note, basedOn, userId]);
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
  const docs = await docsBlock(screeningId); // the client's attached documents are part of the job (R74)
  const answers = await Promise.all(layers.map(async (layer) => {
    const mine = defs.filter((d) => d.layer === layer.code);
    if (!mine.length) return [];
    // the signals come from the job alone: Upwork's separate questions section is left out
    const r = await run({ label: 'signals: ' + layer.code, system: detectionPrompt(mine, [layer]), prompt: `<job_page>\n${separateQuestions(postOnly(jobText)).jobOnly}${docs}\n</job_page>`, schema: buildDetectionSchema(mine), timeoutMs: config.llm.timeoutMs });
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
      if (detected.length) await conn.query(`INSERT INTO job_signals (screening_id, signal_id, signal_number, signal_name, value_id, value_name, is_fallback, is_primary, confidence, evidence, reason, move_text) VALUES ?`, // one statement for all
        [detected.map((d) => [screeningId, d.signal_id, d.signal_number, d.signal_name, d.value_id, d.value_name, d.is_fallback ? 1 : 0, d.is_primary ? 1 : 0, d.confidence, d.evidence || null, d.reason || null, d.move])]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  });
  return detected;
}

/** The active proposal types ranked for a job's signals, each with the signals it matched in words. One ranking for the chooser and the writer. */
async function rankTypes(detected: DetectedValue[]) {
  const tpls = await query<any>('SELECT id, name, priority, is_default FROM templates WHERE active=1');
  const maps = await query<any>('SELECT template_id, signal_id, value_id, weight, role, req_group FROM template_signals');
  const ranked = rankTemplates(detected.map((d) => ({ signal_id: d.signal_id, value_id: d.value_id, is_fallback: d.is_fallback })),
    tpls.map((t) => ({ id: t.id, name: t.name, priority: t.priority, is_default: !!t.is_default,
      mappings: maps.filter((m) => m.template_id === t.id).map((m) => ({ signal_id: m.signal_id, value_id: m.value_id, weight: m.weight, role: m.role, req_group: m.req_group })) })));
  const sigLabel = new Map(detected.map((d) => [`${d.signal_id}:${d.value_id}`, `${d.signal_name}: ${d.value_name}`]));
  const sigOnly = new Map(detected.map((d) => [d.signal_id, `${d.signal_name}: ${d.value_name}`]));
  const lbl = (m: { signal_id: number; value_id: number | null }) => (m.value_id ? sigLabel.get(`${m.signal_id}:${m.value_id}`) : sigOnly.get(m.signal_id)) ?? 'signal';
  const items = ranked.ranking.map((r) => ({ id: r.id, name: r.name, score: r.score, rank: r.rank, qualified: r.qualified,
    matched: r.matched.map((m) => ({ label: lbl(m), weight: m.weight, role: m.role })), excluded_by: r.excluded_by.map((m) => lbl(m)) }));
  return { ...ranked, items };
}
/**
 * What the person chooses from before a proposal is written: every active type, best fit first. `ready` is false while the
 * job's signals are still being read (the types then come in their own order, unranked, and can still be chosen).
 */
/** Does the job post ask for a video? Loom by name, or a recorded / intro video. */
export const asksForVideo = (jobText: string) => /\bloom\b|\b(video|screen)\s*(intro(duction)?|message|recording|response|proposal|walk-?through|cover letter)\b|\b(record|send|share|include|attach)\w*\s+(us\s+|me\s+)?(a\s+)?(short\s+|quick\s+|brief\s+)?(\d+\s*-?\s*(min(ute)?s?|sec(ond)?s?)\s+)?video\b/i.test(jobText);
export async function loomChoices(screeningId: number) {
  const s = (await query<any>('SELECT job_text, raw_input, proposal_profile_id, loom_video_id FROM screenings WHERE id=?', [screeningId]))[0];
  if (!s?.proposal_profile_id) return { asked: false, chosen: null, videos: [] };
  const vids = await query<any>('SELECT id, title, url, topic, sort_order FROM loom_videos WHERE profile_id=? AND (active=1 OR id=?) ORDER BY sort_order, title', [s.proposal_profile_id, s.loom_video_id ?? 0]);
  const vt = vids.length ? await query<any>('SELECT lt.video_id, t.name FROM loom_video_tags lt JOIN tags t ON t.id=lt.tag_id WHERE lt.video_id IN (?)', [vids.map((v) => v.id)]) : [];
  const jobTags = await query<any>('SELECT tag_name AS name, weight FROM job_tags WHERE screening_id=?', [screeningId]);
  const best = pickLoom(jobTags, vids.map((v) => ({ ...v, tags: vt.filter((x) => x.video_id === v.id).map((x) => x.name) })));
  return { asked: asksForVideo(String(s.job_text ?? s.raw_input ?? '')), chosen: s.loom_video_id ?? null,
    videos: vids.map((v) => ({ id: v.id, title: v.title, url: v.url, topic: v.topic, best: !!best && best.video.id === v.id, shared: best && best.video.id === v.id ? best.shared : [] })) };
}

export async function typeChoices(screeningId: number) {
  const detected = await storedSignals(screeningId);
  const facts = new Map((await query<any>(`SELECT t.id, t.description, t.body_html, t.is_default, t.priority,
      (SELECT COUNT(*) FROM template_samples s WHERE s.template_id=t.id AND s.active=1) AS samples FROM templates t WHERE t.active=1`)).map((t) => [t.id, t]));
  const about = (id: number) => { const t = facts.get(id); const f = typeFacts(htmlToPlain(t?.body_html ?? '') || t?.description || ''); return { chosen_when: f.chosen_when, length: f.length, samples: Number(t?.samples ?? 0) }; };
  if (!detected.length) {
    const list = [...facts.values()].sort((a, b) => a.priority - b.priority || String(a.id).localeCompare(String(b.id)));
    const names = new Map((await query<any>('SELECT id, name FROM templates WHERE active=1')).map((t) => [t.id, t.name]));
    return { ready: false, defaulted: false, types: list.map((t, i) => ({ id: t.id, name: names.get(t.id), rank: i + 1, score: 0, qualified: false, suggested: false, matched: [], excluded_by: [], ...about(t.id) })) };
  }
  const r = await rankTypes(detected);
  const missing = new Map(r.ranking.map((x) => [x.id, x.missing_groups]));
  // the order to offer them in: the suggestion, the other types that fit, then the near fits (the default type first, then the
  // fewest required signals missing, then the most matched), and last the types the job's signals rule out
  const group = (x: { id: number; qualified: boolean; excluded_by: string[] }) => (r.chosen && x.id === r.chosen.id ? 0 : x.qualified ? 1 : x.excluded_by.length ? 3 : 2);
  const types = r.items.map((x) => ({ ...x, suggested: !!r.chosen && x.id === r.chosen.id, ruled_out: x.excluded_by.length > 0, is_default: !!facts.get(x.id)?.is_default, missing: missing.get(x.id) ?? 0, ...about(x.id) }))
    .sort((a, b) => group(a) - group(b) || (group(a) === 2 ? Number(b.is_default) - Number(a.is_default) || a.missing - b.missing || b.matched.length - a.matched.length : 0) || a.rank - b.rank);
  return { ready: true, defaulted: r.defaulted, types };
}
/** The type the signals pick for a job, or null while they are not read yet. */
export async function suggestedTypeId(screeningId: number): Promise<number | null> {
  const detected = await storedSignals(screeningId);
  return detected.length ? (await rankTypes(detected)).chosen?.id ?? null : null;
}

type Facts = Awaited<ReturnType<typeof loadFacts>>;
/** `text` is the cover letter only; `answers` the screening answers apart (missing in early drafts written before R59: then they are in `text`). */
export interface Gap { skill: string; ask: string; quote: string; category: string }
interface Draft { template: { id: number; name: string; score: number; choice: 'auto' | 'manual'; ranking: string }; text: string; answers?: QA[]; parts?: Parts | null; gaps?: Gap[]; warnings: { source: string; text: string }[]; model: string }

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
  const ranked = await rankTypes(detected);
  if (!ranked.chosen) throw new Error('no_template');
  let chosen = ranked.chosen; let choice: 'auto' | 'manual' = 'auto';
  if (opts.templateId) { const m = ranked.ranking.find((x) => x.id === opts.templateId); if (m) { chosen = m; choice = 'manual'; } }
  const ranking = JSON.stringify({ defaulted: ranked.defaulted && choice === 'auto', items: ranked.items });
  if (opts.onTemplate) await opts.onTemplate({ id: chosen.id, name: chosen.name, score: chosen.score, choice, ranking });
  if (!opts.stillWanted()) return null;
  const template = (await loadTemplate(chosen.id))!;

  // 3. write
  await stage('writing');
  // the type's own samples; a type without any borrows the shared ones (tone only), so the writer always has an example
  let sampleRows = await query<any>('SELECT title, content FROM template_samples WHERE template_id=? AND active=1 ORDER BY id LIMIT 3', [chosen.id]);
  if (!sampleRows.length) sampleRows = await query<any>('SELECT s.title, s.content FROM template_samples s JOIN templates t ON t.id=s.template_id WHERE s.active=1 AND t.active=1 ORDER BY s.id LIMIT 3');
  const samples = sampleRows.map((s) => ({ title: s.title, content: s.content }));
  const guide = await loadGuide();
  const requirements = [...f.requirements];
  const cfg = await getSettings();
  const ss = cfg['writer.structured_signal']; // which signal value means "answer in the post's own structure" (admin setting)
  const structured = detected.find((d) => d.signal_number === ss.signal && d.value_name.trim().toLowerCase() === ss.value.trim().toLowerCase());
  if (structured) requirements.push('The post demands a structured submission: follow its structure exactly, first, before anything else.');
  // in parts (PLAN-SPEED point 1), except a structured submission: the client's own structure is written whole
  const inParts = !structured;
  const gapCategories = (await query<any>('SELECT name FROM tag_categories WHERE name<>? ORDER BY sort_order, name', ['Industry'])).map((r) => r.name as string);
  const system = writerSystem({ template, detected, samples, sender: f.sender, projects: f.projects, clientRequirements: requirements, guide, parts: inParts, gapCategories });
  const jobPart = f.questions.length ? `<job_page>\n${f.jobOnly}\n</job_page>\n\n${questionsPrompt(f.questions)}` : `<job_page>\n${f.jobText}\n</job_page>`;
  const w = await run({ label: 'writing', system, prompt: `${jobPart}\n\nWrite the proposal now.`,
    schema: inParts ? partsSchema(f.questions.length) : f.questions.length ? writerSchemaWithAnswers(f.questions.length) : writerSchema, timeoutMs: config.llm.timeoutMs });
  await stage('checking'); // R97: the letter is in; its parts, proof and checks are next (shown on the page as a step)
  const pair = (qs: string[], a: string[] = []): QA[] => qs.map((q, i) => ({ question: q, answer: String(a[i] ?? '').trim() }));
  let answers: QA[] = [];
  let writerWarnings: string[] = [];
  let parts: Parts | null = null;
  let gaps: Gap[] = [];
  let text: string;
  if (inParts) {
    const po = partsOut.safeParse(w.data);
    if (!po.success) throw new Error('invalid_output');
    writerWarnings = po.data.warnings;
    gaps = po.data.gaps ?? [];
    if (f.questions.length) answers = pair(f.questions, po.data.screening_answers);
    // each chosen project's block, by its name; a block the writer left out is written on its own
    const written = new Map(po.data.proof.map((x) => [x.project.trim().toLowerCase(), x.text]));
    const proof: ProofBlock[] = [];
    for (const [i, p] of f.projects.entries()) {
      const t = written.get(p.name.toLowerCase()) ?? po.data.proof[i]?.text ?? null;
      proof.push({ project_id: p.id ?? null, name: p.name, link: p.live_link, text: t ?? (await writeProof(f, template, p)) });
    }
    parts = { letter: cleanLetter(po.data.letter), proof, loom: f.sender.loom ? { id: f.loomId, title: f.sender.loom.title, url: f.sender.loom.url } : null, profile_id: f.profileId, signoff: signoff(f.sender) };
    text = assembleParts(parts, cfg['writer.loom_line']);
  } else {
    const parsed = writerOut.safeParse(w.data);
    if (!parsed.success) throw new Error('invalid_output');
    writerWarnings = parsed.data.warnings;
    gaps = parsed.data.gaps ?? [];
    text = splitText(parsed.data.proposal).letter; // a stray "Screening answers" section the model added is cut off
    if (f.questions.length) answers = pair(f.questions, parsed.data.screening_answers);
  }

  // 3b. the first two lines, strictly (PLAN-SPEED point 5): when they break the type's opening rules, only the opening paragraph
  // is written again (a short call), never the whole proposal; anything still wrong is a warning
  const clientOpening = requirements.some((r) => /\b(open(ing)?|start|begin)\w*\b.*\b(with|word|phrase|line)\b/i.test(r));
  const allNames = (await query<any>('SELECT name FROM projects')).map((r) => r.name as string);
  // the check follows the opening template's own exceptions (R88): first words, a greeting, talking about us
  const flags = checkFlags(template.opening ?? null, template);
  const invite = flags.invite;
  const opening = (t: string) => template.opening || template.opening_rules || guide.opening ? checkOpening(t, { noUs: flags.noUs, starts: flags.starts, projectNames: allNames, invite, clientOpening }) : [];
  let openingIssues = opening(text);
  if (openingIssues.length && opts.stillWanted()) {
    await stage('writing');
    const base = parts ? parts.letter : text;
    const fixed = await rewriteOpening(system, jobPart, base, openingIssues, invite).catch(() => null);
    if (fixed) {
      const nextText = parts ? assembleParts({ ...parts, letter: fixed }, cfg['writer.loom_line']) : fixed;
      const left = opening(nextText);
      if (left.length < openingIssues.length) { text = nextText; if (parts) parts.letter = fixed; openingIssues = left; }
    }
  }
  if (!opts.stillWanted()) return null;

  // 4. check what the writer cannot be trusted to check
  const warnings = [...openingIssues.map((x) => ({ source: 'check', text: `First two lines: ${x}. Rewrite them before sending; Upwork shows them in the preview.` })), ...writerWarnings.map((t) => ({ source: 'writer', text: t })),
    ...(await checksFor(text, f, template, guide, allNames))];
  return { template: { id: chosen.id, name: chosen.name, score: chosen.score, choice, ranking }, text, answers, parts, gaps, warnings, model: lastUsed()?.model ?? config.llm.model };
}

/** The automatic checks of a finished text. */
async function checksFor(text: string, f: Facts, template: TemplateFact | null, guide: Awaited<ReturnType<typeof loadGuide>>, library?: string[]) {
  const names = library ?? (await query<any>('SELECT name FROM projects')).map((r) => r.name as string);
  return checkProposal({ text, selectedProjects: f.projects.map((x) => ({ name: x.name, live_link: x.live_link, notes: [x.notes, x.overview, x.case_study, f.sender.stats].filter(Boolean).join(' ') || null })), otherProjectNames: names, foreignNames: await foreignNames(),
    sender: { name: f.sender.name, gitlab_link: f.sender.gitlab_link, loom_link: f.sender.loom?.url ?? null }, banned: bannedPatterns(guide.banned), wordRange: template ? wordRange(htmlToPlain(template.body_html)) : null }).map((t) => ({ source: 'check', text: t }));
}

/** The parts put together, with the Loom line in the admin's wording. */
export const assembleParts = (p: Parts, loomTemplate: string) => assemble({ letter: p.letter, proof: p.proof, loomLine: loomLine(loomTemplate, p.loom), signoff: p.signoff });

/** One project's proof block, written on its own: a short call, for a project added after the proposal was written. */
async function writeProof(f: Facts, template: TemplateFact, p: ProjectFact): Promise<string> {
  const r = await run({ label: 'writing: project', timeoutMs: config.llm.timeoutMs, schema: proofSchema,
    system: [GUARDRAILS, '', `PROPOSAL TYPE: ${template.name}\n${htmlToPlain(template.body_html)}`, '', `SENDER: ${f.sender.name}${f.sender.voice ? '. Voice: ' + f.sender.voice : ''}`, '',
      `THE PROJECT\n  Name: ${p.name}\n  Tags: ${p.tags.join(', ') || '(none)'}\n  Industries: ${p.industries.join(', ') || '(none)'}${p.overview ? '\n  Overview: ' + p.overview : ''}${p.case_study ? '\n  Case study: ' + p.case_study : ''}${p.notes ? '\n  Notes: ' + p.notes : ''}`].join('\n'),
    prompt: `<job_page>\n${f.jobOnly || f.jobText}\n</job_page>\n\nWrite how this proposal shows the project, in the type's format: its name, then one or two sentences on what it proves for THIS job, from its facts only. No link (it is added after). Answer in "text".` });
  const o = proofOut.safeParse(r.data);
  return o.success ? o.data.text.trim() : p.name;
}

/** The opening paragraph written again to follow the FIRST TWO LINES rules; the rest of the proposal is kept word for word. */
async function rewriteOpening(system: string, jobPart: string, letter: string, issues: string[], invite: boolean): Promise<string | null> {
  const paras = letter.split(/\n{2,}/);
  const at = invite && paras.length > 1 && /^(hi|hello|hey)\b/i.test(paras[0].trim()) && paras[0].length < 80 ? 1 : 0; // an invite's greeting stays
  const r = await run({ label: 'writing: first two lines', system, timeoutMs: config.llm.timeoutMs,
    schema: { type: 'object', properties: { paragraph: { type: 'string' } }, required: ['paragraph'], additionalProperties: false },
    prompt: `${jobPart}\n\nTHE OPENING PARAGRAPH OF YOUR DRAFT\n${paras[at]}\n\nIts first two lines break the FIRST TWO LINES rules: they ${issues.join('; ')}. Write this one paragraph again so its first two lines follow every FIRST TWO LINES rule, keeping what the rest of it says. Use only what the client's job description says: never the job's terms (hours per week, budget, rate, length). Answer with the paragraph only, in "paragraph". Never name a project or add a link.` });
  const para = String((r.data as any)?.paragraph ?? '').trim();
  if (!para) return null;
  paras[at] = para;
  return paras.join('\n\n');
}

/**
 * A proposal made from parts, brought up to date with what the job has now: the chosen projects (a kept block stays, a new
 * project's block is written, a removed one goes), the Loom video and the profile's sign off. The letter is never touched.
 */
export async function refitParts(f: Facts, parts: Parts, template: TemplateFact | null): Promise<{ parts: Parts; text: string; wrote: string[] }> {
  const cfg = await getSettings();
  const want = f.projects.map((p) => ({ id: p.id ?? 0, name: p.name, link: p.live_link }));
  const { keep } = proofFor(parts.proof, want);
  const wrote: string[] = [];
  const proof: ProofBlock[] = await Promise.all(f.projects.map(async (p) => {
    const k = keep.find((x) => x.name === p.name);
    if (k) return k;
    wrote.push(p.name);
    const t = template ? await writeProof(f, template, p) : p.name;
    return { project_id: p.id ?? null, name: p.name, link: p.live_link, text: t };
  }));
  const next: Parts = { ...parts, proof, loom: f.sender.loom ? { id: f.loomId, title: f.sender.loom.title, url: f.sender.loom.url } : null, profile_id: f.profileId, signoff: signoff(f.sender) };
  return { parts: next, text: assembleParts(next, cfg['writer.loom_line']), wrote };
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
  // not started yet: the proposal writes its own. Written in parts (PLAN-SPEED point 1), it suits any projects, profile and video:
  // only those parts are redone. An older draft written whole still has to match exactly.
  const skip = await exec(`UPDATE early_drafts SET status='skipped' WHERE screening_id=? AND status='queued'`, [screeningId]);
  if (skip.affectedRows) return null;
  if (row.status === 'running' || earlyInFlight.has(screeningId)) {
    const running = earlyInFlight.get(screeningId);
    if (!running) return null; // running in another process that may be gone: write it here instead
    await onWait();
    await running;
    row = (await query<any>('SELECT status FROM early_drafts WHERE screening_id=?', [screeningId]))[0];
  }
  const done = (await query<any>(`SELECT result_json FROM early_drafts WHERE screening_id=? AND status='done' AND used_at IS NULL`, [screeningId]))[0];
  if (!done) return null;
  const d = JSON.parse(done.result_json) as Draft;
  if (!d.parts && !same) { await exec(`UPDATE early_drafts SET status='skipped' WHERE screening_id=?`, [screeningId]); return null; }
  await exec('UPDATE early_drafts SET used_at=NOW() WHERE screening_id=?', [screeningId]);
  return d;
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
  let early = firstWrite && f.profileId ? await takeEarlyDraft(p.screening_id, { projectIds: f.projectIds, profileId: f.profileId }, () => stage('writing')) : null;
  // the early draft's letter and its proof blocks are kept; the projects, video and sign off are brought up to what was confirmed
  if (early?.parts) {
    await stage('writing');
    const template = await loadTemplate(early.template.id);
    const r = await refitParts(f, early.parts, template);
    const guide = await loadGuide();
    const writer = early.warnings.filter((w) => w.source === 'writer');
    const open = early.warnings.filter((w) => w.source === 'check' && w.text.startsWith('First two lines'));
    early = { ...early, text: r.text, parts: r.parts, warnings: [...open, ...writer, ...(await checksFor(r.text, f, template, guide))] };
  }
  const saveTemplate = (t: Draft['template']) => exec('UPDATE proposals SET template_id=?, template_name=?, template_score=?, template_choice=?, template_ranking=? WHERE id=?',
    [t.id, t.name, t.score, t.choice, t.ranking, proposalId]).then(() => undefined);
  const d = early ?? await compose(p.screening_id, f, { templateId: p.template_choice === 'manual' ? p.template_id : null, stillWanted, stage, onTemplate: saveTemplate });
  if (!d || !stillWanted()) return;
  if (early) await saveTemplate(d.template);
  const written = d.answers ? { letter: d.text, answers: d.answers } : splitText(d.text); // an early draft from before R59 has them in the text
  const versionNo = await addVersion(proposalId, textToHtml(written.letter), 'ai', null, `Written with "${d.template.name}"${early ? ' (drafted early)' : ''}`, null, written.answers, d.parts ?? null);
  await saveGaps(proposalId, p.screening_id, versionNo, d.gaps ?? []);
  // the independent review follows every written proposal by itself (worker.ts picks it up), unless an admin turned that off
  const auto = (await getSettings())['review.auto'];
  await exec(`UPDATE proposals SET status='done', stage=NULL, warnings=?, model=?, error_code=NULL, error_message=NULL, finished_at=NOW(), review_status=IF(?, 'queued', review_status), review_error=IF(?, NULL, review_error), openings_status='queued', openings_json=NULL, openings_error=NULL WHERE id=?`, [JSON.stringify(d.warnings), d.model, auto ? 1 : 0, auto ? 1 : 0, proposalId]);
}

/**
 * The experience gaps of a newly written version (R67). Open gaps of an earlier write are replaced; a gap the person already
 * answered stays answered, and the same skill found again is not asked twice.
 */
export async function saveGaps(proposalId: number, screeningId: number, versionNo: number, gaps: Gap[]) {
  await exec(`DELETE FROM proposal_gaps WHERE proposal_id=? AND status='open'`, [proposalId]);
  const answered = new Set((await query<any>(`SELECT skill FROM proposal_gaps WHERE proposal_id=?`, [proposalId])).map((r) => String(r.skill).toLowerCase()));
  const seen = new Set<string>();
  for (const g of gaps) {
    const key = g.skill.trim().toLowerCase(); if (!key || answered.has(key) || seen.has(key)) continue; seen.add(key);
    await exec('INSERT INTO proposal_gaps (proposal_id, screening_id, version_no, skill, ask, quote, category) VALUES (?,?,?,?,?,?,?)',
      [proposalId, screeningId, versionNo, g.skill.trim().slice(0, 120), g.ask.trim().slice(0, 400), (g.quote || '').trim().slice(0, 400) || null, (g.category || '').trim().slice(0, 120) || null]);
  }
}

/**
 * The proposal brought up to date with the experience the person confirmed (R67). Only the lines about it change, as a new
 * version: a skill confirmed on one of this proposal's projects is explained in that project's block (how it was used there);
 * a skill confirmed as the sender's own experience gets a sentence in the letter. The rest stays word for word.
 */
export async function runGapUpdate(proposalId: number) {
  const p = (await query<any>('SELECT id, screening_id, template_id, warnings FROM proposals WHERE id=?', [proposalId]))[0];
  const cur = p ? await latestVersion(p.id) : null;
  if (!p || !cur) return;
  const yes = await query<any>(`SELECT g.*, (SELECT GROUP_CONCAT(pr.name ORDER BY gp.id SEPARATOR '\x1f') FROM proposal_gap_projects gp JOIN projects pr ON pr.id=gp.project_id WHERE gp.gap_id=g.id) AS project_names
    FROM proposal_gaps g WHERE g.proposal_id=? AND g.status='yes' AND g.applied_version IS NULL`, [p.id]);
  if (!yes.length) { await exec(`UPDATE proposals SET gaps_status='done' WHERE id=?`, [p.id]); return; }
  const f = await loadFacts(p.screening_id); // fresh: the projects' notes now hold what was confirmed
  const template = p.template_id ? await loadTemplate(p.template_id) : null;
  if (!template) throw new Error('no_template');
  const guide = await loadGuide();
  const cfg = await getSettings();
  const detected = await storedSignals(p.screening_id);
  const inParts = !!cur.parts;
  const system = writerSystem({ template, detected, samples: [], sender: f.sender, projects: f.projects, clientRequirements: f.requirements, guide, parts: inParts, gapCategories: [] });
  const inProposal = new Set(f.projects.map((x) => x.name.toLowerCase()));
  // a skill can have been done in several projects (R71): explained in the block of each one this proposal shows; the others are never named
  const confirmed = yes.map((g) => {
    const names: string[] = g.project_names ? String(g.project_names).split('\x1f') : [];
    const shown = names.filter((n) => inProposal.has(String(n).toLowerCase())), other = names.filter((n) => !inProposal.has(String(n).toLowerCase()));
    const how = g.note ? ' (' + g.note + ')' : '';
    if (Number(g.practice)) return `- ${g.skill} (the client asks: ${g.ask}). Part of how the team works on every project${how}: say it once in the letter as how we work, never tied to one project.`; // R102
    return `- ${g.skill} (the client asks: ${g.ask}). ${shown.length ? `Done in ${shown.length === 1 ? 'the project' : 'the projects'} ${shown.join(', ')}, ${shown.length === 1 ? "one of this proposal's projects: explain in that project's block" : "all in this proposal: explain in each of those projects' blocks"}, in one or two sentences, how ${g.skill} was used there${how}.${other.length ? ' It was also done in other projects not shown here: do not name them.' : ''}` : `The sender's own experience${g.note ? ': ' + g.note : ''}. Say it in one sentence in the letter where it fits${other.length ? `; it was done in projects that are not in this proposal, so do not name them` : ''}.`}`;
  }).join('\n');
  const current = inParts
    ? `THE LETTER\n${cur.parts!.letter}\n\nTHE PROJECT BLOCKS\n${cur.parts!.proof.map((b) => `[${b.name}]\n${b.text}`).join('\n\n')}`
    : `THE PROPOSAL\n${htmlToPlain(cur.html)}`;
  const jobPart = f.questions.length ? `<job_page>\n${f.jobOnly}\n</job_page>` : `<job_page>\n${f.jobText}\n</job_page>`;
  const r = await run({ label: 'writing: confirmed experience', system, timeoutMs: config.llm.timeoutMs, schema: inParts ? partsSchema(0) : writerSchema,
    prompt: `${jobPart}\n\nTHE CURRENT PROPOSAL\n${current}\n\nTHE SENDER CONFIRMS THIS EXPERIENCE (it is true: use it)\n${confirmed}\n\nWrite the proposal again with only that added, each where it belongs, and keep every other sentence word for word. Where the proposal answers a question the client asks about one of these (for example "what you built with it"), answer it with the confirmed experience, plainly and specifically. Take out anything that says the sender lacks it, has not done it, or that it would be new. ${inParts ? 'Return the whole letter (with its [[PROOF]] and [[VIDEO]] lines where they are) and every project block, in the same order; "gaps" an empty list.' : 'Return the whole proposal; "gaps" an empty list.'}` });
  let parts: Parts | null = null, text: string;
  if (inParts) {
    const o = partsOut.safeParse(r.data); if (!o.success) throw new Error('invalid_output');
    const byName = new Map(o.data.proof.map((x) => [x.project.trim().toLowerCase(), x.text]));
    parts = { ...cur.parts!, letter: cleanLetter(o.data.letter), proof: cur.parts!.proof.map((b, i) => ({ ...b, text: byName.get(b.name.toLowerCase()) ?? o.data.proof[i]?.text ?? b.text })) };
    text = assembleParts(parts, cfg['writer.loom_line']);
  } else {
    const o = writerOut.safeParse(r.data); if (!o.success) throw new Error('invalid_output');
    text = splitText(o.data.proposal).letter;
  }
  const no = await addVersion(p.id, textToHtml(text), 'ai', null, `Updated with your experience: ${yes.map((g) => g.skill).join(', ')}`, cur.version_no, undefined, parts);
  await exec(`UPDATE proposal_gaps SET applied_version=? WHERE id IN (?)`, [no, yes.map((g) => g.id)]);
  let old: { source: string; text: string }[] = []; try { old = JSON.parse(p.warnings || '[]'); } catch { old = []; }
  const kept = old.filter((w) => w.source === 'writer' && !yes.some((g) => w.text.toLowerCase().includes(String(g.skill).toLowerCase())));
  await exec(`UPDATE proposals SET warnings=?, gaps_status='done', review_status=IF(?, 'queued', review_status) WHERE id=?`,
    [JSON.stringify([...kept, ...(await checksFor(text, f, template, guide))]), cfg['review.auto'] ? 1 : 0, p.id]);
}

/** Bring a written proposal up to date after its projects, profile or video changed (PLAN-SPEED point 1). Nothing to do: nothing queued. */
export async function queueParts(screeningId: number) {
  await exec(`UPDATE proposals SET parts_status='queued', parts_error=NULL WHERE screening_id=? AND status='done' AND EXISTS (SELECT 1 FROM proposal_versions v WHERE v.proposal_id=proposals.id)`, [screeningId]);
}
/**
 * The worker job behind queueParts. A version made from parts gets a new version with only the changed parts redone. A version
 * the person edited by hand is never overwritten: the new parts are offered beside the editor instead (Put it in, Copy).
 */
export async function runPartsRefresh(proposalId: number) {
  const p = (await query<any>('SELECT id, screening_id, template_id, warnings FROM proposals WHERE id=?', [proposalId]))[0];
  const cur = p ? await latestVersion(p.id) : null;
  if (!p || !cur) return;
  const f = await loadFacts(p.screening_id);
  const template = p.template_id ? await loadTemplate(p.template_id) : null;
  const cfg = await getSettings();
  if (cur.parts) {
    const r = await refitParts(f, cur.parts, template);
    const before = htmlToPlain(cur.html).replace(/\s+/g, ' ').trim();
    if (r.text.replace(/\s+/g, ' ').trim() !== before) {
      const what = [r.wrote.length || r.parts.proof.length !== cur.parts.proof.length || r.parts.proof.some((x, i) => x.name !== cur.parts!.proof[i]?.name) ? 'the projects' : '',
        (r.parts.loom?.url ?? null) !== (cur.parts.loom?.url ?? null) ? 'the video' : '', r.parts.signoff !== cur.parts.signoff ? 'the sign off' : ''].filter(Boolean);
      await addVersion(p.id, textToHtml(r.text), 'ai', null, `Updated ${what.join(', ') || 'the parts'}`, cur.version_no, undefined, r.parts);
      let old: { source: string; text: string }[] = []; try { old = JSON.parse(p.warnings || '[]'); } catch { old = []; }
      const kept = old.filter((w) => w.source === 'writer' || w.text.startsWith('First two lines'));
      const auto = cfg['review.auto'];
      await exec(`UPDATE proposals SET warnings=?, profile_id=?, review_status=IF(?, 'queued', review_status) WHERE id=?`, [JSON.stringify([...kept, ...(await checksFor(r.text, f, template, await loadGuide()))]), f.profileId, auto ? 1 : 0, p.id]);
    }
    await exec(`UPDATE proposals SET parts_status='done', parts_offer_json=NULL WHERE id=?`, [p.id]);
    return;
  }
  // edited by hand: offer what the text does not have yet, and change nothing
  const text = htmlToPlain(cur.html).toLowerCase();
  const offer: { kind: string; label: string; text: string }[] = [];
  // a project is already in the text when its name (with or without a part in brackets, "Open Dental AI Calling (Chloe)") or its link is
  const inText = (proj: ProjectFact) => [proj.name, proj.name.replace(/\s*\([^)]*\)\s*/g, ' ').trim(), proj.live_link].some((x) => x && text.includes(x.toLowerCase().replace(/\/+$/, '')));
  for (const proj of f.projects) if (!inText(proj)) {
    const t = template ? await writeProof(f, template, proj) : proj.name;
    offer.push({ kind: 'project', label: `Project: ${proj.name}`, text: proj.live_link && !t.includes(proj.live_link) ? `${t}\n${proj.live_link}` : t });
  }
  if (f.sender.loom && !text.includes(f.sender.loom.url.toLowerCase())) offer.push({ kind: 'video', label: `Loom video: ${f.sender.loom.title}`, text: loomLine(cfg['writer.loom_line'], f.sender.loom) });
  const so = signoff(f.sender);
  if (f.sender.name && (!text.includes(f.sender.name.toLowerCase()) || (f.sender.gitlab_link && !text.includes(f.sender.gitlab_link.toLowerCase())))) offer.push({ kind: 'signoff', label: `Sign off: ${f.sender.name}`, text: so });
  await exec(`UPDATE proposals SET parts_status='done', parts_offer_json=?, profile_id=? WHERE id=?`, [offer.length ? JSON.stringify(offer) : null, f.profileId, p.id]);
}

/**
 * The sending profile or the Loom video changed (R78, Ahmad): the newest version is updated where it stands, at once and with no
 * AI call, because the sign off and the video line are made in code. No new version: they change nothing else in the proposal.
 * A version made from parts gets its parts put together again. A version edited by hand gets its old sign off and old video line
 * swapped for the new ones where they are found word for word; when they are not, nothing is changed and 'offer' is returned, so
 * the new lines are offered beside the editor as before. `before` is what the sign off and the video were.
 */
export async function applySendParts(screeningId: number, before: { signoff: string | null; loomUrl: string | null }): Promise<'none' | 'in_place' | 'offer'> {
  const p = (await query<any>(`SELECT id, status FROM proposals WHERE screening_id=?`, [screeningId]))[0];
  const cur = p && p.status === 'done' ? await latestVersion(p.id) : null;
  if (!cur) return 'none';
  const f = await loadFacts(screeningId);
  const cfg = await getSettings();
  const newSign = signoff(f.sender);
  const loom = f.sender.loom ? { id: f.loomId, title: f.sender.loom.title, url: f.sender.loom.url } : null;
  const newLoomLine = loomLine(cfg['writer.loom_line'], loom);
  let html: string, parts: Parts | null = null;
  if (cur.parts) {
    parts = { ...cur.parts, loom, profile_id: f.profileId, signoff: newSign };
    html = textToHtml(assembleParts(parts, cfg['writer.loom_line']));
  } else {
    let text = htmlToPlain(cur.html);
    // the old video line: the paragraph with the old link (the whole paragraph, so its words go with it)
    if (before.loomUrl && before.loomUrl !== loom?.url) {
      const paras = text.split(/\n{2,}/); const i = paras.findIndex((x) => x.includes(before.loomUrl!));
      if (i < 0) return 'offer';
      if (newLoomLine) paras[i] = newLoomLine; else paras.splice(i, 1);
      text = paras.join('\n\n');
    } else if (!before.loomUrl && loom) {
      // a video added to edited text: before the sign off, where the app puts it
      const at = before.signoff ? text.lastIndexOf(before.signoff.trim()) : -1;
      if (at < 0) return 'offer';
      text = `${text.slice(0, at).trimEnd()}\n\n${newLoomLine}\n\n${text.slice(at)}`;
    }
    if (before.signoff && before.signoff.trim() !== newSign.trim()) {
      const at = text.lastIndexOf(before.signoff.trim());
      if (at < 0) return 'offer';
      text = text.slice(0, at) + newSign + text.slice(at + before.signoff.trim().length);
    }
    html = textToHtml(text);
  }
  await exec('UPDATE proposal_versions SET content_html=?, parts_json=IF(? IS NULL, parts_json, ?) WHERE proposal_id=? AND version_no=?',
    [html, parts ? 1 : null, parts ? JSON.stringify(parts) : null, p.id, cur.version_no]);
  await exec(`UPDATE proposals SET profile_id=?, parts_offer_json=NULL, updated_at=NOW() WHERE id=?`, [f.profileId, p.id]);
  return 'in_place';
}
/** What the sign off and the video line are now, before a change (for applySendParts). */
export async function sendPartsNow(screeningId: number) {
  const f = await loadFacts(screeningId);
  return { signoff: f.sender.name ? signoff(f.sender) : null, loomUrl: f.sender.loom?.url ?? null };
}

/** What the reviewer gets for a job's newest proposal version, with the given reviewer sections: the instructions and the facts. */
/** The library's examples for a review: the same proposal type first, then any type; a spread of scores (highest and lowest alternately). */
export async function reviewerExamplesFor(typeName: string | null, n: number): Promise<ReviewerExample[]> {
  const rows = await query<any>('SELECT title, template_name, score, why, proposal_text FROM reviewer_examples WHERE active=1 AND (template_name IS NULL OR template_name=?) ORDER BY template_name IS NULL, id DESC', [typeName ?? '']);
  const same = rows.filter((x) => x.template_name), any = rows.filter((x) => !x.template_name);
  const spread = (xs: any[]) => { const s = [...xs].sort((a, b) => b.score - a.score), out: any[] = []; while (s.length) { out.push(s.shift()); if (s.length) out.push(s.pop()); } return out; };
  return [...spread(same), ...spread(any)].slice(0, n).map((x) => ({ title: x.title, type: x.template_name, score: Number(x.score), why: x.why, text: x.proposal_text }));
}
export async function reviewInput(proposalId: number, sections: ReviewerSections) {
  const p = (await query<any>('SELECT id, screening_id, template_id, warnings FROM proposals WHERE id=?', [proposalId]))[0];
  const cur = await latestVersion(proposalId);
  if (!p || !cur) throw new Error('no_version');
  const f = await loadFacts(p.screening_id);
  const template = p.template_id ? await loadTemplate(p.template_id) : null;
  if (template) template.opening = await openingInUse(p.id, template.opening); // the opening template in use now (R88)
  const detected = await storedSignals(p.screening_id);
  let warns: string[] = []; try { warns = (JSON.parse(p.warnings || '[]') as { source: string; text: string }[]).filter((w) => w.source === 'check').map((w) => w.text); } catch { /* none */ }
  // R115: what else the writer had (confirmed experience, the client's documents, the type's samples), the library's examples, the opening
  const sid = p.screening_id;
  const experience = sections.context.experience ? (await query<any>(`SELECT g.skill, g.note, (SELECT GROUP_CONCAT(pr.name SEPARATOR ', ') FROM proposal_gap_projects gp JOIN projects pr ON pr.id=gp.project_id WHERE gp.gap_id=g.id) AS projects
      FROM proposal_gaps g WHERE g.screening_id=? AND g.status='yes' ORDER BY g.id`, [sid])).map((g) => `${g.skill}${g.projects ? ' (in ' + g.projects + ')' : ''}${g.note ? ': ' + g.note : ''}`) : [];
  const documents = sections.context.documents ? (await query<any>(`SELECT file_name, text_content FROM job_attachments WHERE screening_id=? AND status='done' ORDER BY id`, [sid])).map((d) => `[${d.file_name}]\n${d.text_content ?? ''}`).join('\n\n') || null : null;
  const samples = sections.context.type_samples && p.template_id ? await query<any>('SELECT title, content FROM template_samples WHERE template_id=? AND active=1 ORDER BY id LIMIT 2', [p.template_id]) : [];
  const examples = sections.examples.use && sections.examples.per_review > 0 ? await reviewerExamplesFor(template?.name ?? null, sections.examples.per_review) : [];
  const letter = htmlToPlain(cur.html).trim();
  const system = reviewerSystem({ template, signals: detected.filter((d) => !d.is_fallback).map((d) => `${d.signal_name}: ${d.value_name}`), sender: f.sender, projects: f.projects,
    clientRequirements: f.requirements, guide: await loadGuide(), checkWarnings: warns, experience, documents, samples, examples, opening: letter.split(/\n\s*\n/)[0]?.trim() || null }, sections);
  const prompt = `<job_page>\n${f.jobText}\n</job_page>\n\n<proposal>\n${htmlToPlain(cur.html)}\n</proposal>\n\n${cur.answers.length ? `<screening_answers>\n${answersText(cur.answers)}\n</screening_answers>\n\n` : ''}Review the proposal now.`;
  return { system, prompt, version_no: cur.version_no };
}
/** Run the reviewer with these sections on a proposal's newest version and return the review. Saves nothing. */
export async function reviewWith(proposalId: number, sections: ReviewerSections) {
  const input = await reviewInput(proposalId, sections);
  const r = await run({ label: 'review', system: input.system, prompt: input.prompt, schema: reviewSchemaFor(sections.limits, sections), timeoutMs: config.llm.timeoutMs });
  const parsed = reviewOut.safeParse(r.data);
  if (!parsed.success) throw new Error('invalid_output');
  // the app works out the score from the criteria and the caps (R115), so the same judgements always give the same score
  return { review: { ...finalScore(parsed.data, sections), model: lastUsed()?.model ?? config.llm.model }, version_no: input.version_no };
}
/** The independent review of the newest version, by the active reviewer version (the Reviewer page). Stored with the proposal. */
export async function runReview(proposalId: number) {
  const rv = await activeReviewer();
  const { review, version_no } = await reviewWith(proposalId, rv.sections);
  // every review is kept (R114), not only the latest
  await exec('INSERT INTO proposal_reviews (proposal_id, version_no, reviewer_version, score, review_json) VALUES (?,?,?,?,?)',
    [proposalId, version_no, rv.version, Number.isFinite(Number((review as any).score)) ? Number((review as any).score) : null, JSON.stringify({ ...review, reviewer_version: rv.version })]);
  await exec(`UPDATE proposals SET review_status='done', review_json=?, review_version=?, review_reviewer_version=?, review_error=NULL, reviewed_at=NOW() WHERE id=?`, [JSON.stringify({ ...review, reviewer_version: rv.version }), version_no, rv.version, proposalId]);
}

/** One chat turn: answer, and revise the proposal when asked. The revision becomes a new version and never replaces the person's own text silently. */
export async function runChat(messageId: number) {
  const m = (await query<any>('SELECT id, proposal_id, content, user_id FROM proposal_messages WHERE id=?', [messageId]))[0];
  const p = (await query<any>('SELECT id, screening_id, template_id FROM proposals WHERE id=?', [m.proposal_id]))[0];
  const cur = await latestVersion(p.id);
  if (!cur) throw new Error('no_version');
  const letter = htmlToPlain(cur.html);
  const f = await loadFacts(p.screening_id);
  const detected = await storedSignals(p.screening_id);
  const template = p.template_id ? await loadTemplate(p.template_id) : null;
  if (template) template.opening = await openingInUse(p.id, template.opening); // the opening template in use now (R88)
  const guide = await loadGuide();
  const history = await query<any>(`SELECT role, content FROM proposal_messages WHERE proposal_id=? AND status='done' AND id<? ORDER BY id DESC LIMIT 12`, [p.id, m.id]);
  const transcript = history.reverse().map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
  const basedOn = Number(cur.version_no);
  const r = await run({ label: 'chat', system: chatSystem({ template, detected, sender: f.sender, projects: f.projects, clientRequirements: cur.answers.length ? [...f.requirements, `The client's screening questions are answered apart from the proposal, and the person edits those answers themselves. The proposal is the cover letter only: never add the questions or their answers to it. For reference, the answers are:\n${answersText(cur.answers)}`] : f.requirements, currentProposal: letter, guide }),
    prompt: `${transcript ? 'EARLIER MESSAGES\n' + transcript + '\n\n' : ''}USER REQUEST\n${m.content}\n\n<job_page>\n${f.jobText}\n</job_page>`, schema: chatSchema, timeoutMs: config.llm.timeoutMs });
  const parsed = chatOut.safeParse(r.data);
  if (!parsed.success) throw new Error('invalid_output');
  let resultVersion: number | null = null;
  const revised = parsed.data.proposal?.trim();
  if (revised && revised.replace(/\s+/g, ' ') !== letter.replace(/\s+/g, ' ')) {
    const latest = (await query<any>('SELECT MAX(version_no) AS n FROM proposal_versions WHERE proposal_id=?', [p.id]))[0].n;
    const note = Number(latest) > basedOn ? `AI revision of v${basedOn}; v${latest} was saved meanwhile` : `AI revision of v${basedOn}`;
    resultVersion = await addVersion(p.id, textToHtml(splitText(revised).letter), 'chat', null, note, basedOn);
    const library = (await query<any>('SELECT name FROM projects')).map((x) => x.name as string);
    const warnings = checkProposal({ text: revised, selectedProjects: f.projects.map((x) => ({ name: x.name, live_link: x.live_link, notes: [x.notes, x.overview, x.case_study, f.sender.stats].filter(Boolean).join(' ') || null })), otherProjectNames: library, foreignNames: await foreignNames(),
      sender: { name: f.sender.name, gitlab_link: f.sender.gitlab_link, loom_link: f.sender.loom?.url ?? null }, banned: bannedPatterns(guide.banned), wordRange: template ? wordRange(htmlToPlain(template.body_html)) : null }).map((t) => ({ source: 'check', text: t }));
    await exec('UPDATE proposals SET warnings=? WHERE id=?', [JSON.stringify(warnings), p.id]);
  }
  await exec(`INSERT INTO proposal_messages (proposal_id, role, content, status, based_on_version, result_version) VALUES (?, 'assistant', ?, 'done', ?, ?)`, [p.id, parsed.data.reply.slice(0, 4000), basedOn, resultVersion]);
  await exec(`UPDATE proposal_messages SET status='done', based_on_version=?, result_version=? WHERE id=?`, [basedOn, resultVersion, m.id]);
}

/** Writes a proposal for a job with its confirmed projects and profile and returns it, saving nothing (for checking a change to the Writing guide). */
export async function draftPreview(screeningId: number, templateId?: number | null) {
  return compose(screeningId, await loadFacts(screeningId), { stillWanted: () => true, templateId: templateId ?? null });
}
