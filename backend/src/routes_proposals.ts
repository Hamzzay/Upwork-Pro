import { Router } from 'express';
import { diff, label, snapshot } from './changes';
import { z } from 'zod';
import { audit, exec, pool, query } from './db';
import { requireRole } from './auth';
import { htmlToPlain, sanitizeRich } from './html';
import { addVersion, applySendParts, latestVersion, loadTemplate, loomChoices, queueParts, readParts, sendPartsNow, suggestedTypeId, typeChoices } from './proposal/pipeline';
import { qaList, separate } from './proposal/answers';
import { allOpenings, MAX_ACTIVE, MAX_EXAMPLES, MAX_OPENINGS, openingInUse, readList, templateBlock } from './proposal/opening_templates';
import { editOpening, openingsLeft, queueOpenings, readOpenings, useOpening } from './proposal/openings';
import { compareOf, queueCompare } from './proposal/compare';

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
export const signalBody = z.object({
  number: z.number().int().min(1).max(999), layer_id: z.number().int().positive(), name: z.string().trim().min(1, 'Name is required').max(160),
  decides: optText(2000), multi_select: z.boolean().optional(), notes: optText(2000), active: z.boolean().optional(),
});
proposals.post('/signals', admin, async (req, res) => {
  const b = signalBody.safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  try {
    const r = await exec('INSERT INTO signals (number, layer_id, name, decides, multi_select, notes, active) VALUES (?,?,?,?,?,?,?)',
      [b.data.number, b.data.layer_id, b.data.name, b.data.decides, b.data.multi_select ? 1 : 0, b.data.notes, b.data.active === false ? 0 : 1]);
    { const after = await snapshot('signals', r.insertId); await audit(req.user!.id, 'signal_create', `${label(after) ?? ''} (id ${r.insertId})`, diff(null, after)); }
    res.status(201).json({ id: r.insertId });
  } catch (e: any) {
    if (dup(e)) return void res.status(409).json({ error: /number/.test(e.sqlMessage ?? '') ? 'A signal with that number already exists' : 'A signal with that name already exists' });
    if (e?.code === 'ER_NO_REFERENCED_ROW_2') return void res.status(400).json({ error: 'Unknown layer' });
    throw e;
  }
});
proposals.patch('/signals/:id', admin, async (req, res) => {
  const before = await snapshot('signals', num(req.params.id));
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
  { const after = await snapshot('signals', num(req.params.id)); await audit(req.user!.id, 'signal_update', `${label(after ?? before) ?? ''} (id ${num(req.params.id)})`, diff(before, after)); }
  res.json({ ok: true });
});
proposals.delete('/signals/:id', admin, async (req, res) => {
  const before = await snapshot('signals', num(req.params.id));
  const r = await exec('DELETE FROM signals WHERE id=?', [num(req.params.id)]); // its values and template mappings go with it; saved job signals keep their copied names
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'signal_delete', `${label(before) ?? ''} (id ${num(req.params.id)})`, diff(before, null));
  res.json({ ok: true });
});

