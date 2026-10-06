import { config } from '../config';
import { exec, pool, query, withRetry } from '../db';
import { htmlToPlain, textToHtml } from '../html';
import { run } from '../llm';
import { checkProposal } from './checks';
import { rankTemplates } from './rank';
import { buildDetectionSchema, detectionPrompt, normalizeDetection, type DetectedValue, type SignalDef } from './signals';
import { chatOut, chatSchema, chatSystem, writerOut, writerSchema, writerSystem, type ProjectFact, type SenderFact, type TemplateFact } from './writer';

export const providerLabel = () => config.llm.provider;

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

async function loadFacts(screeningId: number) {
  const s = (await query<any>(
    `SELECT s.job_text, s.raw_input, s.report_json, s.proposal_profile_id, pr.name AS sender_name, pr.tagline, pr.gitlab_account FROM screenings s
     LEFT JOIN upwork_profiles pr ON pr.id=s.proposal_profile_id WHERE s.id=?`, [screeningId]))[0];
  const matches = await query<any>(
    `SELECT jm.project_id, jm.project_name, p.live_link, p.notes FROM job_matches jm LEFT JOIN projects p ON p.id=jm.project_id
     WHERE jm.screening_id=? AND jm.selected=1 ORDER BY jm.rank_no`, [screeningId]);
  const ids = matches.map((m) => m.project_id).filter(Boolean);
  const tags = ids.length ? await query<any>('SELECT pt.project_id, t.name FROM project_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.project_id IN (?) ORDER BY t.sort_order', [ids]) : [];
  const inds = ids.length ? await query<any>('SELECT pi.project_id, i.name FROM project_industries pi JOIN industries i ON i.id=pi.industry_id WHERE pi.project_id IN (?) ORDER BY i.name', [ids]) : [];
  const projects: ProjectFact[] = matches.map((m) => ({ name: m.project_name, live_link: m.live_link || null, notes: m.notes || null,
    tags: tags.filter((t) => t.project_id === m.project_id).map((t) => t.name), industries: inds.filter((t) => t.project_id === m.project_id).map((t) => t.name) }));
  const sender: SenderFact = { name: s.sender_name, gitlab_link: gitlabLink(s.gitlab_account), tagline: s.tagline || null };
  let report: any = null; try { report = JSON.parse(s.report_json); } catch { /* old or missing */ }
  const job = report?.job ?? report?.jobs?.[0] ?? null;
  const requirements: string[] = [];
  for (const n of job?.proposal_notes ?? []) if (n && !/^mock provider/i.test(n)) requirements.push(String(n));
  for (const f of job?.flags ?? []) if (['G11', 'G12', 'G13'].includes(f.code)) requirements.push(`${f.rule}: ${f.value}`);
  return { jobText: (s.job_text ?? s.raw_input) as string, sender, projects, requirements, profileId: s.proposal_profile_id as number | null };
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

/** Step 4: detect the signals, pick the template, write the proposal, check it. */
export async function runProposal(proposalId: number, stillWanted: () => boolean) {
  const p = (await query<any>('SELECT id, screening_id, template_id, template_choice, created_by FROM proposals WHERE id=?', [proposalId]))[0];
  const f = await loadFacts(p.screening_id);
  if (!f.sender.name || f.projects.length < 1) throw new Error('missing_inputs');
  await exec('UPDATE proposals SET profile_id=? WHERE id=?', [f.profileId, proposalId]); // the profile this text is signed with
  const { defs, layers } = await loadSignalDefs();

  // 1. signals: reuse the stored ones when only the template is being changed
  let detected: DetectedValue[];
  const have = await query<any>('SELECT * FROM job_signals WHERE screening_id=?', [p.screening_id]);
  if (p.template_choice === 'manual' && have.length) {
    detected = have.map((r) => ({ signal_id: r.signal_id, signal_number: r.signal_number, signal_name: r.signal_name, value_id: r.value_id, value_name: r.value_name, is_fallback: !!r.is_fallback,
      is_primary: !!r.is_primary, confidence: r.confidence, evidence: r.evidence ?? '', reason: r.reason ?? '', move: r.move_text, defaulted: false }));
  } else {
    await setStage(proposalId, 'signals');
    const r = await run({ model: config.llm.model, system: detectionPrompt(defs, layers), prompt: `<job_page>\n${f.jobText}\n</job_page>`, schema: buildDetectionSchema(defs), timeoutMs: config.llm.timeoutMs });
    detected = normalizeDetection(r.data, defs);
    if (!stillWanted()) return;
    await withRetry(async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM job_signals WHERE screening_id=?', [p.screening_id]);
      for (const d of detected) {
        await conn.query(`INSERT INTO job_signals (screening_id, signal_id, signal_number, signal_name, value_id, value_name, is_fallback, is_primary, confidence, evidence, reason, move_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [p.screening_id, d.signal_id, d.signal_number, d.signal_name, d.value_id, d.value_name, d.is_fallback ? 1 : 0, d.is_primary ? 1 : 0, d.confidence, d.evidence || null, d.reason || null, d.move]);
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    });
  }

  // 2. template: the best fit for the signals, or the one the user chose
  await setStage(proposalId, 'template');
  const tpls = await query<any>('SELECT id, name, priority FROM templates WHERE active=1');
  const maps = await query<any>('SELECT template_id, signal_id, value_id, weight FROM template_signals');
  const ranked = rankTemplates(detected.map((d) => ({ signal_id: d.signal_id, value_id: d.value_id, is_fallback: d.is_fallback })),
    tpls.map((t) => ({ id: t.id, name: t.name, priority: t.priority, mappings: maps.filter((m) => m.template_id === t.id).map((m) => ({ signal_id: m.signal_id, value_id: m.value_id, weight: m.weight })) })));
  if (!ranked.chosen) throw new Error('no_template');
  let chosen = ranked.chosen; let choice: 'auto' | 'manual' = 'auto';
  if (p.template_choice === 'manual' && p.template_id) { const m = ranked.ranking.find((x) => x.id === p.template_id); if (m) { chosen = m; choice = 'manual'; } }
  const sigLabel = new Map(detected.map((d) => [`${d.signal_id}:${d.value_id}`, `${d.signal_name}: ${d.value_name}`]));
  const sigOnly = new Map(detected.map((d) => [d.signal_id, `${d.signal_name}: ${d.value_name}`]));
  const rankingJson = JSON.stringify({ defaulted: ranked.defaulted && choice === 'auto', items: ranked.ranking.map((r) => ({ id: r.id, name: r.name, score: r.score, rank: r.rank,
    matched: r.matched.map((m) => ({ label: (m.value_id ? sigLabel.get(`${m.signal_id}:${m.value_id}`) : sigOnly.get(m.signal_id)) ?? 'signal', weight: m.weight })) })) });
  await exec('UPDATE proposals SET template_id=?, template_name=?, template_score=?, template_choice=?, template_ranking=? WHERE id=?', [chosen.id, chosen.name, chosen.score, choice, rankingJson, proposalId]);
  if (!stillWanted()) return;
  const template = (await loadTemplate(chosen.id))!;

  // 3. write
  await setStage(proposalId, 'writing');
  const samples = (await query<any>('SELECT title, content FROM template_samples WHERE template_id=? AND active=1 ORDER BY id LIMIT 3', [chosen.id])).map((s) => ({ title: s.title, content: s.content }));
  const requirements = [...f.requirements];
  const s5 = detected.find((d) => d.signal_number === 5 && /^yes$/i.test(d.value_name));
  if (s5) requirements.push('The post demands a structured submission: follow its structure exactly, first, before anything else.');
  const w = await run({ model: config.llm.model, system: writerSystem({ template, detected, samples, sender: f.sender, projects: f.projects, clientRequirements: requirements }),
    prompt: `<job_page>\n${f.jobText}\n</job_page>\n\nWrite the proposal now.`, schema: writerSchema, timeoutMs: config.llm.timeoutMs });
  const parsed = writerOut.safeParse(w.data);
  if (!parsed.success) throw new Error('invalid_output');
  if (!stillWanted()) return;

  // 4. check what the writer cannot be trusted to check
  const library = (await query<any>('SELECT name FROM projects')).map((r) => r.name as string);
  const warnings = [...parsed.data.warnings.map((t) => ({ source: 'writer', text: t })),
    ...checkProposal({ text: parsed.data.proposal, selectedProjects: f.projects.map((x) => ({ name: x.name, live_link: x.live_link, notes: x.notes })), otherProjectNames: library, foreignNames: await foreignNames(),
      sender: { name: f.sender.name, gitlab_link: f.sender.gitlab_link } }).map((t) => ({ source: 'check', text: t }))];
  const no = await addVersion(proposalId, textToHtml(parsed.data.proposal), 'ai', null, `Written with "${chosen.name}"`, null);
  await exec(`UPDATE proposals SET status='done', stage=NULL, warnings=?, model=?, error_code=NULL, error_message=NULL, finished_at=NOW() WHERE id=?`, [JSON.stringify(warnings), config.llm.model, proposalId]);
  void no;
}

/** One chat turn: answer, and revise the proposal when asked. The revision becomes a new version and never replaces the person's own text silently. */
export async function runChat(messageId: number) {
  const m = (await query<any>('SELECT id, proposal_id, content, user_id FROM proposal_messages WHERE id=?', [messageId]))[0];
  const p = (await query<any>('SELECT id, screening_id, template_id FROM proposals WHERE id=?', [m.proposal_id]))[0];
  const cur = (await query<any>('SELECT version_no, content_html FROM proposal_versions WHERE proposal_id=? ORDER BY version_no DESC LIMIT 1', [p.id]))[0];
  if (!cur) throw new Error('no_version');
  const f = await loadFacts(p.screening_id);
  const { defs } = await loadSignalDefs(); void defs;
  const sig = await query<any>('SELECT * FROM job_signals WHERE screening_id=?', [p.screening_id]);
  const detected: DetectedValue[] = sig.map((r) => ({ signal_id: r.signal_id, signal_number: r.signal_number, signal_name: r.signal_name, value_id: r.value_id, value_name: r.value_name, is_fallback: !!r.is_fallback,
    is_primary: !!r.is_primary, confidence: r.confidence, evidence: r.evidence ?? '', reason: r.reason ?? '', move: r.move_text, defaulted: false }));
  const template = p.template_id ? await loadTemplate(p.template_id) : null;
  const history = await query<any>(`SELECT role, content FROM proposal_messages WHERE proposal_id=? AND status='done' AND id<? ORDER BY id DESC LIMIT 12`, [p.id, m.id]);
  const transcript = history.reverse().map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
  const basedOn = Number(cur.version_no);
  const r = await run({ model: config.llm.model, system: chatSystem({ template, detected, sender: f.sender, projects: f.projects, clientRequirements: f.requirements, currentProposal: htmlToPlain(cur.content_html) }),
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
