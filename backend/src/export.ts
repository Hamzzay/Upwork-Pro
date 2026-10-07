import ExcelJS from 'exceljs';
import { query } from './db';
import { htmlToPlain } from './html';
import { COLUMN_KEYS } from './screening/contract';

/**
 * One row per job with everything that happened to it, for a spreadsheet or for an AI to analyse:
 * the job and client, the gate, the decision, tags, projects, profile, signals, the final proposal, tracking and timings.
 * The jobs come from the same filters as the Jobs list; related data is fetched in a few batch queries, never one per job.
 */
export const EXPORT_LIMIT = 5000;

const label = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const secs = (a: any, b: any) => (a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000) : null);
/** The codes a job was screened against, from the snapshot kept with it (older jobs have none). */
const rulesApplied = (v: string | null) => { try { return v ? (JSON.parse(v) as { code: string }[]).map((r) => r.code).join(', ') : null; } catch { return null; } };
const dt = (v: any) => (v ? new Date(v).toISOString().replace('T', ' ').slice(0, 19) : null);
const group = <T extends Record<string, any>>(rows: T[], key: keyof T) => {
  const m = new Map<number, T[]>();
  for (const r of rows) { const k = Number(r[key]); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  return m;
};

export async function exportRows(ids: number[], stages: Map<number, string> = new Map()): Promise<{ headers: string[]; rows: (string | number | null)[][] }> {
  if (!ids.length) return { headers: [], rows: [] };
  const s = await query<any>(
    `SELECT s.*, u.name AS user_name, pr.name AS profile_name, sv.version AS gate_version, o.reason AS override_reason, o.created_at AS override_at
     FROM screenings s JOIN users u ON u.id=s.user_id LEFT JOIN upwork_profiles pr ON pr.id=s.upwork_profile_id
     LEFT JOIN skill_versions sv ON sv.id=s.skill_version_id LEFT JOIN overrides o ON o.screening_id=s.id WHERE s.id IN (?)`, [ids]);
  const tags = group(await query<any>('SELECT screening_id, tag_name, category_name FROM job_tags WHERE screening_id IN (?) ORDER BY category_name, tag_name', [ids]), 'screening_id');
  const matches = group(await query<any>('SELECT screening_id, project_name, rank_no, score, max_score, recommended, selected FROM job_matches WHERE screening_id IN (?) ORDER BY rank_no', [ids]), 'screening_id');
  const signals = group(await query<any>('SELECT screening_id, signal_number, signal_name, value_name, is_primary, confidence FROM job_signals WHERE screening_id IN (?) ORDER BY signal_number, is_primary DESC', [ids]), 'screening_id');
  const history = group(await query<any>('SELECT screening_id, status, happened_at, reason FROM status_events WHERE screening_id IN (?) ORDER BY happened_at, id', [ids]), 'screening_id');
  const changes = group(await query<any>('SELECT c.screening_id, c.field, c.old_value, c.new_value, c.source, c.created_at, u.name FROM field_changes c LEFT JOIN users u ON u.id=c.user_id WHERE c.screening_id IN (?) ORDER BY c.id', [ids]), 'screening_id');
  const post = (r: any) => { try { return r.posting_json ? JSON.parse(r.posting_json) : null; } catch { return null; } };
  const props = new Map((await query<any>(
    `SELECT p.*, (SELECT COUNT(*) FROM proposal_versions v WHERE v.proposal_id=p.id) AS versions,
       (SELECT v.content_html FROM proposal_versions v WHERE v.proposal_id=p.id ORDER BY v.version_no DESC LIMIT 1) AS latest_html
     FROM proposals p WHERE p.screening_id IN (?)`, [ids])).map((p) => [Number(p.screening_id), p]));

  const headers = [
    'ID', 'Date screened', 'Submitted by', 'Stage', 'Job title', 'Job URL', ...COLUMN_KEYS.map(label),
    'Verdict', 'Rule codes', 'Fail reasons', 'Flag reasons', 'Gate instructions version', 'Rules applied', 'Model', 'Proceeded', 'Override reason',
    'Job tags', 'Projects shown (score)', 'Projects chosen', 'Upwork profile', 'Signals', 'Template', 'Proposal status',
    'Proposal versions', 'Proposal warnings', 'Final proposal', 'Proposal sent date', 'Connects spent', 'Boost (Connects)',
    'Client viewed', 'Chat opened', 'Interview', 'Outcome', 'Lost reason', 'Lost note', 'Notes',
    'Sent at', 'Viewed at', 'Chat opened at', 'Interview at', 'Outcome at', 'Status history', 'Change history',
    'Posting description', 'Posting skills', 'Screening questions', 'Client history',
    'Screening (s)', 'Continued at', 'Projects ready at', 'Projects confirmed at', 'Profile confirmed at', 'Proposal ready at', 'Proposal finalized at',
    'Paste to proposal (s)', 'Tracking updated at', 'Job description',
  ];
  const order = new Map(ids.map((id, i) => [id, i]));
  s.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const rows = s.map((r) => {
    const p = props.get(r.id);
    const m = matches.get(r.id) ?? [];
    let warnings = 0; try { warnings = p?.warnings ? JSON.parse(p.warnings).length : 0; } catch { /* old value */ }
    return [
      r.id, dt(r.created_at), r.user_name, stages.get(r.id) ?? null, r.title, r.source_url, ...COLUMN_KEYS.map((k) => r[k] ?? null),
      r.verdict, r.rule_codes, r.fail_reasons, r.flag_reasons, r.gate_version ? `v${r.gate_version}` : null, rulesApplied(r.gate_rules), r.model, r.proceeded, r.override_reason,
      (tags.get(r.id) ?? []).map((t) => `${t.category_name}: ${t.tag_name}`).join('; ') || null,
      m.map((x) => `${x.project_name} (${x.score}/${x.max_score}${x.recommended ? ', recommended' : ''})`).join('; ') || null,
      m.filter((x) => x.selected).map((x) => x.project_name).join('; ') || null,
      r.profile_name,
      (signals.get(r.id) ?? []).filter((x) => x.is_primary).map((x) => `${x.signal_name}: ${x.value_name} (${x.confidence})`).join('; ') || null,
      p?.template_name ?? null, p ? (p.finalized_at ? 'finalized' : p.status) : null, p ? Number(p.versions) : null, p ? warnings : null,
      p?.latest_html ? htmlToPlain(p.latest_html) : null,
      r.proposal_sent_date ? String(dt(r.proposal_sent_date)).slice(0, 10) : null, r.connects_spent, r.boost_connects,
      r.client_viewed, r.client_replied, r.interviewed, r.outcome, r.outcome_reason, r.outcome_note, r.notes,
      dt(r.proposal_sent_at), dt(r.client_viewed_at), dt(r.client_replied_at), dt(r.interviewed_at), dt(r.outcome_at),
      (history.get(r.id) ?? []).map((e) => `${dt(e.happened_at)} ${e.status}${e.reason ? ' (' + e.reason + ')' : ''}`).join('; ') || null,
      (changes.get(r.id) ?? []).map((c) => `${dt(c.created_at)} ${c.field}: ${c.old_value ?? 'empty'} -> ${c.new_value ?? 'empty'} (${c.source}${c.name ? ', ' + c.name : ''})`).join('; ') || null,
      post(r)?.description || null, post(r)?.skills?.join('; ') || null, post(r)?.screening_questions?.join(' | ') || null,
      post(r)?.client_history?.map((x: any) => [x.title, x.dates, x.amount, x.rating, x.feedback].filter(Boolean).join(', ')).join(' | ') || null,
      secs(r.started_at ?? r.created_at, r.finished_at), dt(r.continued_at), dt(r.tagged_at), dt(r.selection_confirmed_at), dt(r.proposal_profile_confirmed_at),
      dt(p?.finished_at), dt(p?.finalized_at), secs(r.created_at, p?.finished_at), dt(r.tracking_updated_at), r.job_text ?? r.raw_input,
    ];
  });
  return { headers, rows };
}

/** RFC 4180, with a BOM so Excel reads UTF-8. A cell that starts like a formula is prefixed so a spreadsheet never runs it. */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    let t = String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export async function toXlsx(headers: string[], rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Upwork Pro';
  const ws = wb.addWorksheet('Jobs', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  ws.addRow(headers).font = { bold: true };
  for (const r of rows) ws.addRow(r.map((v) => (typeof v === 'string' && v.length > 32000 ? v.slice(0, 32000) : v))); // Excel's cell limit
  ws.columns.forEach((c, i) => { c.width = Math.min(60, Math.max(10, headers[i].length + 2)); });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
