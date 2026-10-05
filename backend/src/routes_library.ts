import { Router } from 'express';
import { z } from 'zod';
import { pool, audit, exec, query } from './db';
import { requireRole } from './auth';

export const library = Router();
const admin = requireRole('admin');
const editor = requireRole('admin', 'manager'); // who can edit the project library
const anyone = requireRole();

const bad = (res: any, e: z.ZodError) => res.status(400).json({ error: e.issues[0]?.message ?? 'Invalid input' });
const dup = (e: any) => e?.code === 'ER_DUP_ENTRY';
const inUse = (e: any) => e?.code === 'ER_ROW_IS_REFERENCED_2' || e?.code === 'ER_ROW_IS_REFERENCED';
const url = z.string().trim().max(500).refine((v) => /^https?:\/\/\S+$/i.test(v), 'Enter a full link starting with http:// or https://');
const optUrl = url.or(z.literal('')).nullish().transform((v) => v || null);
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const id = (v: unknown) => (/^\d+$/.test(String(v)) ? Number(v) : -1);

// ---------- rules (read only) ----------
library.get('/rules', anyone, async (_req, res) => {
  res.json({ rules: await query('SELECT code, type, rule FROM rules WHERE active=1 ORDER BY type, CAST(SUBSTRING(code,2) AS UNSIGNED)') });
});

