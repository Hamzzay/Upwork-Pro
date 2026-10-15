/**
 * Reasons to continue (R96, Ahmad): for a job that came back FLAG or FAIL, four or five short reasons to go on anyway, written from
 * the screening's own "Fit with Stackup Solutions" summary and set against its flags. They are offered as the quick picks on the
 * decision (above the stock ones in Settings), so the reason kept on record says why this job is worth it, not a generic line.
 * A worker job, run as soon as the screening finishes; older jobs get theirs the first time the decision is opened.
 */
import { z } from 'zod';
import { config } from '../config';
import { exec, query } from '../db';
import { run } from '../llm';
import { normalizeReport } from './contract';

const schema = { type: 'object', properties: { reasons: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } } }, required: ['reasons'], additionalProperties: false } as const;
const out = z.object({ reasons: z.array(z.string().trim().min(8).max(160)).min(3).max(5) });

export function readFitReasons(json: string | null | undefined): string[] {
  try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a.map(String).filter(Boolean) : []; } catch { return []; }
}

/** Queue the reasons for a job that needs them (a finished FLAG or FAIL without any yet). */
export async function queueFitReasons(id: number): Promise<boolean> {
  const r = await exec(`UPDATE screenings SET fit_reasons_status='queued' WHERE id=? AND status='done' AND verdict IN ('FLAG','FAIL') AND report_json IS NOT NULL
    AND (fit_reasons_status IS NULL OR fit_reasons_status='error') AND fit_reasons_json IS NULL`, [id]);
  return r.affectedRows > 0;
}

export async function runFitReasons(id: number) {
  const s = (await query<any>('SELECT title, verdict, report_json FROM screenings WHERE id=?', [id]))[0];
  const j = s?.report_json ? normalizeReport(JSON.parse(s.report_json)).jobs[0] : null;
  if (!j || !String(j.fit || '').trim()) { await exec(`UPDATE screenings SET fit_reasons_status='done', fit_reasons_json='[]' WHERE id=?`, [id]); return; }
  const issues = [...(j.fails || []).map((x: any) => `FAIL ${x.code} ${x.rule}: ${x.value}`), ...(j.flags || []).map((x: any) => `FLAG ${x.code} ${x.rule}: ${x.value}`)];
  const system = [
    'You help an Upwork agency decide whether to go ahead with a job its screening flagged. Write the reasons they could give for going ahead anyway.',
    'Each reason comes from the FIT summary below (what makes this job a good fit for the agency) and answers the flags: why the job is still worth applying to despite them. Use only what the fit summary and the job details say; never invent a fact, a number, a client detail or a past project that is not there.',
    'Write four or five, each a different reason, specific to this job (name the work, the stack, the client signal or the past work it points to). Each is one short sentence, at most 18 words, in plain English, without a full stop at the end, no dashes, no "we believe". They must read as a reason a person would put on record, for example: Same AI voice booking work we built for DentAI Call',
    'Never write a reason that only restates a flag, and never a stock phrase that would fit any job.',
  ].join('\n');
  const prompt = `JOB: ${s.title || 'Untitled'}\nVERDICT: ${s.verdict}\n\nFIT WITH THE AGENCY (the screening's summary)\n${j.fit}\n\n${issues.length ? 'WHAT THE SCREENING FLAGGED\n' + issues.join('\n') + '\n\n' : ''}${(j.proposal_notes || []).length ? 'NOTES FOR THE PROPOSAL\n' + j.proposal_notes.join('\n') + '\n\n' : ''}Write the reasons now.`;
  const r = await run({ label: 'fit reasons', system, prompt, schema, timeoutMs: config.llm.timeoutMs });
  const o = out.safeParse(r.data); if (!o.success) throw new Error('invalid_output');
  const reasons = [...new Set(o.data.reasons.map((x) => x.replace(/[.\s]+$/, '').replace(/\s*[—–]\s*/g, ', ')))];
  await exec(`UPDATE screenings SET fit_reasons_status='done', fit_reasons_json=? WHERE id=?`, [JSON.stringify(reasons), id]);
}
