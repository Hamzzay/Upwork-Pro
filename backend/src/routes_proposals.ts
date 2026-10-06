import { Router } from 'express';
import { z } from 'zod';
import { audit, exec, pool, query } from './db';
import { requireRole } from './auth';
import { htmlToPlain, sanitizeRich } from './html';
import { addVersion } from './proposal/pipeline';

export const proposals = Router();
const admin = requireRole('admin');
const editor = requireRole('admin', 'manager');
const anyone = requireRole();
const PAGE_SIZE = 20;

const bad = (res: any, e: z.ZodError) => res.status(400).json({ error: e.issues[0]?.message ?? 'Invalid input' });
const dup = (e: any) => e?.code === 'ER_DUP_ENTRY';
const num = (v: unknown) => (/^\d+$/.test(String(v)) ? Number(v) : -1);
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const canSeeAll = (role: string) => role === 'admin' || role === 'manager';
const page = (v: unknown) => Math.max(1, Number(v) || 1);

// =================== signals (admin) ===================
proposals.get('/signal-layers', editor, async (_req, res) => {
  res.json({ layers: await query('SELECT id, code, name, sort_order, intro, rule_note FROM signal_layers ORDER BY sort_order') });
});
proposals.get('/signals', editor, async (_req, res) => {
  const sigs = await query<any>(`SELECT s.id, s.number, s.name, s.decides, s.multi_select, s.notes, s.active, s.layer_id, l.name AS layer_name, l.code AS layer_code,
      (SELECT COUNT(*) FROM signal_values v WHERE v.signal_id=s.id) AS value_count,
      (SELECT COUNT(DISTINCT ts.template_id) FROM template_signals ts WHERE ts.signal_id=s.id) AS template_count
    FROM signals s JOIN signal_layers l ON l.id=s.layer_id ORDER BY s.number`);
  res.json({ signals: sigs.map((s) => ({ ...s, multi_select: !!s.multi_select })) });
});
proposals.get('/signals/:id', editor, async (req, res) => {
  const s = (await query<any>('SELECT s.id, s.number, s.name, s.decides, s.multi_select, s.notes, s.active, s.layer_id, l.name AS layer_name FROM signals s JOIN signal_layers l ON l.id=s.layer_id WHERE s.id=?', [num(req.params.id)]))[0];
  if (!s) return void res.status(404).json({ error: 'Not found' });
  const values = await query('SELECT id, name, detect, move, is_fallback, sort_order, active FROM signal_values WHERE signal_id=? ORDER BY sort_order, id', [s.id]);
  const usedBy = await query('SELECT t.id, t.name, ts.weight, v.name AS value_name FROM template_signals ts JOIN templates t ON t.id=ts.template_id LEFT JOIN signal_values v ON v.id=ts.value_id WHERE ts.signal_id=? ORDER BY t.name', [s.id]);
  res.json({ signal: { ...s, multi_select: !!s.multi_select, values: (values as any[]).map((v) => ({ ...v, is_fallback: !!v.is_fallback })), used_by: usedBy } });
});
const signalBody = z.object({
  number: z.number().int().min(1).max(999), layer_id: z.number().int().positive(), name: z.string().trim().min(1, 'Name is required').max(160),
  decides: optText(2000), multi_select: z.boolean().optional(), notes: optText(2000), active: z.boolean().optional(),
});
proposals.post('/signals', admin, async (req, res) => {
  const b = signalBody.safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  try {
    const r = await exec('INSERT INTO signals (number, layer_id, name, decides, multi_select, notes, active) VALUES (?,?,?,?,?,?,?)',
      [b.data.number, b.data.layer_id, b.data.name, b.data.decides, b.data.multi_select ? 1 : 0, b.data.notes, b.data.active === false ? 0 : 1]);
    await audit(req.user!.id, 'signal_create', `id=${r.insertId}`);
    res.status(201).json({ id: r.insertId });
  } catch (e: any) {
    if (dup(e)) return void res.status(409).json({ error: /number/.test(e.sqlMessage ?? '') ? 'A signal with that number already exists' : 'A signal with that name already exists' });
    if (e?.code === 'ER_NO_REFERENCED_ROW_2') return void res.status(400).json({ error: 'Unknown layer' });
    throw e;
  }
});
proposals.patch('/signals/:id', admin, async (req, res) => {
  const b = signalBody.partial().safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const sets: string[] = []; const p: any[] = [];
  for (const k of ['number', 'layer_id', 'name', 'decides', 'notes'] as const) if (k in b.data) { sets.push(`${k}=?`); p.push((b.data as any)[k]); }
  if (b.data.multi_select !== undefined) { sets.push('multi_select=?'); p.push(b.data.multi_select ? 1 : 0); }
  if (b.data.active !== undefined) { sets.push('active=?'); p.push(b.data.active ? 1 : 0); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  try {
    const r = await exec(`UPDATE signals SET ${sets.join(',')} WHERE id=?`, [...p, num(req.params.id)]);
    if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  } catch (e: any) {
    if (dup(e)) return void res.status(409).json({ error: /number/.test(e.sqlMessage ?? '') ? 'A signal with that number already exists' : 'A signal with that name already exists' });
    if (e?.code === 'ER_NO_REFERENCED_ROW_2') return void res.status(400).json({ error: 'Unknown layer' });
    throw e;
  }
  await audit(req.user!.id, 'signal_update', `id=${req.params.id}`);
  res.json({ ok: true });
});
proposals.delete('/signals/:id', admin, async (req, res) => {
  const r = await exec('DELETE FROM signals WHERE id=?', [num(req.params.id)]); // its values and template mappings go with it; saved job signals keep their copied names
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'signal_delete', `id=${req.params.id}`);
  res.json({ ok: true });
});

const valueBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200), detect: optText(4000), move: optText(4000),
  is_fallback: z.boolean().optional(), sort_order: z.number().int().min(0).max(9999).optional(), active: z.boolean().optional(),
});
async function saveValue(req: any, res: any, signalId: number | null, valueId: number | null) {
  const b = (valueId ? valueBody.partial() : valueBody).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const d: any = b.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let sid = signalId;
    if (valueId) { const [r]: any = await conn.query('SELECT signal_id FROM signal_values WHERE id=?', [valueId]); if (!r.length) { await conn.rollback(); return void res.status(404).json({ error: 'Not found' }); } sid = r[0].signal_id; }
    else { const [r]: any = await conn.query('SELECT id FROM signals WHERE id=?', [sid]); if (!r.length) { await conn.rollback(); return void res.status(404).json({ error: 'Not found' }); } }
    if (d.is_fallback) { // a signal has at most one fallback value
      const [r]: any = await conn.query('SELECT id FROM signal_values WHERE signal_id=? AND is_fallback=1 AND id <> ?', [sid, valueId ?? 0]);
      if (r.length) { await conn.rollback(); return void res.status(409).json({ error: 'This signal already has a fallback value. Untick it there first.' }); }
    }
    if (!valueId) {
      const [mx]: any = await conn.query('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM signal_values WHERE signal_id=?', [sid]);
      const [r]: any = await conn.query('INSERT INTO signal_values (signal_id, name, detect, move, is_fallback, sort_order, active) VALUES (?,?,?,?,?,?,?)',
        [sid, d.name, d.detect, d.move, d.is_fallback ? 1 : 0, d.sort_order ?? mx[0].n, d.active === false ? 0 : 1]);
      valueId = r.insertId;
    } else {
      const sets: string[] = []; const p: any[] = [];
      for (const k of ['name', 'detect', 'move', 'sort_order']) if (k in d) { sets.push(`${k}=?`); p.push(d[k]); }
      if (d.is_fallback !== undefined) { sets.push('is_fallback=?'); p.push(d.is_fallback ? 1 : 0); }
      if (d.active !== undefined) { sets.push('active=?'); p.push(d.active ? 1 : 0); }
      if (!sets.length) { await conn.rollback(); return void res.status(400).json({ error: 'Nothing to change' }); }
      await conn.query(`UPDATE signal_values SET ${sets.join(',')} WHERE id=?`, [...p, valueId]);
    }
    await conn.commit();
    await audit(req.user.id, signalId ? 'signal_value_create' : 'signal_value_update', `id=${valueId}`);
    res.status(signalId ? 201 : 200).json({ id: valueId });
  } catch (e: any) {
    await conn.rollback();
    if (dup(e)) return void res.status(409).json({ error: 'This signal already has a value with that name' });
    throw e;
  } finally { conn.release(); }
}
proposals.post('/signals/:id/values', admin, (req, res) => saveValue(req, res, num(req.params.id), null));
proposals.patch('/signal-values/:id', admin, (req, res) => saveValue(req, res, null, num(req.params.id)));
proposals.delete('/signal-values/:id', admin, async (req, res) => {
  const r = await exec('DELETE FROM signal_values WHERE id=?', [num(req.params.id)]);
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'signal_value_delete', `id=${req.params.id}`);
  res.json({ ok: true });
});

