/**
 * R74: the documents attached to a job. Added with the job on Screen a job, or later on the Job post tab; listed, opened, described
 * by hand when the AI could not read them, and removed. The person who submitted the job, or an admin or manager, can see them;
 * only the person who submitted it (or an admin) adds, describes or removes.
 */
import { Router } from 'express';
import { z } from 'zod';
import { audit, exec, query } from './db';
import { sanitizeDoc } from './html';
import { requireRole } from './auth';
import { attachmentPath, docsChanged, prepareFiles, readFile, readText, recordFiles, removeAttachment, uploadBody, MAX_FILES } from './screening/attachments';
import { join } from 'node:path';
import { readFileSync as readSync } from 'node:fs';
import { appRoot } from './config';
import { run } from './llm';

export const attachments = Router();
const anyone = requireRole();
const canSeeAll = (role: string) => role === 'admin' || role === 'manager';

async function jobOf(req: any, res: any, edit: boolean) {
  const s = (await query<any>('SELECT id, user_id, status FROM screenings WHERE id=? AND discarded_at IS NULL', [Number(req.params.id)]))[0];
  const ok = s && (s.user_id === req.user.id || (edit ? req.user.role === 'admin' : canSeeAll(req.user.role)));
  if (!ok) { res.status(404).json({ error: 'Not found' }); return null; }
  return s;
}
async function fileOf(req: any, res: any, edit: boolean) {
  const a = (await query<any>('SELECT a.*, s.user_id FROM job_attachments a JOIN screenings s ON s.id=a.screening_id WHERE a.id=?', [Number(req.params.id)]))[0];
  const ok = a && (a.user_id === req.user.id || (edit ? req.user.role === 'admin' : canSeeAll(req.user.role)));
  if (!ok) { res.status(404).json({ error: 'Not found' }); return null; }
  return a;
}
/** The files of a job, as the page shows them (the text itself is not sent: it can be long). */
export const attachmentList = (screeningId: number) => query<any>(`SELECT a.id, a.file_name, a.kind, a.size_bytes, a.status, a.read_by, a.error, a.added_after_screening, a.created_at, a.method, a.pages, a.attempts, a.next_try_at, a.digest_status,
  CHAR_LENGTH(COALESCE(a.text_content, '')) AS chars, u.name AS user_name FROM job_attachments a LEFT JOIN users u ON u.id=a.created_by WHERE a.screening_id=? ORDER BY a.id`, [screeningId]);