// ---------- Upwork profiles ----------
library.get('/profiles', anyone, async (req, res) => {
  const all = req.query.all === '1' && req.user!.role === 'admin';
  res.json({ profiles: await query(`SELECT id, name, profile_url, notes, active, created_at FROM upwork_profiles ${all ? '' : 'WHERE active=1'} ORDER BY name`) });
});
const profileBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120), profile_url: optUrl, notes: optText(500), active: z.boolean().optional(),
});
library.post('/profiles', admin, async (req, res) => {
  const b = profileBody.safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  try {
    const r = await exec('INSERT INTO upwork_profiles (name, profile_url, notes, active) VALUES (?,?,?,?)', [b.data.name, b.data.profile_url, b.data.notes, b.data.active === false ? 0 : 1]);
    await audit(req.user!.id, 'profile_create', `id=${r.insertId}`);
    res.status(201).json({ id: r.insertId });
  } catch (e) { if (dup(e)) return void res.status(409).json({ error: 'A profile with that name already exists' }); throw e; }
});
library.patch('/profiles/:id', admin, async (req, res) => {
  const b = profileBody.partial().safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const sets: string[] = []; const p: any[] = [];
  for (const k of ['name', 'profile_url', 'notes'] as const) if (k in b.data) { sets.push(`${k}=?`); p.push((b.data as any)[k]); }
  if (b.data.active !== undefined) { sets.push('active=?'); p.push(b.data.active ? 1 : 0); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  try {
    const r = await exec(`UPDATE upwork_profiles SET ${sets.join(',')} WHERE id=?`, [...p, id(req.params.id)]);
    if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  } catch (e) { if (dup(e)) return void res.status(409).json({ error: 'A profile with that name already exists' }); throw e; }
  await audit(req.user!.id, 'profile_update', `id=${req.params.id}`);
  res.json({ ok: true });
});
library.delete('/profiles/:id', admin, async (req, res) => {
  try {
    const r = await exec('DELETE FROM upwork_profiles WHERE id=?', [id(req.params.id)]);
    if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  } catch (e) {
    if (inUse(e)) return void res.status(409).json({ error: 'This profile has screenings. Disable it instead of deleting it.' });
    throw e;
  }
  await audit(req.user!.id, 'profile_delete', `id=${req.params.id}`);
  res.json({ ok: true });
});

// ---------- tags and categories ----------
library.get('/tags', anyone, async (_req, res) => {
  const cats = await query<any>('SELECT id, name, sort_order FROM tag_categories ORDER BY sort_order, name');
  const tags = await query<any>('SELECT id, category_id, name, weight, description, active FROM tags ORDER BY sort_order, name');
  res.json({ categories: cats.map((c) => ({ ...c, tags: tags.filter((t) => t.category_id === c.id) })) });
});
const tagBody = z.object({
  category_id: z.number().int().positive(), name: z.string().trim().min(1, 'Name is required').max(120),
  weight: z.number().int().min(0).max(5), description: optText(500), active: z.boolean().optional(),
});
library.post('/admin/tags', admin, async (req, res) => {
  const b = tagBody.safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  try {
    const r = await exec('INSERT INTO tags (category_id, name, weight, description, sort_order) VALUES (?,?,?,?, (SELECT COALESCE(MAX(t.sort_order),0)+1 FROM tags t))',
      [b.data.category_id, b.data.name, b.data.weight, b.data.description]);
    await audit(req.user!.id, 'tag_create', `id=${r.insertId}`);
    res.status(201).json({ id: r.insertId });
  } catch (e: any) {
    if (dup(e)) return void res.status(409).json({ error: 'That tag already exists in this category' });
    if (e?.code === 'ER_NO_REFERENCED_ROW_2') return void res.status(400).json({ error: 'Unknown category' });
    throw e;
  }
});
library.patch('/admin/tags/:id', admin, async (req, res) => {
  const b = tagBody.omit({ category_id: true }).partial().safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const sets: string[] = []; const p: any[] = [];
  for (const k of ['name', 'weight', 'description'] as const) if (k in b.data) { sets.push(`${k}=?`); p.push((b.data as any)[k]); }
  if (b.data.active !== undefined) { sets.push('active=?'); p.push(b.data.active ? 1 : 0); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  try {
    const r = await exec(`UPDATE tags SET ${sets.join(',')} WHERE id=?`, [...p, id(req.params.id)]);
    if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  } catch (e) { if (dup(e)) return void res.status(409).json({ error: 'That tag already exists in this category' }); throw e; }
  await audit(req.user!.id, 'tag_update', `id=${req.params.id}`);
  res.json({ ok: true });
});

// ---------- projects ----------
const projectSelect = `SELECT p.id, p.name, p.live_link, p.showable_publicly, p.notes, p.active, p.created_at, p.updated_at FROM projects p`;
async function withTags(rows: any[]) {
  if (!rows.length) return rows;
  const links = await query<any>(
    `SELECT pt.project_id, t.id AS tag_id, t.name, t.category_id FROM project_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.project_id IN (?) ORDER BY t.sort_order`,
    [rows.map((r) => r.id)]);
  return rows.map((r) => ({ ...r, tags: links.filter((l) => l.project_id === r.id).map((l) => ({ id: l.tag_id, name: l.name, category_id: l.category_id })) }));
}
library.get('/projects', anyone, async (_req, res) => {
  res.json({ projects: await withTags(await query(`${projectSelect} ORDER BY p.name`)) });
});
library.get('/projects/:id', anyone, async (req, res) => {
  const rows = await withTags(await query(`${projectSelect} WHERE p.id=?`, [id(req.params.id)]));
  if (!rows[0]) return void res.status(404).json({ error: 'Not found' });
  res.json({ project: rows[0] });
});
const projectBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(190), live_link: optUrl, showable_publicly: optText(60), notes: optText(4000),
  active: z.boolean().optional(), tag_ids: z.array(z.number().int().positive()).max(200).optional(),
});
async function setTags(conn: any, projectId: number, tagIds: number[]) {
  const ids = [...new Set(tagIds)];
  await conn.query('DELETE FROM project_tags WHERE project_id=?', [projectId]);
  if (ids.length) {
    const [ok] = await conn.query('SELECT id FROM tags WHERE id IN (?)', [ids]);
    if ((ok as any[]).length !== ids.length) throw Object.assign(new Error('unknown tag'), { code: 'BAD_TAG' });
    await conn.query('INSERT INTO project_tags (project_id, tag_id) VALUES ?', [ids.map((t) => [projectId, t])]);
  }
}
async function saveProject(req: any, res: any, projectId: number | null) {
  const b = (projectId ? projectBody.partial() : projectBody).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const d: any = b.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let pid = projectId;
    if (!pid) {
      const [r]: any = await conn.query('INSERT INTO projects (name, live_link, showable_publicly, notes, active) VALUES (?,?,?,?,?)',
        [d.name, d.live_link, d.showable_publicly, d.notes, d.active === false ? 0 : 1]);
      pid = r.insertId;
    } else {
      const sets: string[] = []; const p: any[] = [];
      for (const k of ['name', 'live_link', 'showable_publicly', 'notes']) if (k in d) { sets.push(`${k}=?`); p.push(d[k]); }
      if (d.active !== undefined) { sets.push('active=?'); p.push(d.active ? 1 : 0); }
      if (sets.length) {
        const [r]: any = await conn.query(`UPDATE projects SET ${sets.join(',')} WHERE id=?`, [...p, pid]);
        if (!r.affectedRows) { await conn.rollback(); return void res.status(404).json({ error: 'Not found' }); }
      } else if (!(await conn.query('SELECT id FROM projects WHERE id=?', [pid]) as any)[0].length) { await conn.rollback(); return void res.status(404).json({ error: 'Not found' }); }
    }
    if (d.tag_ids) await setTags(conn, pid!, d.tag_ids);
    await conn.commit();
    await audit(req.user.id, projectId ? 'project_update' : 'project_create', `id=${pid}`);
    res.status(projectId ? 200 : 201).json({ id: pid });
  } catch (e: any) {
    await conn.rollback();
    if (dup(e)) return void res.status(409).json({ error: 'A project with that name already exists' });
    if (e?.code === 'BAD_TAG') return void res.status(400).json({ error: 'One of the tags does not exist' });
    throw e;
  } finally { conn.release(); }
}
library.post('/projects', editor, (req, res) => saveProject(req, res, null));
library.patch('/projects/:id', editor, (req, res) => saveProject(req, res, id(req.params.id)));
library.delete('/projects/:id', editor, async (req, res) => {
  const r = await exec('DELETE FROM projects WHERE id=?', [id(req.params.id)]); // its tag links go with it
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'project_delete', `id=${req.params.id}`);
  res.json({ ok: true });
});