// =================== templates ===================
proposals.get('/templates', editor, async (req, res) => {
  const q = z.object({ page: z.coerce.number().int().min(1).default(1), q: z.string().trim().max(100).optional() }).parse(req.query);
  const like = q.q ? `%${q.q.replace(/[\\%_]/g, (c) => '\\' + c)}%` : null;
  const where = like ? 'WHERE t.name LIKE ? OR t.description LIKE ?' : ''; const p = like ? [like, like] : [];
  const total = Number((await query<any>(`SELECT COUNT(*) AS n FROM templates t ${where}`, p))[0].n);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)); const pg = Math.min(q.page, pages);
  const rows = await query(`SELECT t.id, t.name, t.description, t.priority, t.active, t.updated_at,
      (SELECT COUNT(*) FROM template_signals ts WHERE ts.template_id=t.id) AS signal_count,
      (SELECT COUNT(*) FROM template_samples sm WHERE sm.template_id=t.id) AS sample_count
    FROM templates t ${where} ORDER BY t.priority, t.name LIMIT ? OFFSET ?`, [...p, PAGE_SIZE, (pg - 1) * PAGE_SIZE]);
  res.json({ templates: rows, total, page: pg, pages, page_size: PAGE_SIZE });
});
async function templateDetail(id: number) {
  const t = (await query<any>('SELECT id, name, description, body_html, prompt, priority, active, created_at, updated_at FROM templates WHERE id=?', [id]))[0];
  if (!t) return null;
  const mappings = await query(
    `SELECT ts.id, ts.signal_id, ts.value_id, ts.weight, ts.source, s.number AS signal_number, s.name AS signal_name, v.name AS value_name
     FROM template_signals ts JOIN signals s ON s.id=ts.signal_id LEFT JOIN signal_values v ON v.id=ts.value_id WHERE ts.template_id=? ORDER BY s.number, ts.id`, [id]);
  return { ...t, mappings };
}
proposals.get('/templates/:id', editor, async (req, res) => {
  const t = await templateDetail(num(req.params.id));
  if (!t) return void res.status(404).json({ error: 'Not found' });
  res.json({ template: t });
});
const templateBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160), description: optText(1000), body_html: z.string().max(200_000), prompt: optText(20_000),
  priority: z.number().int().min(0).max(100000).optional(), active: z.boolean().optional(),
});
proposals.post('/templates', editor, async (req, res) => {
  const b = templateBody.safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const html = sanitizeRich(b.data.body_html);
  if (!htmlToPlain(html)) return void res.status(400).json({ error: 'The template format cannot be empty' });
  try {
    const r = await exec('INSERT INTO templates (name, description, body_html, prompt, priority, active) VALUES (?,?,?,?,?,?)', [b.data.name, b.data.description, html, b.data.prompt, b.data.priority ?? 100, b.data.active === false ? 0 : 1]);
    await audit(req.user!.id, 'template_create', `id=${r.insertId}`);
    res.status(201).json({ id: r.insertId });
  } catch (e) { if (dup(e)) return void res.status(409).json({ error: 'A template with that name already exists' }); throw e; }
});
proposals.patch('/templates/:id', editor, async (req, res) => {
  const b = templateBody.partial().safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const d: any = { ...b.data };
  if (d.body_html !== undefined) { d.body_html = sanitizeRich(d.body_html); if (!htmlToPlain(d.body_html)) return void res.status(400).json({ error: 'The template format cannot be empty' }); }
  const sets: string[] = []; const p: any[] = [];
  for (const k of ['name', 'description', 'body_html', 'prompt', 'priority']) if (k in d) { sets.push(`${k}=?`); p.push(d[k]); }
  if (d.active !== undefined) { sets.push('active=?'); p.push(d.active ? 1 : 0); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  try {
    const r = await exec(`UPDATE templates SET ${sets.join(',')} WHERE id=?`, [...p, num(req.params.id)]);
    if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  } catch (e) { if (dup(e)) return void res.status(409).json({ error: 'A template with that name already exists' }); throw e; }
  await audit(req.user!.id, 'template_update', `id=${req.params.id} fields=${Object.keys(b.data).join(',')}`);
  res.json({ ok: true });
});
proposals.delete('/templates/:id', editor, async (req, res) => {
  const r = await exec('DELETE FROM templates WHERE id=?', [num(req.params.id)]); // its mapping and samples go with it; written proposals keep the template name
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'template_delete', `id=${req.params.id}`);
  res.json({ ok: true });
});

