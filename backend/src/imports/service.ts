import { createHash } from 'node:crypto';
import { audit, exec, pool, query, withRetry } from '../db';
import type { AuthUser } from '../auth';
import { mapRows, MAX_CELL, MAX_CHUNK, MAX_ROWS, type Db, type Kind } from './core';
import { KINDS } from './kinds';

export class ImportError extends Error { constructor(readonly status: number, message: string) { super(message); } }

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const DAY_MS = 86_400_000;

export const poolDb: Db = {
  q: (sql, p = []) => query(sql, p),
  run: async (sql, p = []) => { const r = await exec(sql, p); return { insertId: r.insertId, affectedRows: r.affectedRows }; },
};
const connDb = (conn: any): Db => ({
  q: async (sql, p = []) => (await conn.query(sql, p))[0] as any[],
  run: async (sql, p = []) => { const [r]: any = await conn.query(sql, p); return { insertId: r.insertId, affectedRows: r.affectedRows }; },
});

const kindFor = (id: string, user: AuthUser): Kind => {
  const k = KINDS[id];
  if (!k) throw new ImportError(400, `Unknown import type "${id}"`);
  if (!k.roles.includes(user.role)) throw new ImportError(403, `Your role (${user.role}) cannot import ${k.label.toLowerCase()}. ${k.roles.join(' or ')} only`);
  return k;
};

async function ownBatch(id: number, user: AuthUser) {
  const b = (await query<any>('SELECT * FROM import_batches WHERE id=? AND user_id=?', [id, user.id]))[0];
  if (!b) throw new ImportError(404, 'No such import');
  return b;
}
const openBatch = async (id: number, user: AuthUser) => {
  const b = await ownBatch(id, user);
  if (b.status !== 'open') throw new ImportError(409, `This import is ${b.status}`);
  if (new Date(b.expires_at).getTime() < Date.now()) throw new ImportError(410, 'This import expired (24 hours without activity). Start again');
  return b;
};

export const listKinds = (user: AuthUser) => Object.values(KINDS).map((k) => ({ id: k.id, label: k.label, description: k.description, allowed: k.roles.includes(user.role), roles: k.roles, columns: k.columns.map((c) => ({ name: c.name, required: !!c.required, also_called: c.aliases, note: c.note })) }));

export async function createBatch(user: AuthUser, kindId: string, source: string | null, allowChanges: boolean) {
  kindFor(kindId, user);
  await exec(`DELETE FROM import_batches WHERE status='open' AND expires_at < NOW()`); // abandoned previews
  if ((await query<any>(`SELECT COUNT(*) n FROM import_batches WHERE user_id=? AND status='open'`, [user.id]))[0].n >= 10) throw new ImportError(429, 'You have 10 unfinished imports. Commit or discard some first');
  const r = await exec('INSERT INTO import_batches (user_id, kind, source, allow_changes, expires_at) VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL 1 DAY))', [user.id, kindId, source?.slice(0, 190) ?? null, allowChanges ? 1 : 0]);
  return { id: r.insertId };
}

