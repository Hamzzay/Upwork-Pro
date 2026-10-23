/**
 * R123 (Hamza): files arrive in chunks, so no size limit in front of the app (nginx, a proxy) can stop them. The page starts an
 * upload, sends the file a piece at a time (each written at its own place, so a piece sent twice changes nothing), smaller pieces
 * when a piece is refused, and finishes it. The job then names the upload instead of carrying the file. An upload not used within a
 * day is removed.
 */
import { randomBytes } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth';

export const UPLOAD_DIR = resolve(process.env.UPLOADS_DIR || join(__dirname, '..', '..', 'storage', 'uploads'));
const MAX = 100 * 1024 * 1024; // the most one file may be (attachments.ts takes the same)
const dirOf = (id: string) => join(UPLOAD_DIR, id.replace(/[^a-f0-9]/g, ''));
interface Meta { name: string; size: number; user: number; created: number; done?: boolean }
const metaOf = (id: string): Meta | null => { try { return JSON.parse(readFileSync(join(dirOf(id), 'meta.json'), 'utf8')); } catch { return null; } };

/** The finished upload, taken (it is removed from the uploads): its name and bytes. Null when it is not there, not finished, or not theirs. */
export function takeUpload(id: string, userId?: number): { name: string; data: Buffer } | null {
  const m = metaOf(id); if (!m || !m.done || (userId != null && m.user !== userId)) return null;
  const data = readFileSync(join(dirOf(id), 'data'));
  if (data.length !== m.size) return null;
  rmSync(dirOf(id), { recursive: true, force: true });
  return { name: m.name, data };
}
/** Uploads started more than a day ago and never used. */
export function sweepUploads() {
  if (!existsSync(UPLOAD_DIR)) return;
  for (const d of readdirSync(UPLOAD_DIR)) { try { if (Date.now() - statSync(join(UPLOAD_DIR, d)).mtimeMs > 86_400_000) rmSync(join(UPLOAD_DIR, d), { recursive: true, force: true }); } catch { /* gone */ } }
}

/** How many bytes the pieces received cover (a piece sent twice counts once; a gap is not covered). */
function covered(id: string): number {
  let lines: string[] = []; try { lines = readFileSync(join(dirOf(id), 'pieces'), 'utf8').split('\n').filter(Boolean); } catch { return 0; }
  const parts = lines.map((l) => l.split(':').map(Number)).sort((a, b) => a[0] - b[0]);
  let total = 0, end = 0;
  for (const [o, n] of parts) { const e = o + n; if (e > end) { total += e - Math.max(o, end); end = e; } }
  return total;
}
const pid = (req: any) => String(req.params.id);
export const uploads = Router();
uploads.post('/uploads', requireRole(), (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(200), size: z.number().int().min(1) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Name the file and its size' });
  if (b.data.size > MAX) return void res.status(413).json({ error: `${b.data.name} is larger than ${MAX / 1024 / 1024} MB` });
  sweepUploads();
  const id = randomBytes(12).toString('hex'); mkdirSync(dirOf(id), { recursive: true });
  writeFileSync(join(dirOf(id), 'meta.json'), JSON.stringify({ name: b.data.name, size: b.data.size, user: req.user!.id, created: Date.now() } satisfies Meta));
  writeFileSync(join(dirOf(id), 'data'), Buffer.alloc(0));
  res.json({ id, chunk: 512 * 1024 });
});
// one piece, written at its offset: sent twice, it is written twice in the same place
uploads.post('/uploads/:id/chunk', requireRole(), (req, res) => {
  const b = z.object({ offset: z.number().int().min(0), data: z.string().min(1) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Not a piece of a file' });
  const m = metaOf(pid(req)); if (!m || m.user !== req.user!.id) return void res.status(404).json({ error: 'This upload is gone. Add the file again.' });
  const buf = Buffer.from(b.data.data, 'base64');
  if (b.data.offset + buf.length > m.size) return void res.status(400).json({ error: 'The piece goes past the end of the file' });
  const fd = openSync(join(dirOf(pid(req)), 'data'), 'r+'); try { writeSync(fd, buf, 0, buf.length, b.data.offset); } finally { closeSync(fd); }
  appendFileSync(join(dirOf(pid(req)), 'pieces'), `${b.data.offset}:${buf.length}\n`); // which parts arrived, so a gap is found
  res.json({ ok: true, received: b.data.offset + buf.length });
});
uploads.post('/uploads/:id/finish', requireRole(), (req, res) => {
  const m = metaOf(pid(req)); if (!m || m.user !== req.user!.id) return void res.status(404).json({ error: 'This upload is gone. Add the file again.' });
  const have = covered(pid(req));
  if (have !== m.size) return void res.status(409).json({ error: 'Some of the file is missing', have, size: m.size });
  writeFileSync(join(dirOf(pid(req)), 'meta.json'), JSON.stringify({ ...m, done: true }));
  res.json({ ok: true, id: pid(req) });
});