// the signals a template is suited for: replaced as a whole
proposals.put('/templates/:id/signals', editor, async (req, res) => {
  const b = z.object({ mappings: z.array(z.object({ signal_id: z.number().int().positive(), value_id: z.number().int().positive().nullable(), weight: z.number().int().min(1, 'Weight must be 1 to 10').max(10, 'Weight must be 1 to 10') })).max(200) }).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const tid = num(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [t]: any = await conn.query('SELECT id FROM templates WHERE id=?', [tid]);
    if (!t.length) { await conn.rollback(); return void res.status(404).json({ error: 'Not found' }); }
    const [old]: any = await conn.query('SELECT signal_id, value_id, weight FROM template_signals WHERE template_id=? AND source=\'starter\'', [tid]);
    const keep = (m: any) => old.some((o: any) => o.signal_id === m.signal_id && o.value_id === m.value_id && o.weight === m.weight); // an untouched starter row stays a starter row
    const seen = new Set<string>();
    await conn.query('DELETE FROM template_signals WHERE template_id=?', [tid]);
    for (const m of b.data.mappings) {
      const key = `${m.signal_id}:${m.value_id}`; if (seen.has(key)) { await conn.rollback(); return void res.status(400).json({ error: 'The same signal and value is listed twice' }); } seen.add(key);
      if (m.value_id !== null) {
        const [ok]: any = await conn.query('SELECT id FROM signal_values WHERE id=? AND signal_id=?', [m.value_id, m.signal_id]);
        if (!ok.length) { await conn.rollback(); return void res.status(400).json({ error: 'A value does not belong to its signal' }); }
      } else { const [ok]: any = await conn.query('SELECT id FROM signals WHERE id=?', [m.signal_id]); if (!ok.length) { await conn.rollback(); return void res.status(400).json({ error: 'Unknown signal' }); } }
      await conn.query('INSERT INTO template_signals (template_id, signal_id, value_id, weight, source) VALUES (?,?,?,?,?)', [tid, m.signal_id, m.value_id, m.weight, keep(m) ? 'starter' : 'manual']);
    }
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  await audit(req.user!.id, 'template_signals', `id=${tid} rows=${b.data.mappings.length}`);
  res.json({ ok: true });
});

// samples
proposals.get('/templates/:id/samples', editor, async (req, res) => {
  const tid = num(req.params.id);
  const total = Number((await query<any>('SELECT COUNT(*) AS n FROM template_samples WHERE template_id=?', [tid]))[0].n);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)); const pg = Math.min(page(req.query.page), pages);
  res.json({ samples: await query('SELECT id, title, author, job_url, job_keywords, content, active, created_at FROM template_samples WHERE template_id=? ORDER BY id LIMIT ? OFFSET ?', [tid, PAGE_SIZE, (pg - 1) * PAGE_SIZE]), total, page: pg, pages, page_size: PAGE_SIZE });
});
const urlOpt = z.string().trim().max(500).refine((v) => /^https?:\/\/\S+$/i.test(v), 'The job link must start with http:// or https://').or(z.literal('')).nullish().transform((v) => v || null);
const sampleBody = z.object({ title: z.string().trim().min(1, 'Title is required').max(250), author: optText(120), job_url: urlOpt, job_keywords: optText(500), content: z.string().trim().min(40, 'The sample is too short').max(20_000), active: z.boolean().optional() });
proposals.post('/templates/:id/samples', editor, async (req, res) => {
  const b = sampleBody.safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const tid = num(req.params.id);
  if (!(await query('SELECT id FROM templates WHERE id=?', [tid])).length) return void res.status(404).json({ error: 'Not found' });
  const r = await exec('INSERT INTO template_samples (template_id, title, author, job_url, job_keywords, content, active) VALUES (?,?,?,?,?,?,?)', [tid, b.data.title, b.data.author, b.data.job_url, b.data.job_keywords, b.data.content, b.data.active === false ? 0 : 1]);
  await audit(req.user!.id, 'sample_create', `id=${r.insertId} template=${tid}`);
  res.status(201).json({ id: r.insertId });
});
proposals.patch('/template-samples/:id', editor, async (req, res) => {
  const b = sampleBody.partial().safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const sets: string[] = []; const p: any[] = [];
  for (const k of ['title', 'author', 'job_url', 'job_keywords', 'content'] as const) if (k in b.data) { sets.push(`${k}=?`); p.push((b.data as any)[k]); }
  if (b.data.active !== undefined) { sets.push('active=?'); p.push(b.data.active ? 1 : 0); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  const r = await exec(`UPDATE template_samples SET ${sets.join(',')} WHERE id=?`, [...p, num(req.params.id)]);
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'sample_update', `id=${req.params.id}`);
  res.json({ ok: true });
});
proposals.delete('/template-samples/:id', editor, async (req, res) => {
  const r = await exec('DELETE FROM template_samples WHERE id=?', [num(req.params.id)]);
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'sample_delete', `id=${req.params.id}`);
  res.json({ ok: true });
});

