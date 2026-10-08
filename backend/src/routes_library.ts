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
  res.json({ profiles: await query(`SELECT id, name, tagline, price, lowest_price, gitlab_account, github_url, profile_url, services, industries, voice, signature, stats_allowed, submitted_by, rules,
    notes, active, added_via, created_at FROM upwork_profiles ${all ? '' : 'WHERE active=1'} ORDER BY name`) });
});
// A GitLab account is either a username (letters, digits, dot, dash, underscore) or the full https link to it (also self-hosted GitLab).
const gitlabAccount = z.string().trim().max(255).refine((v) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v) || /^https:\/\/[^\s/]+\/[^\s]+$/.test(v), 'Enter a GitLab username or the full https link')
  .or(z.literal('')).nullish().transform((v) => v || null);
const price = z.number('Price must be a number').min(0, 'Price cannot be negative').max(100000, 'Price is too large')
  .refine((v) => Math.round(v * 100) / 100 === v, 'Price can have at most 2 decimals').nullish().transform((v) => v ?? null);
export const profileBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120), tagline: optText(200), price, lowest_price: price, gitlab_account: gitlabAccount, github_url: optUrl,
  profile_url: optUrl, services: optText(2000), industries: optText(500), voice: optText(300), signature: optText(500), stats_allowed: optText(500),
  submitted_by: optText(300), rules: optText(4000), notes: optText(500), active: z.boolean().optional(),
});
/** The profile fields besides name and active, in one place for insert and update. */
export const PROFILE_FIELDS = ['tagline', 'price', 'lowest_price', 'gitlab_account', 'github_url', 'profile_url', 'services', 'industries', 'voice', 'signature', 'stats_allowed', 'submitted_by', 'rules', 'notes'] as const;
library.post('/profiles', admin, async (req, res) => {
  const b = profileBody.safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  try {
    const r = await exec(`INSERT INTO upwork_profiles (name, ${PROFILE_FIELDS.join(', ')}, active) VALUES (?)`,
      [[b.data.name, ...PROFILE_FIELDS.map((k) => (b.data as any)[k] ?? null), b.data.active === false ? 0 : 1]]);
    await audit(req.user!.id, 'profile_create', `id=${r.insertId}`);
    res.status(201).json({ id: r.insertId });
  } catch (e) { if (dup(e)) return void res.status(409).json({ error: 'A profile with that name already exists' }); throw e; }
});
library.patch('/profiles/:id', admin, async (req, res) => {
  const b = profileBody.partial().safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const sets: string[] = []; const p: any[] = [];
  for (const k of ['name', ...PROFILE_FIELDS]) if (k in b.data) { sets.push(`${k}=?`); p.push((b.data as any)[k]); }
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
  const cats = await query<any>('SELECT id, name, sort_order, is_compliance FROM tag_categories ORDER BY sort_order, name');
  const tags = await query<any>(
    `SELECT t.id, t.category_id, t.name, t.weight, t.description, t.active, t.sort_order,
       (SELECT COUNT(*) FROM project_tags pt WHERE pt.tag_id=t.id) AS project_count
     FROM tags t ORDER BY t.sort_order, t.name`);
  res.json({ categories: cats.map((c) => ({ ...c, is_compliance: !!c.is_compliance, tags: tags.filter((t) => t.category_id === c.id) })) });
});

const categoryBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120), sort_order: z.number().int().min(0).max(9999).optional(), is_compliance: z.boolean().optional(),
});
library.post('/admin/categories', admin, async (req, res) => {
  const b = categoryBody.safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  try {
    const r = await exec('INSERT INTO tag_categories (name, sort_order, is_compliance) VALUES (?, COALESCE(?, (SELECT COALESCE(MAX(c.sort_order),0)+1 FROM tag_categories c)), ?)',
      [b.data.name, b.data.sort_order ?? null, b.data.is_compliance ? 1 : 0]);
    await audit(req.user!.id, 'category_create', `id=${r.insertId}`);
    res.status(201).json({ id: r.insertId });
  } catch (e) { if (dup(e)) return void res.status(409).json({ error: 'A category with that name already exists' }); throw e; }
});
library.patch('/admin/categories/:id', admin, async (req, res) => {
  const b = categoryBody.partial().safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const sets: string[] = []; const p: any[] = [];
  if (b.data.name !== undefined) { sets.push('name=?'); p.push(b.data.name); }
  if (b.data.sort_order !== undefined) { sets.push('sort_order=?'); p.push(b.data.sort_order); }
  if (b.data.is_compliance !== undefined) { sets.push('is_compliance=?'); p.push(b.data.is_compliance ? 1 : 0); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  try {
    const r = await exec(`UPDATE tag_categories SET ${sets.join(',')} WHERE id=?`, [...p, id(req.params.id)]);
    if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  } catch (e) { if (dup(e)) return void res.status(409).json({ error: 'A category with that name already exists' }); throw e; }
  await audit(req.user!.id, 'category_update', `id=${req.params.id}`);
  res.json({ ok: true });
});
library.delete('/admin/categories/:id', admin, async (req, res) => {
  try {
    const r = await exec('DELETE FROM tag_categories WHERE id=?', [id(req.params.id)]);
    if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  } catch (e) {
    if (inUse(e)) return void res.status(409).json({ error: 'This category still has tags. Move or delete its tags first.' });
    throw e;
  }
  await audit(req.user!.id, 'category_delete', `id=${req.params.id}`);
  res.json({ ok: true });
});

// The score (weight) is what a shared tag is worth when projects are matched to a job.
const tagBody = z.object({
  category_id: z.number().int().positive(), name: z.string().trim().min(1, 'Name is required').max(120),
  weight: z.number().int('The score must be a whole number').min(0, 'The score cannot be negative').max(10, 'The score can be at most 10'),
  description: optText(500), active: z.boolean().optional(),
});
library.post('/admin/tags', admin, async (req, res) => {
  const b = tagBody.safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  try {
    const r = await exec('INSERT INTO tags (category_id, name, weight, description, active, sort_order) VALUES (?,?,?,?,?, (SELECT COALESCE(MAX(t.sort_order),0)+1 FROM tags t))',
      [b.data.category_id, b.data.name, b.data.weight, b.data.description, b.data.active === false ? 0 : 1]);
    await audit(req.user!.id, 'tag_create', `id=${r.insertId}`);
    res.status(201).json({ id: r.insertId });
  } catch (e: any) {
    if (dup(e)) return void res.status(409).json({ error: 'That tag already exists in this category' });
    if (e?.code === 'ER_NO_REFERENCED_ROW_2') return void res.status(400).json({ error: 'Unknown category' });
    throw e;
  }
});
library.patch('/admin/tags/:id', admin, async (req, res) => {
  const b = tagBody.partial().safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const sets: string[] = []; const p: any[] = [];
  for (const k of ['category_id', 'name', 'weight', 'description'] as const) if (k in b.data) { sets.push(`${k}=?`); p.push((b.data as any)[k]); }
  if (b.data.active !== undefined) { sets.push('active=?'); p.push(b.data.active ? 1 : 0); }
  if (!sets.length) return void res.status(400).json({ error: 'Nothing to change' });
  try {
    const r = await exec(`UPDATE tags SET ${sets.join(',')} WHERE id=?`, [...p, id(req.params.id)]);
    if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  } catch (e: any) {
    if (dup(e)) return void res.status(409).json({ error: 'That tag already exists in this category' });
    if (e?.code === 'ER_NO_REFERENCED_ROW_2') return void res.status(400).json({ error: 'Unknown category' });
    throw e;
  }
  await audit(req.user!.id, 'tag_update', `id=${req.params.id} fields=${Object.keys(b.data).join(',')}`);
  res.json({ ok: true });
});
library.delete('/admin/tags/:id', admin, async (req, res) => {
  try {
    const r = await exec('DELETE FROM tags WHERE id=?', [id(req.params.id)]); // saved job tags keep their copied name
    if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  } catch (e) {
    if (inUse(e)) return void res.status(409).json({ error: 'Projects use this tag. Remove it from them first, or disable it instead.' });
    throw e;
  }
  await audit(req.user!.id, 'tag_delete', `id=${req.params.id}`);
  res.json({ ok: true });
});

// ---------- industries ----------
async function industryPayload(rows: any[]) {
  if (!rows.length) return rows;
  const links = await query<any>(
    `SELECT pi.industry_id, p.id AS project_id, p.name FROM project_industries pi JOIN projects p ON p.id=pi.project_id WHERE pi.industry_id IN (?) ORDER BY p.name`,
    [rows.map((r) => r.id)]);
  return rows.map((r) => ({ ...r, projects: links.filter((l) => l.industry_id === r.id).map((l) => ({ id: l.project_id, name: l.name })) }));
}
library.get('/industries', anyone, async (_req, res) => {
  res.json({ industries: await industryPayload(await query('SELECT id, name, description, active, created_at FROM industries ORDER BY name')) });
});
library.get('/industries/:id', anyone, async (req, res) => {
  const rows = await industryPayload(await query('SELECT id, name, description, active, created_at FROM industries WHERE id=?', [id(req.params.id)]));
  if (!rows[0]) return void res.status(404).json({ error: 'Not found' });
  res.json({ industry: rows[0] });
});
const industryBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120), description: optText(500), active: z.boolean().optional(),
  project_ids: z.array(z.number().int().positive()).max(1000).optional(),
});
async function saveIndustry(req: any, res: any, industryId: number | null) {
  const b = (industryId ? industryBody.partial() : industryBody).safeParse(req.body);
  if (!b.success) return void bad(res, b.error);
  const d: any = b.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let iid = industryId;
    if (!iid) {
      const [r]: any = await conn.query('INSERT INTO industries (name, description, active) VALUES (?,?,?)', [d.name, d.description, d.active === false ? 0 : 1]);
      iid = r.insertId;
    } else {
      const sets: string[] = []; const p: any[] = [];
      for (const k of ['name', 'description']) if (k in d) { sets.push(`${k}=?`); p.push(d[k]); }
      if (d.active !== undefined) { sets.push('active=?'); p.push(d.active ? 1 : 0); }
      if (sets.length) {
        const [r]: any = await conn.query(`UPDATE industries SET ${sets.join(',')} WHERE id=?`, [...p, iid]);
        if (!r.affectedRows) { await conn.rollback(); return void res.status(404).json({ error: 'Not found' }); }
      } else if (!((await conn.query('SELECT id FROM industries WHERE id=?', [iid])) as any)[0].length) { await conn.rollback(); return void res.status(404).json({ error: 'Not found' }); }
    }
    if (d.project_ids) {
      const ids = [...new Set<number>(d.project_ids)];
      await conn.query('DELETE FROM project_industries WHERE industry_id=?', [iid]);
      if (ids.length) {
        const [ok]: any = await conn.query('SELECT id FROM projects WHERE id IN (?)', [ids]);
        if (ok.length !== ids.length) throw Object.assign(new Error('unknown project'), { code: 'BAD_PROJECT' });
        await conn.query('INSERT INTO project_industries (industry_id, project_id) VALUES ?', [ids.map((pid) => [iid, pid])]);
      }
    }
    await conn.commit();
    await audit(req.user.id, industryId ? 'industry_update' : 'industry_create', `id=${iid}`);
    res.status(industryId ? 200 : 201).json({ id: iid });
  } catch (e: any) {
    await conn.rollback();
    if (dup(e)) return void res.status(409).json({ error: 'An industry with that name already exists' });
    if (e?.code === 'BAD_PROJECT') return void res.status(400).json({ error: 'One of the projects does not exist' });
    throw e;
  } finally { conn.release(); }
}
library.post('/industries', editor, (req, res) => saveIndustry(req, res, null));
library.patch('/industries/:id', editor, (req, res) => saveIndustry(req, res, id(req.params.id)));
library.delete('/industries/:id', editor, async (req, res) => {
  const r = await exec('DELETE FROM industries WHERE id=?', [id(req.params.id)]); // its project links go with it
  if (!r.affectedRows) return void res.status(404).json({ error: 'Not found' });
  await audit(req.user!.id, 'industry_delete', `id=${req.params.id}`);
  res.json({ ok: true });
});