export async function addRows(user: AuthUser, id: number, headers: string[] | undefined, rows: unknown[]) {
  const b = await openBatch(id, user);
  const kind = kindFor(b.kind, user);
  if (!rows.length) throw new ImportError(400, 'No rows');
  if (rows.length > MAX_CHUNK) throw new ImportError(413, `At most ${MAX_CHUNK} rows per call. Send the sheet in pieces`);
  const have = (await query<any>('SELECT COUNT(*) n FROM import_items WHERE batch_id=?', [id]))[0].n as number;
  if (have + rows.length > MAX_ROWS) throw new ImportError(413, `An import holds at most ${MAX_ROWS} rows`);
  const m = mapRows(kind, headers, rows);
  if (m.error) throw new ImportError(400, m.error);
  const out: { row: number; action: string; key: string; messages: string[] }[] = [];
  const counts: Record<string, number> = { create: 0, update: 0, unchanged: 0, blocked: 0, invalid: 0 };
  const seen = new Map<string, number>();
  let n = have;
  for (const row of m.rows) {
    n++;
    let p = Object.values(row).some((v) => v.length > MAX_CELL)
      ? { action: 'invalid' as const, key: '?', messages: [`A cell is over ${MAX_CELL} characters`] }
      : await kind.plan(row, poolDb, { allowChanges: !!b.allow_changes });
    const lk = p.key.toLowerCase();
    if (p.action !== 'invalid') {
      const dupe = seen.get(lk) ?? (await query<any>(`SELECT row_no FROM import_items WHERE batch_id=? AND key_text=? AND action<>'invalid' LIMIT 1`, [id, p.key]))[0]?.row_no;
      if (dupe) p = { action: 'invalid', key: p.key, messages: [`"${p.key}" is already in this import (row ${dupe}). Each one may appear once`] };
      else seen.set(lk, n);
    }
    counts[p.action]++;
    await exec('INSERT INTO import_items (batch_id, row_no, action, key_text, messages, payload) VALUES (?,?,?,?,?,?)',
      [id, n, p.action, p.key.slice(0, 300), p.messages.length ? JSON.stringify(p.messages) : null, JSON.stringify(row)]);
    if (p.action === 'invalid' || p.action === 'blocked') out.push({ row: n, action: p.action, key: p.key, messages: p.messages });
  }
  const sum = sha(JSON.stringify(m.rows));
  const ignored = [...new Set([...(b.ignored_columns ? String(b.ignored_columns).split('\u001f') : []), ...m.ignored])];
  await exec(`UPDATE import_batches SET chunks=chunks+1, chunk_sums=CONCAT(COALESCE(chunk_sums,''), ?), ignored_columns=?, expires_at=DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE id=?`, [sum + '\n', ignored.join('\u001f').slice(0, 500) || null, id]);
  return { rows_received: rows.length, first_row: have + 1, last_row: n, chunk_checksum: sum.slice(0, 12), counts, problems: out.slice(0, 30), ignored_columns: m.ignored };
}

export async function preview(user: AuthUser, id: number) {
  const b = await ownBatch(id, user);
  const kind = KINDS[b.kind];
  const counts: Record<string, number> = { create: 0, update: 0, unchanged: 0, blocked: 0, invalid: 0 };
  for (const r of await query<any>('SELECT action, COUNT(*) n FROM import_items WHERE batch_id=? GROUP BY action', [id])) counts[r.action] = Number(r.n);
  const items = async (action: string, limit: number) => (await query<any>('SELECT row_no, key_text, messages FROM import_items WHERE batch_id=? AND action=? ORDER BY id LIMIT ?', [id, action, limit]))
    .map((r) => ({ row: r.row_no, key: r.key_text, notes: r.messages ? JSON.parse(r.messages) : [] }));
  const total = Object.values(counts).reduce((a, c) => a + c, 0);
  const checksum = sha((b.chunk_sums ?? '') + JSON.stringify(counts) + b.kind + b.allow_changes).slice(0, 16);
  return {
    id, type: b.kind, label: kind.label, source: b.source, status: b.status, allow_changes: !!b.allow_changes, expires_at: b.expires_at,
    rows: total, counts, preview_checksum: checksum,
    ignored_columns: b.ignored_columns ? String(b.ignored_columns).split('\u001f') : [],
    will_create: await items('create', 10), will_update: await items('update', 25), blocked: await items('blocked', 25), invalid: await items('invalid', 25),
    can_commit: b.status === 'open' && total > 0 && counts.create + counts.update > 0,
  };
}