// =================== the proposal of a screening ===================
export async function proposalFor(screeningId: number) {
  const p = (await query<any>(
    `SELECT p.id, p.status, p.stage, p.error_message, p.template_id, p.template_name, p.template_score, p.template_choice, p.template_ranking, p.warnings, p.model, p.created_at, p.finished_at, p.profile_id, p.finalized_at, u.name AS created_by_name
     FROM proposals p JOIN users u ON u.id=p.created_by WHERE p.screening_id=?`, [screeningId]))[0];
  if (!p) return null;
  const versions = await query('SELECT v.version_no, v.source, v.note, v.based_on_version, v.created_at, u.name AS user_name FROM proposal_versions v LEFT JOIN users u ON u.id=v.created_by WHERE v.proposal_id=? ORDER BY v.version_no DESC', [p.id]);
  const cur = (await query<any>('SELECT version_no, content_html FROM proposal_versions WHERE proposal_id=? ORDER BY version_no DESC LIMIT 1', [p.id]))[0] ?? null;
  const signals = await query('SELECT signal_number, signal_name, value_name, is_fallback, is_primary, confidence, evidence, reason FROM job_signals WHERE screening_id=? ORDER BY signal_number, is_primary DESC, id', [screeningId]);
  const messages = await query('SELECT m.id, m.role, m.content, m.status, m.error_message, m.based_on_version, m.result_version, m.created_at, u.name AS user_name FROM proposal_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.proposal_id=? ORDER BY m.id', [p.id]);
  return {
    id: p.id, status: p.status, stage: p.stage, error: p.error_message, template: p.template_id || p.template_name ? { id: p.template_id, name: p.template_name, score: p.template_score, choice: p.template_choice } : null,
    ranking: p.template_ranking ? JSON.parse(p.template_ranking) : null, warnings: p.warnings ? JSON.parse(p.warnings) : [], created_by: p.created_by_name, finished_at: p.finished_at, profile_id: p.profile_id, finalized_at: p.finalized_at,
    current: cur ? { version_no: cur.version_no, html: cur.content_html } : null, versions, signals, messages,
  };
}
async function ownedScreening(req: any, res: any) {
  const id = num(req.params.id);
  const s = (await query<any>('SELECT id, user_id, status, selection_confirmed_at, proposal_profile_id FROM screenings WHERE id=?', [id]))[0];
  if (!s || s.user_id !== req.user.id) { res.status(404).json({ error: 'Not found' }); return null; }
  return s;
}
async function visibleScreening(req: any, res: any) {
  const s = (await query<any>('SELECT id, user_id FROM screenings WHERE id=?', [num(req.params.id)]))[0];
  if (!s || (!canSeeAll(req.user.role) && s.user_id !== req.user.id)) { res.status(404).json({ error: 'Not found' }); return null; }
  return s;
}
async function ownedProposal(req: any, res: any) {
  const p = (await query<any>('SELECT p.id, p.status, p.screening_id, s.user_id FROM proposals p JOIN screenings s ON s.id=p.screening_id WHERE p.id=?', [num(req.params.id)]))[0];
  if (!p || p.user_id !== req.user.id) { res.status(404).json({ error: 'Not found' }); return null; }
  return p;
}

