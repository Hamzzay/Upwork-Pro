import { z } from 'zod';
import { exec, query } from './db';

/**
 * Everything an admin can tune without a deploy. Each key has a schema and a default; the database row wins.
 * Read on use (a handful of small rows), so a change applies to the next job without a restart.
 */
export const SETTINGS = {
  'matching.shown': { label: 'Projects shown per job', help: 'How many matching projects the Projects step lists.', schema: z.number().int().min(1).max(20), def: 5 },
  'matching.recommended': { label: 'Projects recommended', help: 'How many of the shown projects are pre-selected (and used by the early draft).', schema: z.number().int().min(1).max(5), def: 2 },
  'matching.min_score': { label: 'Minimum match score', help: 'A project scoring below this is not shown. The plugin used 6.', schema: z.number().int().min(0).max(100), def: 1 },
  'selection.min': { label: 'Fewest projects a person must pick', help: '', schema: z.number().int().min(1).max(5), def: 1 },
  'selection.max': { label: 'Most projects a person can pick', help: '', schema: z.number().int().min(1).max(5), def: 2 },
  'override.min_reason': { label: 'Shortest reason to continue past a FLAG or FAIL', help: 'In characters.', schema: z.number().int().min(0).max(500), def: 15 },
  'tracking.outcomes': { label: 'Outcome choices', help: 'The Outcome dropdown on the Tracking step, in order. "Hired" is what the dashboard counts as a hire.',
    schema: z.array(z.string().trim().min(1).max(60)).min(1).max(20), def: ['Pending', 'Hired', 'Not hired', 'No response', 'Withdrawn', 'Job closed'] },
  'tracking.loss_outcomes': { label: 'Outcomes that count as lost', help: 'Choosing one of these needs a reason (below). Use the exact names from Outcome choices.',
    schema: z.array(z.string().trim().min(1).max(60)).max(20), def: ['Not hired', 'No response', 'Withdrawn', 'Job closed'] },
  'tracking.loss_reasons': { label: 'Reasons a client did not go ahead', help: 'Required when the outcome is lost, so lost jobs can be reported on. A note is always allowed too.',
    schema: z.array(z.string().trim().min(1).max(120)).min(1).max(30), def: ['Budget too low', 'Hired someone else', 'Went quiet after chat', 'Scope or timeline did not fit', 'Job cancelled by client', 'We withdrew', 'Other'] },
  'writer.requirement_rules': { label: 'Rules passed to the proposal writer', help: 'When one of these flags fires, its text is given to the writer as a client requirement (e.g. screening questions, required words, location rules).',
    schema: z.array(z.string().trim().regex(/^[A-Z]\d{1,3}$/)).max(30), def: ['G11', 'G12', 'G13'] },
  'writer.structured_signal': { label: 'Signal that means "structured submission"', help: 'When this signal has this value, the writer follows the post\'s own structure first.',
    schema: z.object({ signal: z.number().int().min(1).max(999), value: z.string().trim().min(1).max(120) }), def: { signal: 5, value: 'Yes' } },
} as const;
export type SettingKey = keyof typeof SETTINGS;
export type Settings = { [K in SettingKey]: z.infer<(typeof SETTINGS)[K]['schema']> };

export async function getSettings(): Promise<Settings> {
  const rows = await query<{ k: string; v: string }>('SELECT k, v FROM app_settings');
  const out: any = {};
  for (const [k, d] of Object.entries(SETTINGS)) out[k] = d.def;
  for (const r of rows) {
    const d = (SETTINGS as any)[r.k]; if (!d) continue;
    try { const p = d.schema.safeParse(JSON.parse(r.v)); if (p.success) out[r.k] = p.data; } catch { /* a bad row keeps the default */ }
  }
  if (out['selection.min'] > out['selection.max']) out['selection.min'] = out['selection.max'];
  return out as Settings;
}

export async function setSetting(key: SettingKey, value: unknown, userId: number) {
  const parsed = SETTINGS[key].schema.parse(value);
  await exec('INSERT INTO app_settings (k, v, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE v=VALUES(v), updated_by=VALUES(updated_by)', [key, JSON.stringify(parsed), userId]);
  return parsed;
}
