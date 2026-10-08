import { Router } from 'express';
import { z } from 'zod';
import { audit, exec, query } from './db';
import { requireRole } from './auth';
import { htmlToPlain } from './html';
import { typeFacts } from './proposal/guide';

/** The Writing guide page: everyone reads it, managers and admins edit it. Every save is a new version; old versions can be restored. */
export const writing = Router();
const anyone = requireRole();
const editor = requireRole('admin', 'manager');

writing.get('/writing-docs', anyone, async (_req, res) => {
  // the proposal types are the templates (used by the app's writer and the plugin); the docs are the rules shared by every type
  const types = (await query<any>(`SELECT t.id, t.name, t.description, t.body_html, t.priority, t.active, t.updated_at,
      (SELECT COUNT(*) FROM template_signals ts WHERE ts.template_id=t.id) AS signal_count, (SELECT COUNT(*) FROM template_samples sm WHERE sm.template_id=t.id) AS sample_count
    FROM templates t ORDER BY t.active DESC, t.priority, t.name`)).map(({ body_html, ...t }) => ({ ...t, ...typeFacts(htmlToPlain(body_html)) }));
  res.json({ types, docs: await query(`SELECT d.id, d.doc_key, d.kind, d.title, d.sort_order, d.active, d.updated_at, u.name AS updated_by_name, CHAR_LENGTH(d.content) AS chars,
    (SELECT COUNT(*) FROM writing_doc_versions v WHERE v.doc_id=d.id) AS versions FROM writing_docs d LEFT JOIN users u ON u.id=d.updated_by WHERE d.kind<>'type' ORDER BY d.sort_order, d.doc_key`) });
});
writing.get('/writing-docs/:id', anyone, async (req, res) => {
  const d = (await query<any>('SELECT * FROM writing_docs WHERE id=?', [Number(req.params.id)]))[0];
  if (!d) return void res.status(404).json({ error: 'Not found' });
  const versions = await query('SELECT v.id, v.note, v.created_at, u.name AS created_by_name, CHAR_LENGTH(v.content) AS chars FROM writing_doc_versions v LEFT JOIN users u ON u.id=v.created_by WHERE v.doc_id=? ORDER BY v.id DESC', [d.id]);
  res.json({ doc: d, versions });
});
writing.get('/writing-docs/:id/versions/:vid', anyone, async (req, res) => {
  const v = (await query<any>('SELECT id, content, note, created_at FROM writing_doc_versions WHERE id=? AND doc_id=?', [Number(req.params.vid), Number(req.params.id)]))[0];
  if (!v) return void res.status(404).json({ error: 'Not found' });
  res.json({ version: v });
});
writing.put('/writing-docs/:id', editor, async (req, res) => {
  const b = z.object({ content: z.string().trim().min(20, 'The text looks too short').max(100_000), title: z.string().trim().min(1).max(160).optional(),
    note: z.string().trim().max(250).optional(), active: z.boolean().optional() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0].message });
  const d = (await query<any>('SELECT id, content FROM writing_docs WHERE id=?', [Number(req.params.id)]))[0];
  if (!d) return void res.status(404).json({ error: 'Not found' });
  await exec('UPDATE writing_docs SET content=?, title=COALESCE(?, title), active=COALESCE(?, active), updated_by=? WHERE id=?',
    [b.data.content, b.data.title ?? null, b.data.active === undefined ? null : b.data.active ? 1 : 0, req.user!.id, d.id]);
  if (b.data.content !== d.content) await exec('INSERT INTO writing_doc_versions (doc_id, content, note, created_by) VALUES (?,?,?,?)', [d.id, b.data.content, b.data.note || null, req.user!.id]);
  await audit(req.user!.id, 'writing_doc_save', `id=${d.id}`);
  res.json({ ok: true });
});