proposals.get('/screenings/:id/proposal', anyone, async (req, res) => {
  const s = await visibleScreening(req, res); if (!s) return;
  const templates = await query('SELECT id, name FROM templates WHERE active=1 ORDER BY priority, name');
  res.json({ proposal: await proposalFor(s.id), templates });
});

// Write (or write again, optionally with a template the user chose).
proposals.post('/screenings/:id/proposal/start', anyone, async (req, res) => {
  const b = z.object({ template_id: z.number().int().positive().nullish() }).safeParse(req.body ?? {});
  if (!b.success) return void res.status(400).json({ error: 'Invalid request' });
  const s = await ownedScreening(req, res); if (!s) return;
  if (!s.selection_confirmed_at) return void res.status(409).json({ error: 'Confirm the projects first' });
  if (!s.proposal_profile_id) return void res.status(409).json({ error: 'Choose the profile that will send the proposal first' });
  let tpl: number | null = null;
  if (b.data.template_id) {
    const t = (await query<any>('SELECT id FROM templates WHERE id=? AND active=1', [b.data.template_id]))[0];
    if (!t) return void res.status(400).json({ error: 'That template is not available' });
    tpl = t.id;
  }
  const existing = (await query<any>('SELECT id, status FROM proposals WHERE screening_id=?', [s.id]))[0];
  if (existing && (existing.status === 'queued' || existing.status === 'running')) return void res.status(409).json({ error: 'The proposal is already being written' });
  if (existing) {
    await exec(`UPDATE proposals SET status='queued', stage=NULL, error_code=NULL, error_message=NULL, template_choice=?, template_id=COALESCE(?, template_id), finished_at=NULL WHERE id=?`, [tpl ? 'manual' : 'auto', tpl, existing.id]);
    if (!tpl) await exec('UPDATE proposals SET template_id=NULL WHERE id=?', [existing.id]);
  } else {
    await exec(`INSERT INTO proposals (screening_id, status, template_choice, template_id, created_by) VALUES (?, 'queued', ?, ?, ?)`, [s.id, tpl ? 'manual' : 'auto', tpl, req.user!.id]);
  }
  await audit(req.user!.id, 'proposal_start', `screening=${s.id}${tpl ? ' template=' + tpl : ''}`);
  res.status(202).json({ ok: true });
});

// The person is happy with the proposal: this opens the tracking step.
proposals.post('/screenings/:id/proposal/done', anyone, async (req, res) => {
  const s = await ownedScreening(req, res); if (!s) return;
  const p = (await query<any>('SELECT id, status FROM proposals WHERE screening_id=?', [s.id]))[0];
  if (!p || p.status !== 'done') return void res.status(409).json({ error: 'The proposal is not ready yet' });
  if (!(await query('SELECT id FROM proposal_versions WHERE proposal_id=? LIMIT 1', [p.id])).length) return void res.status(409).json({ error: 'The proposal has no text yet' });
  const r = await exec('UPDATE proposals SET finalized_at=COALESCE(finalized_at, NOW()), finalized_by=COALESCE(finalized_by, ?) WHERE id=?', [req.user!.id, p.id]);
  if (r.affectedRows) await audit(req.user!.id, 'proposal_done', `screening=${s.id}`);
  res.json({ ok: true });
});

// A cheap read for polling: state, newest version number, and the chat.
proposals.get('/screenings/:id/proposal/state', anyone, async (req, res) => {
  const s = await visibleScreening(req, res); if (!s) return;
  const p = (await query<any>('SELECT id, status, stage, error_message FROM proposals WHERE screening_id=?', [s.id]))[0];
  if (!p) return void res.json({ state: null });
  const latest = (await query<any>('SELECT MAX(version_no) AS n FROM proposal_versions WHERE proposal_id=?', [p.id]))[0].n;
  const messages = await query('SELECT m.id, m.role, m.content, m.status, m.error_message, m.based_on_version, m.result_version, m.created_at, u.name AS user_name FROM proposal_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.proposal_id=? ORDER BY m.id', [p.id]);
  res.json({ state: { status: p.status, stage: p.stage, error: p.error_message, latest_version: latest ? Number(latest) : null, messages } });
});