export const valueBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200), detect: optText(4000), move: optText(4000),
  is_fallback: z.boolean().optional(), sort_order: z.number().int().min(0).max(9999).optional(), active: z.boolean().optional(),
});
async function saveValue(req: any, res: any, signalId: number | null, valueId: number | null) {
  const before = valueId ? await snapshot('signal_values', valueId) : null;
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
    const after = await snapshot('signal_values', valueId);
    await audit(req.user.id, signalId ? 'signal_value_create' : 'signal_value_update', `${label(after) ?? ''} (id ${valueId})`, diff(before, after));
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
  const before = await snapshot('signal_values', num(req.params.id));
  const r = await exec('DELETE FROM signal_values WHERE id=?', [num(req.params.id)]);
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'signal_value_delete', `${label(before) ?? ''} (id ${num(req.params.id)})`, diff(before, null));
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
  const t = (await query<any>('SELECT id, name, description, body_html, prompt, priority, active, is_default, opening_rules, opening_no_us, opening_starts, default_opening_id, created_at, updated_at FROM templates WHERE id=?', [id]))[0];
  if (!t) return null;
  const mappings = await query(
    `SELECT ts.id, ts.signal_id, ts.value_id, ts.weight, ts.role, ts.req_group, ts.source, s.number AS signal_number, s.name AS signal_name, v.name AS value_name
     FROM template_signals ts JOIN signals s ON s.id=ts.signal_id LEFT JOIN signal_values v ON v.id=ts.value_id WHERE ts.template_id=? ORDER BY s.number, ts.id`, [id]);
  return { ...t, mappings };
}
proposals.get('/templates/:id', editor, async (req, res) => {
  const t = await templateDetail(num(req.params.id));
  if (!t) return void res.status(404).json({ error: 'Not found' });
  res.json({ template: t });
});
export const templateBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160), description: optText(1000), body_html: z.string().max(200_000), prompt: optText(20_000),
  priority: z.number().int().min(0).max(100000).optional(), active: z.boolean().optional(), is_default: z.boolean().optional(),
  opening_rules: optText(4000), opening_no_us: z.boolean().optional(), opening_starts: optText(200),
  default_opening_id: z.number().int().positive().nullable().optional(), // R88: the opening template this type is written with
});
// ---------- opening templates (R88): every opening in one place; each proposal type picks one as its default ----------
export const openingBody = z.object({
  name: z.string().trim().min(2, 'Give it a name').max(80), instructions: z.string().trim().min(20, 'Say what this opening does').max(3000),
  starts: z.string().trim().max(200).nullable().optional(), may_greet: z.boolean().optional(), may_talk_about_us: z.boolean().optional(),
  active: z.boolean().optional(), sort_order: z.number().int().min(0).max(10000).optional(),
  // R91: up to five example openings, and whether to write the opening very close to them
  // R101: as many examples as wanted (plain text, or { text, on } to say whether the writer uses it); at most 10 in use across both lists
  examples: z.array(z.union([z.string().trim().max(1500), z.object({ text: z.string().trim().max(1500), on: z.boolean().optional() })])).max(200).optional(), match_examples: z.boolean().optional(),
  rank_boost: z.number().int().min(0).max(100000).optional(), // R92: points added by hand to its ranking
  learned: z.array(z.union([z.string().trim().max(1500), z.object({ text: z.string().trim().max(1500), on: z.boolean().optional(), at: z.string().nullable().optional() })])).max(200).optional(), // R98/R101: the learned ones (to switch off or remove)
});
const toList = (a: any[] | undefined) => (a ?? []).map((x) => (typeof x === 'string' ? { text: x, on: true } : { text: x.text, on: x.on !== false, ...(x.at ? { at: x.at } : {}) })).filter((x) => x.text);
const examplesJson = (a: any[] | undefined) => { const l = toList(a); return l.length ? JSON.stringify(l) : null; };
/** R101: at most MAX_ACTIVE examples in use across the written and learned lists (null when fine). */
const tooManyActive = (ex: any[] | undefined, le: any[] | undefined) => { const n = toList(ex).filter((x) => x.on).length + toList(le).filter((x) => x.on).length; return n > MAX_ACTIVE ? `At most ${MAX_ACTIVE} examples can be in use at once (${n} are). Switch some off.` : null; };
proposals.get('/opening-templates', anyone, async (_req, res) => {
  const doc = (await query<any>("SELECT id FROM writing_docs WHERE kind='opening' ORDER BY sort_order LIMIT 1"))[0];
  res.json({ items: await allOpenings(), max: MAX_OPENINGS, rules_doc_id: doc?.id ?? null });
});
// R101: one opening template for its own page: everything about it, and exactly what the writer reads for it
proposals.get('/opening-templates/:id', anyone, async (req, res) => {
  const o = (await allOpenings()).find((x) => x.id === num(req.params.id));
  if (!o) return void res.status(404).json({ error: 'Not found' });
  const all = await allOpenings();
  res.json({ item: { ...o, position: all.findIndex((x) => x.id === o.id) + 1, of: all.length }, block: templateBlock(o), max_active: MAX_ACTIVE });
});
proposals.post('/opening-templates', editor, async (req, res) => {
  const b = openingBody.safeParse(req.body); if (!b.success) return void bad(res, b.error);
  { const too = tooManyActive(b.data.examples, b.data.learned); if (too) return void res.status(400).json({ error: too }); }
  if (Number((await query<any>('SELECT COUNT(*) n FROM opening_templates'))[0].n) >= MAX_OPENINGS) return void res.status(409).json({ error: `There can be at most ${MAX_OPENINGS} opening templates. Change or switch off one instead.` });
  try {
    const r = await exec('INSERT INTO opening_templates (name, instructions, starts, may_greet, may_talk_about_us, active, sort_order, examples_json, match_examples) VALUES (?,?,?,?,?,?,?,?,?)',
      [b.data.name, b.data.instructions, b.data.starts || null, b.data.may_greet ? 1 : 0, b.data.may_talk_about_us ? 1 : 0, b.data.active === false ? 0 : 1, b.data.sort_order ?? 300,
        examplesJson(b.data.examples), b.data.match_examples && examplesJson(b.data.examples) ? 1 : 0]);
    await audit(req.user!.id, 'opening_template_create', b.data.name);
    res.status(201).json({ id: r.insertId });
  } catch (e) { if (dup(e)) return void res.status(409).json({ error: 'An opening template with that name already exists' }); throw e; }
});
proposals.patch('/opening-templates/:id', editor, async (req, res) => {
  const b = openingBody.partial().safeParse(req.body); if (!b.success) return void bad(res, b.error);
  const id = num(req.params.id), d: any = b.data;
  if ('examples' in d || 'learned' in d) { // R101: the in-use limit counts both lists, so the one not sent is read
    const cur = (await query<any>('SELECT examples_json, learned_json FROM opening_templates WHERE id=?', [id]))[0];
    const too = tooManyActive('examples' in d ? d.examples : readList(cur?.examples_json), 'learned' in d ? d.learned : readList(cur?.learned_json)); if (too) return void res.status(400).json({ error: too });
  }
  // a type's default cannot be switched off: the type would have no opening to be written with
  if (d.active === false) {
    const users = await query<any>('SELECT name FROM templates WHERE default_opening_id=? AND active=1', [id]);
    if (users.length) return void res.status(409).json({ error: `It is the default opening of ${users.map((u) => u.name).join(', ')}. Give ${users.length === 1 ? 'that type' : 'those types'} another default first.` });
  }
  const sets: string[] = [], p: any[] = [];
  for (const k of ['name', 'instructions', 'sort_order', 'rank_boost']) if (k in d) { sets.push(`${k}=?`); p.push(d[k]); }
  if ('starts' in d) { sets.push('starts=?'); p.push(d.starts || null); }
  for (const k of ['may_greet', 'may_talk_about_us', 'active', 'match_examples']) if (k in d) { sets.push(`${k}=?`); p.push(d[k] ? 1 : 0); }
  if ('examples' in d) { sets.push('examples_json=?'); p.push(examplesJson(d.examples)); }
  if ('learned' in d) { sets.push('learned_json=?'); p.push(examplesJson(d.learned)); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  try { const r = await exec(`UPDATE opening_templates SET ${sets.join(',')} WHERE id=?`, [...p, id]); if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' }); }
  catch (e) { if (dup(e)) return void res.status(409).json({ error: 'An opening template with that name already exists' }); throw e; }
  await audit(req.user!.id, 'opening_template_update', `id ${id}`);
  res.json({ ok: true });
});
// ---------- word shortcuts (R92): a main word and the short word every proposal uses instead ----------
export const shortcutBody = z.object({ main_word: z.string().trim().min(2, 'Give the main word').max(80), short_word: z.string().trim().min(1, 'Give the short word').max(40), active: z.boolean().optional() })
  .refine((b) => b.main_word.toLowerCase() !== b.short_word.toLowerCase(), { message: 'The short word must differ from the main word', path: ['short_word'] });
const shortcutPatch = z.object({ main_word: z.string().trim().min(2).max(80).optional(), short_word: z.string().trim().min(1).max(40).optional(), active: z.boolean().optional() });
proposals.get('/shortcuts', anyone, async (_req, res) => {
  res.json({ items: await query<any>('SELECT id, main_word, short_word, active, updated_at FROM word_shortcuts ORDER BY main_word') });
});
proposals.post('/shortcuts', editor, async (req, res) => {
  const b = shortcutBody.safeParse(req.body); if (!b.success) return void bad(res, b.error);
  try { const r = await exec('INSERT INTO word_shortcuts (main_word, short_word, active) VALUES (?,?,?)', [b.data.main_word, b.data.short_word, b.data.active === false ? 0 : 1]);
    await audit(req.user!.id, 'shortcut_create', `${b.data.main_word} -> ${b.data.short_word}`); res.status(201).json({ id: r.insertId }); }
  catch (e) { if (dup(e)) return void res.status(409).json({ error: `There is already a shortcut for "${b.data.main_word}"` }); throw e; }
});
proposals.patch('/shortcuts/:id', editor, async (req, res) => {
  const b = shortcutPatch.safeParse(req.body); if (!b.success) return void bad(res, b.error);
  const id = num(req.params.id), d: any = b.data, sets: string[] = [], p: any[] = [];
  for (const k of ['main_word', 'short_word']) if (k in d) { sets.push(`${k}=?`); p.push(d[k]); }
  if ('active' in d) { sets.push('active=?'); p.push(d.active ? 1 : 0); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  const cur = (await query<any>('SELECT main_word, short_word FROM word_shortcuts WHERE id=?', [id]))[0]; if (!cur) return void res.status(404).json({ error: 'Not found' });
  if (String(d.main_word ?? cur.main_word).toLowerCase() === String(d.short_word ?? cur.short_word).toLowerCase()) return void res.status(400).json({ error: 'The short word must differ from the main word' });
  try { await exec(`UPDATE word_shortcuts SET ${sets.join(',')} WHERE id=?`, [...p, id]); }
  catch (e) { if (dup(e)) return void res.status(409).json({ error: 'There is already a shortcut for that main word' }); throw e; }
  await audit(req.user!.id, 'shortcut_update', `id ${id}`); res.json({ ok: true });
});
proposals.delete('/shortcuts/:id', editor, async (req, res) => {
  const r = await exec('DELETE FROM word_shortcuts WHERE id=?', [num(req.params.id)]); if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'shortcut_delete', `id ${req.params.id}`); res.json({ ok: true });
});
proposals.post('/templates', editor, async (req, res) => {
  const b = templateBody.safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const html = sanitizeRich(b.data.body_html);
  if (!htmlToPlain(html)) return void res.status(400).json({ error: 'The template format cannot be empty' });
  try {
    const r = await exec('INSERT INTO templates (name, description, body_html, prompt, priority, active, opening_rules, opening_no_us, opening_starts) VALUES (?,?,?,?,?,?,?,?,?)', [b.data.name, b.data.description, html, b.data.prompt, b.data.priority ?? 100, b.data.active === false ? 0 : 1, b.data.opening_rules ?? null, b.data.opening_no_us === false ? 0 : 1, b.data.opening_starts ?? null]);
    { const after = await snapshot('templates', r.insertId); await audit(req.user!.id, 'template_create', `${label(after) ?? ''} (id ${r.insertId})`, diff(null, after)); }
    res.status(201).json({ id: r.insertId });
  } catch (e) { if (dup(e)) return void res.status(409).json({ error: 'A template with that name already exists' }); throw e; }
});
proposals.patch('/templates/:id', editor, async (req, res) => {
  const before = await snapshot('templates', num(req.params.id));
  const b = templateBody.partial().safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const d: any = { ...b.data };
  if (d.body_html !== undefined) { d.body_html = sanitizeRich(d.body_html); if (!htmlToPlain(d.body_html)) return void res.status(400).json({ error: 'The template format cannot be empty' }); }
  const sets: string[] = []; const p: any[] = [];
  for (const k of ['name', 'description', 'body_html', 'prompt', 'priority', 'opening_rules', 'opening_starts']) if (k in d) { sets.push(`${k}=?`); p.push(d[k]); }
  if (d.opening_no_us !== undefined) { sets.push('opening_no_us=?'); p.push(d.opening_no_us ? 1 : 0); }
  if (d.default_opening_id !== undefined) {
    if (d.default_opening_id !== null && !(await query<any>('SELECT 1 FROM opening_templates WHERE id=? AND active=1', [d.default_opening_id])).length) return void res.status(400).json({ error: 'That opening template does not exist or is switched off' });
    sets.push('default_opening_id=?'); p.push(d.default_opening_id);
  }
  if (d.active !== undefined) { sets.push('active=?'); p.push(d.active ? 1 : 0); }
  if (d.is_default !== undefined) { sets.push('is_default=?'); p.push(d.is_default ? 1 : 0); if (d.is_default) await exec('UPDATE templates SET is_default=0 WHERE id<>?', [num(req.params.id)]); } // one default type
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  try {
    const r = await exec(`UPDATE templates SET ${sets.join(',')} WHERE id=?`, [...p, num(req.params.id)]);
    if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  } catch (e) { if (dup(e)) return void res.status(409).json({ error: 'A template with that name already exists' }); throw e; }
  { const after = await snapshot('templates', num(req.params.id)); await audit(req.user!.id, 'template_update', `${label(after ?? before) ?? ''} (id ${num(req.params.id)})`, diff(before, after)); }
  res.json({ ok: true });
});
proposals.delete('/templates/:id', editor, async (req, res) => {
  const before = await snapshot('templates', num(req.params.id));
  const r = await exec('DELETE FROM templates WHERE id=?', [num(req.params.id)]); // its mapping and samples go with it; written proposals keep the template name
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'template_delete', `${label(before) ?? ''} (id ${num(req.params.id)})`, diff(before, null));
  res.json({ ok: true });
});

// the signals a template is suited for: replaced as a whole
/** A type's signal mapping as one line per row ("S3 Greenfield / MVP: required, group 1"), so a change shows the rows removed and added. */
async function mappingText(tid: number): Promise<string> {
  const rows = await query<any>(`SELECT s.number, s.name AS sname, v.name AS vname, ts.role, ts.weight, ts.req_group FROM template_signals ts JOIN signals s ON s.id=ts.signal_id
    LEFT JOIN signal_values v ON v.id=ts.value_id WHERE ts.template_id=? ORDER BY s.number, v.name`, [tid]);
  return rows.map((r) => `S${r.number} ${r.sname}: ${r.vname ?? 'any value'}, ${r.role === 'weight' ? 'weight ' + r.weight : r.role}${r.req_group ? ', group ' + r.req_group : ''}`).join('\n');
}
proposals.put('/templates/:id/signals', editor, async (req, res) => {
  const b = z.object({ mappings: z.array(z.object({ signal_id: z.number().int().positive(), value_id: z.number().int().positive().nullable(),
    weight: z.number().int().min(0).max(10, 'Weight must be 0 to 10').default(0), role: z.enum(['weight', 'required', 'supporting', 'exclude']).default('weight'),
    req_group: z.number().int().min(1).max(20).nullable().optional() })).max(200) }).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const tid = num(req.params.id);
  const before = await mappingText(tid);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [t]: any = await conn.query('SELECT id FROM templates WHERE id=?', [tid]);
    if (!t.length) { await conn.rollback(); return void res.status(404).json({ error: 'Not found' }); }
    const [old]: any = await conn.query('SELECT signal_id, value_id, weight, role, req_group FROM template_signals WHERE template_id=? AND source=\'starter\'', [tid]);
    const keep = (m: any) => old.some((o: any) => o.signal_id === m.signal_id && o.value_id === m.value_id && o.weight === m.weight && o.role === m.role && (o.req_group ?? null) === (m.req_group ?? null)); // an untouched starter row stays a starter row
    const seen = new Set<string>();
    await conn.query('DELETE FROM template_signals WHERE template_id=?', [tid]);
    for (const m of b.data.mappings) {
      const key = `${m.signal_id}:${m.value_id}`; if (seen.has(key)) { await conn.rollback(); return void res.status(400).json({ error: 'The same signal and value is listed twice' }); } seen.add(key);
      if (m.value_id !== null) {
        const [ok]: any = await conn.query('SELECT id FROM signal_values WHERE id=? AND signal_id=?', [m.value_id, m.signal_id]);
        if (!ok.length) { await conn.rollback(); return void res.status(400).json({ error: 'A value does not belong to its signal' }); }
      } else { const [ok]: any = await conn.query('SELECT id FROM signals WHERE id=?', [m.signal_id]); if (!ok.length) { await conn.rollback(); return void res.status(400).json({ error: 'Unknown signal' }); } }
      if (m.role === 'weight' && m.weight < 1) { await conn.rollback(); return void res.status(400).json({ error: 'A weight row needs a weight of 1 to 10' }); }
      await conn.query('INSERT INTO template_signals (template_id, signal_id, value_id, weight, role, req_group, source) VALUES (?,?,?,?,?,?,?)',
        [tid, m.signal_id, m.value_id, m.role === 'weight' ? m.weight : 0, m.role, m.role === 'required' ? (m.req_group ?? 1) : null, keep(m) ? 'starter' : 'manual']);
    }
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  const tname = (await query<any>('SELECT name FROM templates WHERE id=?', [tid]))[0]?.name ?? '';
  await audit(req.user!.id, 'template_signals', `${tname} (id ${tid}), ${b.data.mappings.length} rows`, diff({ mapping: before }, { mapping: await mappingText(tid) }));
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
export const sampleBody = z.object({ title: z.string().trim().min(1, 'Title is required').max(250), author: optText(120), job_url: urlOpt, job_keywords: optText(500), content: z.string().trim().min(40, 'The sample is too short').max(20_000), active: z.boolean().optional() });
proposals.post('/templates/:id/samples', editor, async (req, res) => {
  const b = sampleBody.safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const tid = num(req.params.id);
  if (!(await query('SELECT id FROM templates WHERE id=?', [tid])).length) return void res.status(404).json({ error: 'Not found' });
  const r = await exec('INSERT INTO template_samples (template_id, title, author, job_url, job_keywords, content, active) VALUES (?,?,?,?,?,?,?)', [tid, b.data.title, b.data.author, b.data.job_url, b.data.job_keywords, b.data.content, b.data.active === false ? 0 : 1]);
  { const after = await snapshot('template_samples', r.insertId); await audit(req.user!.id, 'sample_create', `${label(after) ?? ''} (id ${r.insertId})`, diff(null, after)); }
  res.status(201).json({ id: r.insertId });
});
proposals.patch('/template-samples/:id', editor, async (req, res) => {
  const before = await snapshot('template_samples', num(req.params.id));
  const b = sampleBody.partial().safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const sets: string[] = []; const p: any[] = [];
  for (const k of ['title', 'author', 'job_url', 'job_keywords', 'content'] as const) if (k in b.data) { sets.push(`${k}=?`); p.push((b.data as any)[k]); }
  if (b.data.active !== undefined) { sets.push('active=?'); p.push(b.data.active ? 1 : 0); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  const r = await exec(`UPDATE template_samples SET ${sets.join(',')} WHERE id=?`, [...p, num(req.params.id)]);
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  { const after = await snapshot('template_samples', num(req.params.id)); await audit(req.user!.id, 'sample_update', `${label(after ?? before) ?? ''} (id ${num(req.params.id)})`, diff(before, after)); }
  res.json({ ok: true });
});
proposals.delete('/template-samples/:id', editor, async (req, res) => {
  const before = await snapshot('template_samples', num(req.params.id));
  const r = await exec('DELETE FROM template_samples WHERE id=?', [num(req.params.id)]);
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'sample_delete', `${label(before) ?? ''} (id ${num(req.params.id)})`, diff(before, null));
  res.json({ ok: true });
});

// =================== the proposal of a screening ===================
/** The independent review as the screens and the plugin read it: its state, the version it is about, and the review itself. */
export function reviewOf(p: any) {
  if (!p.review_status) return null;
  let body: any = null; try { body = p.review_json ? JSON.parse(p.review_json) : null; } catch { body = null; }
  return { status: p.review_status, version: p.review_version, error: p.review_error, at: p.reviewed_at, ...(body ?? {}) };
}
export async function proposalFor(screeningId: number) {
  const p = (await query<any>(
    `SELECT p.id, p.status, p.stage, p.error_message, p.template_id, p.template_name, p.template_score, p.template_choice, p.template_ranking, p.warnings, p.model, p.created_at, p.finished_at, p.profile_id, p.finalized_at, p.review_status, p.review_json, p.review_version, p.review_error, p.reviewed_at, p.parts_status, p.parts_offer_json, p.parts_error, p.gaps_status, p.gaps_error, p.openings_status, p.openings_json, p.openings_error, p.openings_more, p.sent_version_no, u.name AS created_by_name
     FROM proposals p JOIN users u ON u.id=p.created_by WHERE p.screening_id=?`, [screeningId]))[0];
  if (!p) return null;
  const versions = await query('SELECT v.version_no, v.source, v.note, v.based_on_version, v.created_at, u.name AS user_name FROM proposal_versions v LEFT JOIN users u ON u.id=v.created_by WHERE v.proposal_id=? ORDER BY v.version_no DESC', [p.id]);
  const cur = await latestVersion(p.id);
  const signals = await query('SELECT signal_number, signal_name, value_name, is_fallback, is_primary, confidence, evidence, reason FROM job_signals WHERE screening_id=? ORDER BY signal_number, is_primary DESC, id', [screeningId]);
  const messages = await query('SELECT m.id, m.role, m.content, m.status, m.error_message, m.based_on_version, m.result_version, m.created_at, u.name AS user_name FROM proposal_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.proposal_id=? ORDER BY m.id', [p.id]);
  return {
    // R97: how long a proposal usually takes here, start to finish (the last 30, leaving out odd ones), for the time left on screen
    typical_seconds: p.status === 'done' || p.status === 'error' ? null : Number((await query<any>(`SELECT ROUND(AVG(d)) AS s FROM (SELECT TIMESTAMPDIFF(SECOND, created_at, finished_at) AS d FROM proposals
      WHERE finished_at IS NOT NULL AND status='done' AND (model IS NULL OR model<>'claude-plugin') AND TIMESTAMPDIFF(SECOND, created_at, finished_at) BETWEEN 15 AND 1800 ORDER BY id DESC LIMIT 30) x`))[0]?.s) || null,
    elapsed_seconds: p.status === 'done' || p.status === 'error' ? null : Number((await query<any>('SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS s FROM proposals WHERE id=?', [p.id]))[0]?.s ?? 0),
    id: p.id, status: p.status, stage: p.stage, error: p.error_message, template: p.template_id || p.template_name ? { id: p.template_id, name: p.template_name, score: p.template_score, choice: p.template_choice } : null,
    ranking: p.template_ranking ? JSON.parse(p.template_ranking) : null, warnings: p.warnings ? JSON.parse(p.warnings) : [], created_by: p.created_by_name, finished_at: p.finished_at, profile_id: p.profile_id, finalized_at: p.finalized_at, sent_version_no: p.sent_version_no ?? null, // R104: the version that went out
    // R116: the client's files changed after the newest version was written (to write it again with them)
    docs_newer: !!Number((await query<any>(`SELECT s.docs_changed_at > COALESCE((SELECT MAX(v.created_at) FROM proposal_versions v WHERE v.proposal_id=?), '1970-01-01') AS n FROM screenings s WHERE s.id=?`, [p.id, screeningId]))[0]?.n),
    current: cur ? { version_no: cur.version_no, html: cur.html, answers: cur.answers, in_parts: !!cur.parts } : null, versions, signals, messages,
    openings: { status: p.openings_status, error: p.openings_error, more: !!Number(p.openings_more), ...(readOpenings(p.openings_json) ?? {}), left: await openingsLeft(readOpenings(p.openings_json), p.template_id ? (await query<any>('SELECT default_opening_id FROM templates WHERE id=?', [p.template_id]))[0]?.default_opening_id : null) }, // to pick from (R73), three at a time (R91)
    review: reviewOf(p), parts: { status: p.parts_status, error: p.parts_error, offer: p.parts_offer_json ? JSON.parse(p.parts_offer_json) : [] },
    // experience the client asks for that our facts do not show (R67), with what is needed to answer it
    gaps: { status: p.gaps_status, error: p.gaps_error, items: await query<any>(`SELECT g.id, g.skill, g.ask, g.quote, g.category, g.status, g.project_id, g.note, g.tag_name, g.library, g.applied_version,
        (SELECT GROUP_CONCAT(pr.name ORDER BY gp.id SEPARATOR ', ') FROM proposal_gap_projects gp JOIN projects pr ON pr.id=gp.project_id WHERE gp.gap_id=g.id) AS project_name
        FROM proposal_gaps g WHERE g.proposal_id=? ORDER BY g.id`, [p.id]),
      projects: await query<any>(`SELECT pj.id, pj.name, EXISTS(SELECT 1 FROM job_matches m WHERE m.screening_id=? AND m.project_id=pj.id AND m.selected=1) AS in_proposal FROM projects pj WHERE pj.active=1 ORDER BY in_proposal DESC, pj.name`, [screeningId]),
      categories: (await query<any>("SELECT name FROM tag_categories WHERE name<>'Industry' ORDER BY sort_order, name")).map((r) => r.name) },
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
// The proposal types to choose from before writing: every active type, best fit for the job's signals first.
proposals.get('/screenings/:id/proposal/types', anyone, async (req, res) => {
  const s = await visibleScreening(req, res); if (!s) return;
  // a type already picked in Claude (the plugin's type step) is the one selected here
  const chosen = (await query<any>('SELECT chosen_template_id FROM screenings WHERE id=?', [s.id]))[0]?.chosen_template_id ?? null;
  res.json({ ...(await typeChoices(s.id)), chosen_type_id: chosen, loom: await loomChoices(s.id) });
});

proposals.post('/screenings/:id/proposal/start', anyone, async (req, res) => {
  const b = z.object({ template_id: z.number().int().positive().nullish(), loom_video_id: z.number().int().positive().nullable().optional() }).safeParse(req.body ?? {});
  if (!b.success) return void res.status(400).json({ error: 'Invalid request' });
  const s = await ownedScreening(req, res); if (!s) return;
  if (!s.selection_confirmed_at) return void res.status(409).json({ error: 'Confirm the projects first' });
  if (!s.proposal_profile_id) return void res.status(409).json({ error: 'Choose the profile that will send the proposal first' });
  let tpl: number | null = null;
  if (b.data.template_id) {
    const t = (await query<any>('SELECT id FROM templates WHERE id=? AND active=1', [b.data.template_id]))[0];
    if (!t) return void res.status(400).json({ error: 'That template is not available' });
    tpl = t.id;
    // choosing the type the signals suggest is not an override: it is recorded as chosen from the signals (and can use the early draft)
    if ((await suggestedTypeId(s.id)) === tpl) tpl = null;
  }
  const existing = (await query<any>('SELECT id, status FROM proposals WHERE screening_id=?', [s.id]))[0];
  if (existing && (existing.status === 'queued' || existing.status === 'running')) return void res.status(409).json({ error: 'The proposal is already being written' });
  // the Loom video to send with it: one of the sending profile's own, or none. Left as it is when the request does not say.
  if (b.data.loom_video_id !== undefined) {
    if (b.data.loom_video_id === null) await exec('UPDATE screenings SET loom_video_id=NULL, loom_video_title=NULL WHERE id=?', [s.id]);
    else {
      const v = (await query<any>('SELECT id, title FROM loom_videos WHERE id=? AND profile_id=?', [b.data.loom_video_id, s.proposal_profile_id]))[0];
      if (!v) return void res.status(400).json({ error: 'That Loom video does not belong to the sending profile' });
      await exec('UPDATE screenings SET loom_video_id=?, loom_video_title=? WHERE id=?', [v.id, v.title, s.id]);
    }
  }
  if (existing) {
    await exec(`UPDATE proposals SET status='queued', stage=NULL, error_code=NULL, error_message=NULL, template_choice=?, template_id=COALESCE(?, template_id), finished_at=NULL WHERE id=?`, [tpl ? 'manual' : 'auto', tpl, existing.id]);
    if (!tpl) await exec('UPDATE proposals SET template_id=NULL WHERE id=?', [existing.id]);
  } else {
    await exec(`INSERT INTO proposals (screening_id, status, template_choice, template_id, created_by) VALUES (?, 'queued', ?, ?, ?)`, [s.id, tpl ? 'manual' : 'auto', tpl, req.user!.id]);
  }
  await audit(req.user!.id, 'proposal_start', `screening=${s.id}${tpl ? ' template=' + tpl : ''}`);
  res.status(202).json({ ok: true });
});

// The Loom video after the proposal is written: only the video line changes, no new write (PLAN-SPEED point 1).
proposals.put('/screenings/:id/loom', anyone, async (req, res) => {
  const b = z.object({ loom_video_id: z.number().int().positive().nullable() }).safeParse(req.body ?? {});
  if (!b.success) return void res.status(400).json({ error: 'Choose a video, or none' });
  const s = await ownedScreening(req, res); if (!s) return;
  const before = await sendPartsNow(s.id);
  if (b.data.loom_video_id === null) await exec('UPDATE screenings SET loom_video_id=NULL, loom_video_title=NULL WHERE id=?', [s.id]);
  else {
    const v = (await query<any>('SELECT id, title FROM loom_videos WHERE id=? AND profile_id=?', [b.data.loom_video_id, s.proposal_profile_id]))[0];
    if (!v) return void res.status(400).json({ error: 'That Loom video does not belong to the sending profile' });
    await exec('UPDATE screenings SET loom_video_id=?, loom_video_title=? WHERE id=?', [v.id, v.title, s.id]);
  }
  // only the video line changes, in the version as it is, at once (R78); text edited past recognition gets the line offered
  const r = await applySendParts(s.id, before);
  if (r === 'offer') await queueParts(s.id);
  await audit(req.user!.id, 'proposal_loom', `screening=${s.id} video=${b.data.loom_video_id ?? 'none'} ${r}`);
  res.json({ ok: true, updated: r });
});
// A part offered beside an edited proposal is dismissed.
proposals.post('/proposals/:id/parts-offer/dismiss', anyone, async (req, res) => {
  const p = await ownedProposal(req, res); if (!p) return;
  await exec('UPDATE proposals SET parts_offer_json=NULL WHERE id=?', [p.id]);
  res.json({ ok: true });
});

/** R91: the opening template a finalized proposal went out with (the one picked, else its type's default), counted by the ranking. */
export async function setFinalOpening(proposalId: number) {
  const p = (await query<any>('SELECT template_id FROM proposals WHERE id=? AND finalized_at IS NOT NULL', [proposalId]))[0]; if (!p) return;
  const def = p.template_id ? (await loadTemplate(p.template_id))?.opening ?? null : null;
  const o = await openingInUse(proposalId, def);
  await exec('UPDATE proposals SET final_opening_id=? WHERE id=?', [o?.id ?? null, proposalId]);
}

/** R104: a job marked Sent keeps the version that went out (the first time it is marked) and the opening it went out with. */
export async function recordSent(screeningId: number) {
  const p = (await query<any>('SELECT id, template_id, final_opening_id FROM proposals WHERE screening_id=?', [screeningId]))[0]; if (!p) return;
  await exec('UPDATE proposals SET sent_version_no=COALESCE(sent_version_no, (SELECT MAX(version_no) FROM proposal_versions WHERE proposal_id=?)) WHERE id=?', [p.id, p.id]);
  if (!p.final_opening_id) {
    const def = p.template_id ? (await loadTemplate(p.template_id))?.opening ?? null : null;
    const o = await openingInUse(p.id, def);
    if (o) await exec('UPDATE proposals SET final_opening_id=? WHERE id=?', [o.id, p.id]);
  }
}

// The person is happy with the proposal: this opens the tracking step.
proposals.post('/screenings/:id/proposal/done', anyone, async (req, res) => {
  const s = await ownedScreening(req, res); if (!s) return;
  const p = (await query<any>('SELECT id, status FROM proposals WHERE screening_id=?', [s.id]))[0];
  if (!p || p.status !== 'done') return void res.status(409).json({ error: 'The proposal is not ready yet' });
  if (!(await query('SELECT id FROM proposal_versions WHERE proposal_id=? LIMIT 1', [p.id])).length) return void res.status(409).json({ error: 'The proposal has no text yet' });
  const r = await exec('UPDATE proposals SET finalized_at=COALESCE(finalized_at, NOW()), finalized_by=COALESCE(finalized_by, ?) WHERE id=?', [req.user!.id, p.id]);
  await setFinalOpening(p.id); // R91: the opening it goes out with scores a point
  if (r.affectedRows) await audit(req.user!.id, 'proposal_done', `screening=${s.id}`);
  res.json({ ok: true });
});

// A cheap read for polling: state, newest version number, and the chat.
// Ask the independent reviewer to look at the newest version (again). Anyone who can see the job may ask.
proposals.post('/screenings/:id/proposal/review', anyone, async (req, res) => {
  const s = await visibleScreening(req, res); if (!s) return;
  const r = await queueReview(s.id);
  if (r.error) return void res.status(r.status).json({ error: r.error });
  await audit(req.user!.id, 'proposal_review', `screening=${s.id}`);
  res.status(202).json({ ok: true });
});
/** Queue a review of a job's newest proposal version. Shared with the plugin. */
export async function queueReview(screeningId: number): Promise<{ status: number; error?: string }> {
  const p = (await query<any>(`SELECT p.id, p.status, p.review_status, (SELECT COUNT(*) FROM proposal_versions v WHERE v.proposal_id=p.id) AS n FROM proposals p WHERE p.screening_id=?`, [screeningId]))[0];
  if (!p || !Number(p.n)) return { status: 409, error: 'There is no proposal to review yet' };
  if (p.status !== 'done') return { status: 409, error: 'Wait until the proposal is written' };
  if (p.review_status === 'queued' || p.review_status === 'running') return { status: 202 };
  await exec(`UPDATE proposals SET review_status='queued', review_error=NULL WHERE id=?`, [p.id]);
  return { status: 202 };
}

proposals.get('/screenings/:id/proposal/state', anyone, async (req, res) => {
  const s = await visibleScreening(req, res); if (!s) return;
  const p = (await query<any>('SELECT id, status, stage, error_message, review_status, review_version, parts_status, gaps_status, openings_status FROM proposals WHERE screening_id=?', [s.id]))[0];
  if (!p) return void res.json({ state: null });
  const latest = (await query<any>('SELECT MAX(version_no) AS n FROM proposal_versions WHERE proposal_id=?', [p.id]))[0].n;
  const messages = await query('SELECT m.id, m.role, m.content, m.status, m.error_message, m.based_on_version, m.result_version, m.created_at, u.name AS user_name FROM proposal_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.proposal_id=? ORDER BY m.id', [p.id]);
  res.json({ state: { status: p.status, stage: p.stage, error: p.error_message, latest_version: latest ? Number(latest) : null, messages, review_status: p.review_status, review_version: p.review_version, parts_status: p.parts_status, gaps_status: p.gaps_status, openings_status: p.openings_status } });
});

proposals.get('/proposals/:id/versions/:no', anyone, async (req, res) => {
  const p = (await query<any>('SELECT p.id, s.user_id FROM proposals p JOIN screenings s ON s.id=p.screening_id WHERE p.id=?', [num(req.params.id)]))[0];
  if (!p || (!canSeeAll(req.user!.role) && p.user_id !== req.user!.id)) return void res.status(404).json({ error: 'Not found' });
  const v = (await query<any>('SELECT version_no, content_html, answers_json, source, note, created_at FROM proposal_versions WHERE proposal_id=? AND version_no=?', [p.id, num(req.params.no)]))[0];
  if (!v) return void res.status(404).json({ error: 'Not found' });
  const sep = separate(v.content_html, v.answers_json);
  res.json({ version: { version_no: v.version_no, content_html: sep.html, answers: sep.answers, source: v.source, note: v.note, created_at: v.created_at } });
});

// The person's own edit: always a new version, even if a chat revision landed while they were typing.
// Two versions compared by the AI (R76): asked for when the Compare window opens on a pair; then read until it is done.
const cmpBody = z.object({ a: z.number().int().positive(), b: z.number().int().positive() });
async function seenProposal(req: any, res: any) {
  const p = (await query<any>('SELECT p.id, s.user_id FROM proposals p JOIN screenings s ON s.id=p.screening_id WHERE p.id=?', [num(req.params.id)]))[0];
  if (!p || (!canSeeAll(req.user!.role) && p.user_id !== req.user!.id)) { res.status(404).json({ error: 'Not found' }); return null; }
  return p;
}
proposals.post('/proposals/:id/compare', anyone, async (req, res) => {
  const b = cmpBody.safeParse(req.body); if (!b.success || b.data.a === b.data.b) return void res.status(400).json({ error: 'Pick two different versions' });
  const p = await seenProposal(req, res); if (!p) return;
  const have = await query<any>('SELECT version_no FROM proposal_versions WHERE proposal_id=? AND version_no IN (?)', [p.id, [b.data.a, b.data.b]]);
  if (have.length !== 2) return void res.status(404).json({ error: 'That version does not exist' });
  res.json(await queueCompare(p.id, b.data.a, b.data.b, req.user!.id));
});
proposals.get('/proposals/:id/compare', anyone, async (req, res) => {
  const p = await seenProposal(req, res); if (!p) return;
  res.json((await compareOf(p.id, num(req.query.a as string), num(req.query.b as string))) ?? { status: null });
});

// Three openings (R73): write them again, or use one (a new version with only the first paragraph changed).
proposals.post('/proposals/:id/openings', anyone, async (req, res) => {
  const p = await ownedProposal(req, res); if (!p) return;
  const more = req.body?.more === true; // R91: the next three beside the ones there, or the first three again
  const err = await queueOpenings(p.id, more);
  if (err) return void res.status(409).json({ error: err });
  await audit(req.user!.id, 'proposal_openings', `proposal=${p.id}${more ? ' more' : ''}`);
  res.status(202).json({ ok: true });
});
// R98: an opening edited before it is used; the edit is kept on its opening template as a learned example
proposals.post('/proposals/:id/openings/edit', anyone, async (req, res) => {
  const b = z.object({ index: z.number().int().min(0).nullable(), text: z.string().max(1500) }).safeParse(req.body ?? {});
  if (!b.success) return void bad(res, b.error);
  const p = await ownedProposal(req, res); if (!p) return;
  if (p.status !== 'done') return void res.status(409).json({ error: 'The proposal is not ready yet' });
  const r = await editOpening(p.id, b.data.index, b.data.text, req.user!.id);
  if (r.error) return void res.status(409).json({ error: r.error });
  await audit(req.user!.id, 'proposal_opening_edited', `proposal=${p.id} opening=${b.data.index == null ? 'in use' : b.data.index + 1} version=${r.version_no}`);
  res.json({ version_no: r.version_no });
});
// R106 (Hamza): edit an opening by chatting with the AI. A thread is one opening (index, or null for the one in the proposal now) of
// the current set of openings; its answers go into the editor, and "Save and use" (openings/edit) keeps it as an example.
const threadOf = async (proposalId: number, version: number, index: number | null) => query<any>(`SELECT m.id, m.role, m.content, m.draft, m.status, m.error_message, m.created_at, u.name AS user_name
  FROM opening_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.proposal_id=? AND m.openings_version=? AND m.opening_index <=> ? ORDER BY m.id`, [proposalId, version, index]);
const indexOf = (v: unknown) => (v === undefined || v === null || v === '' || v === 'in_use' ? null : Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : NaN);
proposals.get('/proposals/:id/openings/chat', anyone, async (req, res) => {
  const p = await seenProposal(req, res); if (!p) return;
  const index = indexOf(req.query.index); if (Number.isNaN(index)) return void res.status(400).json({ error: 'index is a number, or in_use' });
  const o = readOpenings((await query<any>('SELECT openings_json FROM proposals WHERE id=?', [p.id]))[0]?.openings_json);
  res.json({ version: o?.version ?? null, messages: o ? await threadOf(p.id, o.version, index) : [] });
});
proposals.post('/proposals/:id/openings/chat', anyone, async (req, res) => {
  const b = z.object({ index: z.number().int().min(0).nullable(), content: z.string().trim().min(2, 'Say what to change').max(2000), current: z.string().trim().min(10).max(1500) }).safeParse(req.body ?? {});
  if (!b.success) return void bad(res, b.error);
  const p = await ownedProposal(req, res); if (!p) return;
  if (p.status !== 'done') return void res.status(409).json({ error: 'The proposal is not ready yet' });
  const o = readOpenings((await query<any>('SELECT openings_json FROM proposals WHERE id=?', [p.id]))[0]?.openings_json);
  if (!o) return void res.status(409).json({ error: 'There are no openings for this proposal' });
  if (b.data.index != null && !o.items[b.data.index]) return void res.status(400).json({ error: 'There is no such opening' });
  const busy = await query(`SELECT id FROM opening_messages WHERE proposal_id=? AND role='user' AND status IN ('queued','running') LIMIT 1`, [p.id]);
  if (busy.length) return void res.status(409).json({ error: 'The AI is still answering the last message' });
  const r = await exec(`INSERT INTO opening_messages (proposal_id, opening_index, openings_version, role, content, base_text, status, user_id) VALUES (?,?,?,'user',?,?,'queued',?)`,
    [p.id, b.data.index, o.version, b.data.content, b.data.current.replace(/\r\n/g, '\n'), req.user!.id]);
  await audit(req.user!.id, 'opening_chat', `proposal=${p.id} opening=${b.data.index == null ? 'in use' : b.data.index + 1}`);
  res.status(202).json({ id: Number(r.insertId) });
});
proposals.post('/proposals/:id/openings/:i/use', anyone, async (req, res) => {
  const p = await ownedProposal(req, res); if (!p) return;
  if (p.status !== 'done') return void res.status(409).json({ error: 'The proposal is not ready yet' });
  const r = await useOpening(p.id, num(req.params.i), req.user!.id);
  if (r.error) return void res.status(409).json({ error: r.error });
  await audit(req.user!.id, 'proposal_opening_used', `proposal=${p.id} opening=${num(req.params.i) + 1} version=${r.version_no}`);
  res.json({ version_no: r.version_no });
});

proposals.post('/proposals/:id/versions', anyone, async (req, res) => {
  // the cover letter and, apart from it, the screening answers (left out: the newest version's answers stay as they are)
  const b = z.object({ html: z.string().max(200_000), answers: qaList.optional(), based_on: z.number().int().positive().nullish() }).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const p = await ownedProposal(req, res); if (!p) return;
  if (p.status !== 'done') return void res.status(409).json({ error: 'The proposal is not ready yet' });
  const html = sanitizeRich(b.data.html);
  if (!htmlToPlain(html)) return void res.status(400).json({ error: 'The proposal cannot be empty' });
  const cur = await latestVersion(p.id);
  const answers = b.data.answers?.map((x) => ({ question: x.question, answer: x.answer.trim() }));
  const answersChanged = !!answers && JSON.stringify(answers) !== JSON.stringify(cur?.answers ?? []);
  if (cur && htmlToPlain(cur.html) === htmlToPlain(html) && !answersChanged) return void res.json({ unchanged: true, version_no: cur.version_no });
  const stale = b.data.based_on && cur && cur.version_no > b.data.based_on;
  // the letter unchanged (only the answers were edited): it keeps its parts; any change to the letter makes it the person's own text
  const keepParts = cur && htmlToPlain(cur.html) === htmlToPlain(html) ? cur.parts : null;
  const no = await addVersion(p.id, html, 'manual', req.user!.id, stale ? `Edited from v${b.data.based_on}; v${cur.version_no} was saved meanwhile` : null, b.data.based_on ?? null, answers, keepParts);
  await audit(req.user!.id, 'proposal_edit', `proposal=${p.id} version=${no}`);
  res.status(201).json({ version_no: no });
});

proposals.post('/proposals/:id/restore', anyone, async (req, res) => {
  const b = z.object({ version_no: z.number().int().positive() }).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const p = await ownedProposal(req, res); if (!p) return;
  if (p.status !== 'done') return void res.status(409).json({ error: 'The proposal is not ready yet' });
  const v = (await query<any>('SELECT content_html, answers_json, parts_json FROM proposal_versions WHERE proposal_id=? AND version_no=?', [p.id, b.data.version_no]))[0];
  if (!v) return void res.status(404).json({ error: 'That version does not exist' });
  const sep = separate(v.content_html, v.answers_json); // the letter, its answers and its parts all come back
  const no = await addVersion(p.id, sep.html, 'restore', req.user!.id, `Restored from v${b.data.version_no}`, b.data.version_no, sep.answers, readParts(v.parts_json));
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