export async function commit(user: AuthUser, id: number, checksum: string, skipInvalid: boolean) {
  const pre = await preview(user, id);
  const b = await openBatch(id, user);
  const kind = kindFor(b.kind, user);
  if (checksum !== pre.preview_checksum) throw new ImportError(409, 'The preview changed or was not the one you saw. Get the preview again and confirm it');
  if (pre.counts.invalid && !skipInvalid) throw new ImportError(409, `${pre.counts.invalid} row(s) are invalid. Fix them, or commit with skip_invalid to leave them out`);
  if (!pre.counts.create && !pre.counts.update) throw new ImportError(409, 'Nothing to save: every row is unchanged, blocked or invalid');
  const claim = await exec(`UPDATE import_batches SET status='committing' WHERE id=? AND status='open'`, [id]);
  if (!claim.affectedRows) throw new ImportError(409, 'This import is already being saved');
  try {
    await withRetry(async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const db = connDb(conn);
        const items = (await conn.query(`SELECT id, row_no, action, payload FROM import_items WHERE batch_id=? AND action IN ('create','update') ORDER BY id`, [id]))[0] as any[];
        for (const it of items) {
          const again = await kind.plan(JSON.parse(it.payload), db, { allowChanges: !!b.allow_changes });
          if (again.action !== it.action) throw new ImportError(409, `Row ${it.row_no} ("${again.key}") changed since the preview (${it.action} became ${again.action}). Someone else edited the data. Preview again`);
          const snap = await kind.apply(again, db);
          await conn.query('UPDATE import_items SET applied=1, before_json=? WHERE id=?', [JSON.stringify(snap ?? {}), it.id]);
        }
        await conn.commit();
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    });
  } catch (e) {
    await exec(`UPDATE import_batches SET status='open' WHERE id=? AND status='committing'`, [id]);
    if (e instanceof ImportError) throw e;
    console.error('import commit failed:', (e as Error).message);
    throw new ImportError(500, 'Saving failed and nothing was changed. Try again');
  }
  await exec(`UPDATE import_batches SET status='committed', committed_at=NOW(), summary_json=? WHERE id=?`, [JSON.stringify(pre.counts), id]);
  await audit(user.id, 'import_commit', `batch=${id} type=${b.kind} created=${pre.counts.create} updated=${pre.counts.update} skipped=${pre.counts.invalid + pre.counts.blocked}`);
  return { id, saved: { created: pre.counts.create, updated: pre.counts.update }, left_out: { invalid: pre.counts.invalid, blocked: pre.counts.blocked, unchanged: pre.counts.unchanged }, can_undo: true };
}

export async function undo(user: AuthUser, id: number) {
  const b = await ownBatch(id, user);
  const kind = kindFor(b.kind, user);
  const claim = await exec(`UPDATE import_batches SET status='undoing' WHERE id=? AND status='committed'`, [id]);
  if (!claim.affectedRows) throw new ImportError(409, `Only a saved import can be undone (this one is ${b.status})`);
  try {
    await withRetry(async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const db = connDb(conn);
        const items = (await conn.query('SELECT id, before_json FROM import_items WHERE batch_id=? AND applied=1 ORDER BY id DESC', [id]))[0] as any[];
        for (const it of items) { await kind.undo(JSON.parse(it.before_json), db); await conn.query('UPDATE import_items SET applied=0 WHERE id=?', [it.id]); }
        await conn.commit();
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    });
  } catch (e) {
    await exec(`UPDATE import_batches SET status='committed' WHERE id=? AND status='undoing'`, [id]);
    throw new ImportError(409, `Could not undo, and nothing was changed: ${(e as Error).message}`);
  }
  await exec(`UPDATE import_batches SET status='undone', undone_at=NOW() WHERE id=?`, [id]);
  await audit(user.id, 'import_undo', `batch=${id} type=${b.kind}`);
  return { id, undone: true };
}

export async function discard(user: AuthUser, id: number) {
  const b = await ownBatch(id, user);
  if (b.status !== 'open') throw new ImportError(409, `This import is ${b.status}; only an unsaved import can be discarded`);
  await exec(`UPDATE import_batches SET status='discarded' WHERE id=?`, [id]);
  await exec('DELETE FROM import_items WHERE batch_id=?', [id]);
  return { id, discarded: true };
}

export async function myBatches(user: AuthUser) {
  return query<any>('SELECT id, kind, source, status, chunks, created_at, committed_at, undone_at FROM import_batches WHERE user_id=? ORDER BY id DESC LIMIT 30', [user.id]);
}
