import { Router } from 'express';
import { z } from 'zod';
import { audit, exec, query } from './db';
import { requireRole } from './auth';
import { getSettings } from './settings';
import { connected, requestSync, runSync } from './sheets/sync';

/** The Sheet sync page: is the sheet connected, the last runs, Sync now, and the conflicts to resolve. Admins only. */
export const sheets = Router();
const admin = requireRole('admin');

sheets.get('/admin/sheet-sync', admin, async (_req, res) => {
  const s = await getSettings();
  const runs = await query<any>('SELECT id, started_at, finished_at, trigger_kind, ok, summary, error FROM sheet_sync_runs ORDER BY id DESC LIMIT 20');
  res.json({
    connection: connected(), spreadsheet_id: s['sheet.spreadsheet_id'], sync_minutes: s['sheet.sync_minutes'],
    runs: runs.map((r) => ({ ...r, summary: r.summary ? JSON.parse(r.summary) : null })),
    conflicts: await query("SELECT id, kind, rkey, field, sheet_value, app_value, created_at FROM sheet_sync_conflicts WHERE status='open' ORDER BY id DESC LIMIT 200"),
    base_records: Number((await query<any>('SELECT COUNT(*) AS n FROM sheet_sync_base'))[0].n),
  });
});

sheets.post('/admin/sheet-sync/run', admin, async (req, res) => {
  if (!connected().ok) return void res.status(400).json({ error: connected().reason });
  try { res.json({ summary: await runSync('manual', { userId: req.user!.id }) }); }
  catch (e) { res.status(502).json({ error: (e as Error).message }); }
});

// a conflict kept the sheet's value; "use the app's value" puts the app's value back on the record, and the next sync writes it to the sheet
const PROJECT_COL: Record<string, string> = { showable: 'showable_publicly', landing_link: 'landing_link', system_link: 'system_link', mobile_link: 'mobile_link', staging_link: 'staging_link',
  case_study_link: 'case_study_link', overview: 'overview', case_study_summary: 'case_study_summary' };
const PROFILE_COL = ['profile_url', 'tagline', 'price', 'lowest_price', 'github_url', 'gitlab_account', 'services', 'industries', 'voice', 'signature', 'stats_allowed', 'submitted_by', 'rules', 'notes', 'active'];
sheets.post('/admin/sheet-sync/conflicts/:id', admin, async (req, res) => {
  const b = z.object({ use: z.enum(['app', 'sheet']) }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Choose app or sheet' });
  const c = (await query<any>("SELECT * FROM sheet_sync_conflicts WHERE id=? AND status='open'", [Number(req.params.id)]))[0];
  if (!c) return void res.status(404).json({ error: 'Not found or already resolved' });
  if (b.data.use === 'app') {
    const v = c.app_value;
    if (c.kind === 'project' && PROJECT_COL[c.field]) await exec(`UPDATE projects SET ${PROJECT_COL[c.field]}=? WHERE LOWER(name)=?`, [v, c.rkey]);
    else if (c.kind === 'profile' && PROFILE_COL.includes(c.field)) {
      const val = c.field === 'active' ? (v === 'No' ? 0 : 1) : c.field.includes('price') ? (v == null || v === '' ? null : Number(String(v).replace(/[$,\s]/g, ''))) : v;
      await exec(`UPDATE upwork_profiles SET ${c.field}=? WHERE LOWER(name)=?`, [val, c.rkey]);
    } else if (c.kind === 'tag' && (c.field === 'weight' || c.field === 'description')) await exec(`UPDATE tags SET ${c.field}=? WHERE LOWER(name)=?`, [c.field === 'weight' ? Number(v) || 0 : v, c.rkey]);
    else return void res.status(400).json({ error: `The ${c.field} of a ${c.kind} cannot be set from here. Change it in the sheet or on its page.` });
    requestSync(req.user!.id);
  }
  await exec("UPDATE sheet_sync_conflicts SET status=?, resolved_by=?, resolved_at=NOW() WHERE id=?", [b.data.use === 'app' ? 'used_app' : 'kept_sheet', req.user!.id, c.id]);
  await audit(req.user!.id, 'sheet_conflict', `id=${c.id} ${c.kind} ${c.rkey} ${c.field}: ${b.data.use}`);
  res.json({ ok: true });
});
