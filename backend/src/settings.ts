import { z } from 'zod';
import { cached } from './cache';
import { exec, query } from './db';
import { PROVIDER_IDS } from './llm/ids';

/**
 * Everything an admin can tune without a deploy. Each key has a schema and a default; the database row wins.
 * Read on use (a handful of small rows), so a change applies to the next job without a restart.
 */
const modelName = z.string().trim().min(1).max(80).regex(/^[\w.\-:\[\]]+$/, 'Use letters, digits and . - _ : [ ] only');
export const SETTINGS = {
  'ai.provider': { label: 'AI provider', help: 'Which AI does the screening, tagging, signals, proposals and chat. Set on the AI card below.', schema: z.enum(PROVIDER_IDS), def: 'glm' as (typeof PROVIDER_IDS)[number] },
  'ai.model.glm': { label: 'GLM model', help: '', schema: modelName, def: process.env.LLM_MODEL || 'glm-5.3-flash[1m]' },
  'ai.model.claude': { label: 'Claude model', help: '', schema: modelName, def: 'claude-sonnet-5-5' },
  'ai.model.openai': { label: 'GPT model', help: '', schema: modelName, def: 'gpt-5' },
  'review.auto': { label: 'Review every proposal by itself', help: 'The independent reviewer scores every proposal as soon as it is written. Off: it reviews only when someone asks (the Review button, or Claude). How it reviews is set on the Reviewer page.', schema: z.boolean(), def: true },
  'matching.auto_max_flags': { label: 'Start matching by itself when a FLAG has at most this many flags', help: 'A PASS, or a FLAG with no more flags than this, is tagged and matched (and its early draft written) as soon as it is screened, before anyone clicks. More flags, or a FAIL: nothing is spent until someone continues with a reason.', schema: z.number().int().min(0).max(30), def: 2 },
  'matching.shown': { label: 'Projects shown per job', help: 'How many matching projects the Projects step lists.', schema: z.number().int().min(1).max(20), def: 5 },
  'matching.recommended': { label: 'Projects recommended', help: 'How many of the shown projects are pre-selected (and used by the early draft).', schema: z.number().int().min(1).max(5), def: 2 },
  'matching.ai_order': { label: 'AI orders the matched projects', help: 'After the tags pick the shortlist, the AI reads each project\'s overview and case study and orders them for the job, with a reason. Off: the tag score decides the order.', schema: z.boolean(), def: true },
  'matching.min_score': { label: 'Minimum match score', help: 'A project scoring below this is not shown. The Claude plugin uses the same number.', schema: z.number().int().min(0).max(100), def: 1 },
  'selection.min': { label: 'Fewest projects a person must pick', help: '', schema: z.number().int().min(1).max(5), def: 1 },
  'selection.max': { label: 'Most projects a person can pick', help: '', schema: z.number().int().min(1).max(5), def: 2 },
  'override.min_reason': { label: 'Shortest reason to continue past a FLAG or FAIL', help: 'In characters.', schema: z.number().int().min(0).max(500), def: 15 },
  'tracking.outcomes': { label: 'Outcome choices', help: 'The Outcome dropdown on the Tracking step, in order. "Hired" is what the dashboard counts as a hire.',
    schema: z.array(z.string().trim().min(1).max(60)).min(1).max(20), def: ['Pending', 'Hired', 'Not hired', 'No response', 'Withdrawn', 'Job closed'] },
  'tracking.loss_outcomes': { label: 'Outcomes that count as lost', help: 'Choosing one of these needs a reason (below). Use the exact names from Outcome choices.',
    schema: z.array(z.string().trim().min(1).max(60)).max(20), def: ['Not hired', 'No response', 'Withdrawn', 'Job closed'] },
  'tracking.loss_reasons': { label: 'Reasons a client did not go ahead', help: 'Required when the outcome is lost, so lost jobs can be reported on. A note is always allowed too.',
    schema: z.array(z.string().trim().min(1).max(120)).min(1).max(30), def: ['Budget too low', 'Hired someone else', 'Went quiet after chat', 'Scope or timeline did not fit', 'Job cancelled by client', 'We withdrew', 'Other'] },
  'override.reasons': { label: 'Quick reasons to continue past a FLAG or FAIL', help: 'Offered as one click fillers above the reason box, in the app and in Claude. Several can be picked, and words added. The shortest reason above still applies.',
    schema: z.array(z.string().trim().min(1).max(160)).min(1).max(20), def: ['Invited by the client', 'Strong client history', 'Strong fit with our past projects', 'The flag does not apply to this job', 'Low workload, worth the Connects'] },
  'skip.reasons': { label: 'Quick reasons to skip a job', help: 'Offered when someone skips a job after its screening. A note can be written as well, or instead.',
    schema: z.array(z.string().trim().min(1).max(120)).min(1).max(20), def: ['Budget or rate too low', 'Client history or hire rate', 'Outside our services', 'Scope unclear', 'Too much competition'] },
  'tracking.quiet_days': { label: 'Days before a submitted proposal counts as "gone quiet"', help: 'A submitted proposal with no status update for this many days shows under Submitted, Gone quiet.',
    schema: z.number().int().min(1).max(90), def: 5 },
  'writer.requirement_rules': { label: 'Rules passed to the proposal writer', help: 'When one of these flags fires, its text is given to the writer as a client requirement (e.g. screening questions, required words, location rules).',
    schema: z.array(z.string().trim().regex(/^[A-Z]\d{1,3}$/)).max(30), def: ['G11', 'G12', 'G13'] },
  'writer.loom_line': { label: 'The Loom video line', help: 'Put in a proposal when a Loom video is chosen, where the proposal type puts it. {title} is the video title and {url} its link.', schema: z.string().trim().min(5).max(400), def: 'I recorded a short walkthrough of {title}:\n{url}' },
  'writer.structured_signal': { label: 'Signal that means "structured submission"', help: 'When this signal has this value, the writer follows the post\'s own structure first.',
    schema: z.object({ signal: z.number().int().min(1).max(999), value: z.string().trim().min(1).max(120) }), def: { signal: 5, value: 'Yes' } },
} as const;
export type SettingKey = keyof typeof SETTINGS;
export type Settings = { [K in SettingKey]: z.infer<(typeof SETTINGS)[K]['schema']> };

export const getSettings = (): Promise<Settings> => cached('settings', readSettings);
async function readSettings(): Promise<Settings> {
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

/** Settings that must agree with each other. Returns what is wrong, in plain words, or null. */
export function settingsConflict(c: Pick<Settings, 'matching.shown' | 'matching.recommended' | 'selection.min' | 'selection.max'>): string | null {
  if (c['selection.min'] > c['selection.max']) return 'The fewest projects to pick cannot be more than the most';
  if (c['selection.max'] > c['matching.shown']) return 'Projects shown must be at least the most a person can pick';
  if (c['matching.recommended'] > c['selection.max']) return 'Projects recommended cannot be more than the most a person can pick';
  if (c['matching.recommended'] < c['selection.min']) return 'Projects recommended cannot be fewer than the fewest a person must pick';
  return null;
}