// ---------- projects ----------
const projectSelect = `SELECT p.id, p.name, p.live_link, p.landing_link, p.system_link, p.mobile_link, p.staging_link, p.case_study_link, p.showable_publicly, p.notes,
  p.overview, p.case_study_summary, p.added_via, p.active, p.created_at, p.updated_at FROM projects p`;
async function withTags(rows: any[]) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const links = await query<any>(
    `SELECT pt.project_id, t.id AS tag_id, t.name, t.category_id FROM project_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.project_id IN (?) ORDER BY t.sort_order`, [ids]);
  const inds = await query<any>(
    `SELECT pi.project_id, i.id, i.name FROM project_industries pi JOIN industries i ON i.id=pi.industry_id WHERE pi.project_id IN (?) ORDER BY i.name`, [ids]);
  return rows.map((r) => ({ ...r,
    tags: links.filter((l) => l.project_id === r.id).map((l) => ({ id: l.tag_id, name: l.name, category_id: l.category_id })),
    industries: inds.filter((l) => l.project_id === r.id).map((l) => ({ id: l.id, name: l.name })) }));
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
  landing_link: optUrl, system_link: optUrl, mobile_link: optText(500), staging_link: optUrl, case_study_link: optUrl, overview: optText(8000), case_study_summary: optText(8000),
  active: z.boolean().optional(), tag_ids: z.array(z.number().int().positive()).max(200).optional(),
  industry_ids: z.array(z.number().int().positive()).max(200).optional(),
});
/** The project fields besides name and active. The proposal link is `live_link`; the others are kept for the person to choose from. */
const PROJECT_FIELDS = ['live_link', 'landing_link', 'system_link', 'mobile_link', 'staging_link', 'case_study_link', 'showable_publicly', 'notes', 'overview', 'case_study_summary'];
async function setTags(conn: any, projectId: number, tagIds: number[]) {
  const ids = [...new Set(tagIds)];
  await conn.query('DELETE FROM project_tags WHERE project_id=?', [projectId]);
  if (ids.length) {
    const [ok] = await conn.query('SELECT id FROM tags WHERE id IN (?)', [ids]);
    if ((ok as any[]).length !== ids.length) throw Object.assign(new Error('unknown tag'), { code: 'BAD_TAG' });
    await conn.query('INSERT INTO project_tags (project_id, tag_id) VALUES ?', [ids.map((t) => [projectId, t])]);
  }
}
async function setIndustries(conn: any, projectId: number, industryIds: number[]) {
  const ids = [...new Set(industryIds)];
  await conn.query('DELETE FROM project_industries WHERE project_id=?', [projectId]);
  if (ids.length) {
    const [ok] = await conn.query('SELECT id FROM industries WHERE id IN (?)', [ids]);
    if ((ok as any[]).length !== ids.length) throw Object.assign(new Error('unknown industry'), { code: 'BAD_INDUSTRY' });
    await conn.query('INSERT INTO project_industries (project_id, industry_id) VALUES ?', [ids.map((i) => [projectId, i])]);
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
      const [r]: any = await conn.query(`INSERT INTO projects (name, ${PROJECT_FIELDS.join(', ')}, active) VALUES (?)`,
        [[d.name, ...PROJECT_FIELDS.map((k) => d[k] ?? null), d.active === false ? 0 : 1]]);
      pid = r.insertId;
    } else {
      const sets: string[] = []; const p: any[] = [];
      for (const k of ['name', ...PROJECT_FIELDS]) if (k in d) { sets.push(`${k}=?`); p.push(d[k]); }
      if (d.active !== undefined) { sets.push('active=?'); p.push(d.active ? 1 : 0); }
      if (sets.length) {
        const [r]: any = await conn.query(`UPDATE projects SET ${sets.join(',')} WHERE id=?`, [...p, pid]);
        if (!r.affectedRows) { await conn.rollback(); return void res.status(404).json({ error: 'Not found' }); }
      } else if (!(await conn.query('SELECT id FROM projects WHERE id=?', [pid]) as any)[0].length) { await conn.rollback(); return void res.status(404).json({ error: 'Not found' }); }
    }
    if (d.tag_ids) await setTags(conn, pid!, d.tag_ids);
    if (d.industry_ids) await setIndustries(conn, pid!, d.industry_ids);
    await conn.commit();
    await audit(req.user.id, projectId ? 'project_update' : 'project_create', `id=${pid}`);
    res.status(projectId ? 200 : 201).json({ id: pid });
  } catch (e: any) {
    await conn.rollback();
    if (dup(e)) return void res.status(409).json({ error: 'A project with that name already exists' });
    if (e?.code === 'BAD_TAG') return void res.status(400).json({ error: 'One of the tags does not exist' });
    if (e?.code === 'BAD_INDUSTRY') return void res.status(400).json({ error: 'One of the industries does not exist' });
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