attachments.get('/screenings/:id/attachments', anyone, async (req, res) => {
  const s = await jobOf(req, res, false); if (!s) return;
  res.json({ items: await attachmentList(s.id), max: MAX_FILES });
});
// Files added after the job was screened: the matching, the proposal, the chat and the review read them from now on.
attachments.post('/screenings/:id/attachments', anyone, async (req, res) => {
  const b = uploadBody.safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Choose one or more files' });
  const s = await jobOf(req, res, true); if (!s) return;
  const have = Number((await query<any>('SELECT COUNT(*) n FROM job_attachments WHERE screening_id=?', [s.id]))[0].n);
  const { ready, errors } = await prepareFiles(b.data.files, have, req.user!.id);
  await recordFiles((sql, p) => exec(sql, p as any[]), s.id, req.user!.id, ready, s.status === 'done');
  if (ready.length) await docsChanged(s.id); // R116: what was worked out without them is redone
  await audit(req.user!.id, 'attachments_add', `screening=${s.id} files=${ready.length}${errors.length ? ' refused=' + errors.length : ''}`);
  res.json({ saved: ready.length, errors, items: await attachmentList(s.id) });
});
// The file itself, to open or save. Shown inline only for kinds a browser shows safely; anything else is a download.
attachments.get('/attachments/:id/file', anyone, async (req, res) => {
  const a = await fileOf(req, res, false); if (!a) return;
  const inline = a.kind === 'pdf' || a.kind === 'image';
  res.setHeader('Content-Type', a.kind === 'text' ? 'text/plain; charset=utf-8' : a.mime);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.file_name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // a PDF is shown in the app's viewer (R83), and the browser's PDF viewer refuses a sandboxed page: it gets no scripts instead
  if (a.kind === 'pdf') { res.setHeader('X-Frame-Options', 'SAMEORIGIN'); res.setHeader('Content-Security-Policy', "frame-ancestors 'self'"); } // only this app may frame it
  else res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'");
  res.sendFile(attachmentPath(a.stored_as), (e) => { if (e && !res.headersSent) res.status(404).json({ error: 'The file is missing' }); });
});
// What the document viewer shows for a file a browser cannot show by itself (R83): a Word file as a page, a text file as text.
attachments.get('/attachments/:id/view', anyone, async (req, res) => {
  const a = await fileOf(req, res, false); if (!a) return;
  try {
    if (a.kind === 'docx') { const mammoth = require('mammoth'); const r = await mammoth.convertToHtml({ buffer: readFile(a.stored_as) }); return void res.json({ html: sanitizeDoc(String(r.value ?? '')) }); }
    if (a.kind === 'text') return void res.json({ text: readFile(a.stored_as).toString('utf8').slice(0, 400_000) });
    res.json({});
  } catch { res.status(422).json({ error: 'This file could not be shown. Download it instead.' }); }
});
// What the AI reads from it, to check; and what it shows, typed by the person when the AI could not read it.
attachments.get('/attachments/:id/text', anyone, async (req, res) => {
  const a = await fileOf(req, res, false); if (!a) return;
  res.json({ text: a.text_content ?? '', read_by: a.read_by });
});
attachments.put('/attachments/:id/text', anyone, async (req, res) => {
  const b = z.object({ text: z.string().trim().min(10, 'Say in a sentence or more what the file shows').max(20000) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: b.error.issues[0]?.message ?? 'Not valid' });
  const a = await fileOf(req, res, true); if (!a) return;
  if (a.status === 'queued' || a.status === 'running') return void res.status(409).json({ error: 'The AI is still reading it' });
  await exec(`UPDATE job_attachments SET status='done', text_content=?, read_by='person', error=NULL WHERE id=?`, [b.data.text, a.id]);
  await docsChanged(a.screening_id);
  await audit(req.user!.id, 'attachment_described', `attachment=${a.id}`);
  res.json({ ok: true });
});
// Read again by the AI (after an error, or after the AI in Settings was changed).
attachments.post('/attachments/:id/read', anyone, async (req, res) => {
  const a = await fileOf(req, res, true); if (!a) return;
  if (a.status === 'queued' || a.status === 'running') return void res.json({ ok: true, already: true });
  // R123: any file can be read again by the AI, with all its tries from the start
  await exec(`UPDATE job_attachments SET status='queued', error=NULL, attempts=0, next_try_at=NULL WHERE id=?`, [a.id]);
  res.status(202).json({ ok: true });
});
attachments.delete('/attachments/:id', anyone, async (req, res) => {
  const a = await fileOf(req, res, true); if (!a) return;
  await removeAttachment(a.id);
  await docsChanged(a.screening_id);
  await audit(req.user!.id, 'attachment_removed', `screening=${a.screening_id} attachment=${a.id}`);
  res.json({ ok: true });
});

/**
 * R122 (Hamza): files attached on the server were not read, while the same files worked locally. Check file reading (admins, Settings)
 * tests each part on this server: reading a PDF and a Word file in code (and the module the PDF reader needs), the Node version, and,
 * when asked, the AI reading a picture. The largest upload the server accepts is tested by the page itself (check-upload), because the
 * web server in front of the app refuses a bigger one before it gets here.
 */
attachments.get('/admin/check-files', requireRole('admin'), async (req, res) => {
  const dir = join(appRoot, 'assets', 'selftest'), out: Record<string, unknown> = { node: process.version, platform: `${process.platform} ${process.arch}`, app_upload_limit_mb: 40 };
  const test = async (kind: string, file: string) => {
    const t0 = Date.now();
    try { const text = await readText(kind, readSync(join(dir, file))); const ok = /PINEAPPLE-42/.test(text); return { ok, chars: text.length, ms: Date.now() - t0, ...(ok ? {} : { error: 'Read, but the test words were not in the text' }) }; }
    catch (e) { return { ok: false, ms: Date.now() - t0, error: String((e as Error).message || e).slice(0, 300) }; }
  };
  out.pdf_in_code = await test('pdf', 'sample.pdf');
  out.word_in_code = await test('docx', 'sample.docx');
  try { require('@napi-rs/canvas'); out.pdf_module = { ok: true }; } catch (e) { out.pdf_module = { ok: false, error: String((e as Error).message).slice(0, 300) }; }
  if (req.query.ai === '1') { // costs one AI call
    const t0 = Date.now();
    try {
      const r = await run({ label: 'check: picture', timeoutMs: 120_000, files: [{ path: join(dir, 'sample.png'), name: 'file.png' }], system: 'You read a picture for a check of the app.',
        prompt: 'Read the file ./file.png (use the Read tool). What app name is written at the top? Answer in "name".', schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } });
      const name = String((r.data as any)?.name ?? ''); out.picture_by_ai = { ok: /freshcart/i.test(name), read: name.slice(0, 80), ms: Date.now() - t0 };
    } catch (e) { out.picture_by_ai = { ok: false, ms: Date.now() - t0, error: String((e as Error).message || e).slice(0, 300) }; }
  }
  res.json(out);
});
attachments.post('/admin/check-upload', requireRole('admin'), async (req, res) => {
  res.json({ ok: true, bytes: String((req.body as any)?.data ?? '').length });
});

