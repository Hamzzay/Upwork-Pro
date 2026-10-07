import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { audit, exec, query } from './db';
import { requireRole } from './auth';
import { addRows, commit, createBatch, discard, ImportError, listKinds, myBatches, preview, undo } from './imports/service';

/** Sheet imports for Claude (MCP) and personal access tokens. Every import is previewed first and can be undone. */
export const imports = Router();
const anyone = requireRole();
const id = (v: unknown) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw new ImportError(400, 'Bad id'); return n; };
const guard = (fn: (req: any, res: any) => Promise<unknown>) => async (req: any, res: any) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof ImportError) return void res.status(e.status).json({ error: e.message });
    if (e instanceof z.ZodError) return void res.status(400).json({ error: e.issues[0].message });
    throw e;
  }
};

imports.get('/import/types', anyone, guard(async (req, res) => res.json({ types: listKinds(req.user) })));
imports.get('/import/batches', anyone, guard(async (req, res) => res.json({ batches: await myBatches(req.user) })));
imports.post('/import/batches', anyone, guard(async (req, res) => {
  const b = z.object({ type: z.string().min(1).max(30), source: z.string().max(190).nullish(), allow_changes: z.boolean().optional() }).parse(req.body);
  res.status(201).json(await createBatch(req.user, b.type, b.source ?? null, !!b.allow_changes));
}));
imports.post('/import/batches/:id/rows', anyone, guard(async (req, res) => {
  const b = z.object({ headers: z.array(z.string().max(120)).max(200).optional(), rows: z.array(z.any()).min(1).max(1000) }).parse(req.body);
  res.json(await addRows(req.user, id(req.params.id), b.headers, b.rows));
}));
imports.get('/import/batches/:id', anyone, guard(async (req, res) => res.json(await preview(req.user, id(req.params.id)))));
imports.post('/import/batches/:id/commit', anyone, guard(async (req, res) => {
  const b = z.object({ preview_checksum: z.string().min(8).max(64), skip_invalid: z.boolean().optional() }).parse(req.body);
  res.json(await commit(req.user, id(req.params.id), b.preview_checksum, !!b.skip_invalid));
}));
imports.post('/import/batches/:id/undo', anyone, guard(async (req, res) => res.json(await undo(req.user, id(req.params.id)))));
imports.delete('/import/batches/:id', anyone, guard(async (req, res) => res.json(await discard(req.user, id(req.params.id)))));

// ---- personal access tokens: made and revoked from the website (a token cannot make tokens) ----
const sessionOnly = (req: any, res: any, next: any) => (req.viaToken ? res.status(403).json({ error: 'Sign in on the website to manage tokens' }) : next());
imports.get('/tokens', anyone, sessionOnly, async (req, res) => {
  res.json({ tokens: await query('SELECT id, name, expires_at, revoked_at, last_used_at, created_at FROM api_tokens WHERE user_id=? ORDER BY id DESC LIMIT 50', [req.user!.id]) });
});
imports.post('/tokens', anyone, sessionOnly, guard(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1, 'Give the token a name').max(80), days: z.number().int().min(1).max(365).default(90) }).parse(req.body);
  if ((await query<any>(`SELECT COUNT(*) n FROM api_tokens WHERE user_id=? AND revoked_at IS NULL AND expires_at > NOW()`, [req.user!.id]))[0].n >= 10) throw new ImportError(429, 'You have 10 active tokens. Revoke one first');
  const token = 'upw_' + randomBytes(32).toString('hex');
  const r = await exec('INSERT INTO api_tokens (user_id, name, token_hash, expires_at) VALUES (?,?,?, DATE_ADD(NOW(), INTERVAL ? DAY))', [req.user!.id, b.name, createHash('sha256').update(token).digest('hex'), b.days]);
  await audit(req.user!.id, 'token_create', `id=${r.insertId} days=${b.days}`);
  res.status(201).json({ id: r.insertId, token, note: 'Copy it now. It is shown once and cannot be recovered.' });
}));
imports.delete('/tokens/:id', anyone, sessionOnly, guard(async (req, res) => {
  const r = await exec('UPDATE api_tokens SET revoked_at=NOW() WHERE id=? AND user_id=? AND revoked_at IS NULL', [id(req.params.id), req.user!.id]);
  if (!r.affectedRows) throw new ImportError(404, 'No such active token');
  await audit(req.user!.id, 'token_revoke', `id=${req.params.id}`);
  res.json({ ok: true });
}));