proposals.get('/proposals/:id/versions/:no', anyone, async (req, res) => {
  const p = (await query<any>('SELECT p.id, s.user_id FROM proposals p JOIN screenings s ON s.id=p.screening_id WHERE p.id=?', [num(req.params.id)]))[0];
  if (!p || (!canSeeAll(req.user!.role) && p.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  const v = (await query<any>('SELECT version_no, content_html, source, note, created_at FROM proposal_versions WHERE proposal_id=? AND version_no=?', [p.id, num(req.params.no)]))[0];
  if (!v) return void res.status(404).json({ error: 'Not found' });
  res.json({ version: v });
});

// The person's own edit: always a new version, even if a chat revision landed while they were typing.
proposals.post('/proposals/:id/versions', anyone, async (req, res) => {
  const b = z.object({ html: z.string().max(200_000), based_on: z.number().int().positive().nullish() }).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const p = await ownedProposal(req, res); if (!p) return;
  if (p.status !== 'done') return void res.status(409).json({ error: 'The proposal is not ready yet' });
  const html = sanitizeRich(b.data.html);
  if (!htmlToPlain(html)) return void res.status(400).json({ error: 'The proposal cannot be empty' });
  const cur = (await query<any>('SELECT version_no, content_html FROM proposal_versions WHERE proposal_id=? ORDER BY version_no DESC LIMIT 1', [p.id]))[0];
  if (cur && htmlToPlain(cur.content_html) === htmlToPlain(html)) return void res.json({ unchanged: true, version_no: cur.version_no });
  const stale = b.data.based_on && cur && cur.version_no > b.data.based_on;
  const no = await addVersion(p.id, html, 'manual', req.user!.id, stale ? `Edited from v${b.data.based_on}; v${cur.version_no} was saved meanwhile` : null, b.data.based_on ?? null);
  await audit(req.user!.id, 'proposal_edit', `proposal=${p.id} version=${no}`);
  res.status(201).json({ version_no: no });
});

proposals.post('/proposals/:id/restore', anyone, async (req, res) => {
  const b = z.object({ version_no: z.number().int().positive() }).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const p = await ownedProposal(req, res); if (!p) return;
  if (p.status !== 'done') return void res.status(409).json({ error: 'The proposal is not ready yet' });
  const v = (await query<any>('SELECT content_html FROM proposal_versions WHERE proposal_id=? AND version_no=?', [p.id, b.data.version_no]))[0];
  if (!v) return void res.status(404).json({ error: 'That version does not exist' });
  const no = await addVersion(p.id, v.content_html, 'restore', req.user!.id, `Restored from v${b.data.version_no}`, b.data.version_no);
  await audit(req.user!.id, 'proposal_restore', `proposal=${p.id} from=${b.data.version_no} version=${no}`);
  res.status(201).json({ version_no: no });
});

// Chat: the question is stored at once; the worker answers.
proposals.post('/proposals/:id/messages', anyone, async (req, res) => {
  const b = z.object({ content: z.string().trim().min(1, 'Write a message').max(2000, 'Keep the message under 2000 characters') }).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const p = await ownedProposal(req, res); if (!p) return;
  if (p.status !== 'done') return void res.status(409).json({ error: 'The proposal is not ready yet' });
  const pending = await query(`SELECT id FROM proposal_messages WHERE proposal_id=? AND role='user' AND status IN ('queued','running') LIMIT 1`, [p.id]);
  if (pending.length) return void res.status(409).json({ error: 'Wait for the answer to your last message' });
  const cur = (await query<any>('SELECT MAX(version_no) AS n FROM proposal_versions WHERE proposal_id=?', [p.id]))[0].n;
  const r = await exec(`INSERT INTO proposal_messages (proposal_id, role, content, status, user_id, based_on_version) VALUES (?, 'user', ?, 'queued', ?, ?)`, [p.id, b.data.content, req.user!.id, cur ?? null]);
  res.status(202).json({ id: r.insertId });
});
proposals.post('/proposal-messages/:id/retry', anyone, async (req, res) => {
  const m = (await query<any>(`SELECT m.id, m.status, s.user_id FROM proposal_messages m JOIN proposals p ON p.id=m.proposal_id JOIN screenings s ON s.id=p.screening_id WHERE m.id=? AND m.role='user'`, [num(req.params.id)]))[0];
  if (!m || m.user_id !== req.user!.id) return void res.status(404).json({ error: 'Not found' });
  if (m.status !== 'error') return void res.status(409).json({ error: 'Only a failed message can be sent again' });
  await exec(`UPDATE proposal_messages SET status='queued', error_message=NULL WHERE id=?`, [m.id]);
  res.json({ ok: true });
});
