import 'dotenv/config'; // the provider is chosen at import time, so the env file must be loaded first
import { LlmCallError, runClaude, type RunOptions, type RunResult } from './claude-runner';
import { llmContext } from './context';

/** Canned answer: no network, no cost. Shape matches the report contract. Triggers: [mock-pass], [mock-fail]. */
async function mockRun(o: RunOptions): Promise<RunResult> {
  const names: string[] | undefined = (o.schema as any)?.properties?.tags?.items?.properties?.tag?.enum;
  if (names) { // the tagging call: a fixed spread of dictionary tags, so matching has something to score
    const pick = [1, 12, 25, 40, 55, 70, 85].map((i) => names[i % names.length]);
    const data = { tags: [...new Set(pick)].map((tag) => ({ tag, reason: 'Mock reason: no real tagging was done.' })) };
    return { text: JSON.stringify(data), data, raw: {} };
  }
  const props: any = (o.schema as any)?.properties ?? {};
  if (props.signals?.items?.properties?.values) { // signal detection: the first value of every signal
    const nums: number[] = props.signals.items.properties.signal.enum;
    const data = { signals: nums.map((n) => ({ signal: n, values: [{ code: `S${n}.1`, primary: true, confidence: 'medium', evidence: 'mock', reason: 'Mock detection: first value.' }] })) };
    return { text: JSON.stringify(data), data, raw: {} };
  }
  if (props.proposal && props.warnings) { // proposal writer: a short proposal that uses the sender and the 2 projects from the prompt
    const name = /\n  Name: (.+)\n/.exec(o.system)?.[1] ?? 'Sender';
    const link = /GitLab link: (https?:\S+)/.exec(o.system)?.[1];
    const projects = [...o.system.matchAll(/\n  \d+\. (.+)\n     Link: (.+)\n/g)].map((m) => ({ name: m[1], link: /^https?:/.test(m[2]) ? m[2] : null }));
    const body = ['Understood. This is a mock proposal.', `I built ${projects.map((p) => p.name).join(' and ')}.`, ...projects.map((p) => `${p.name}${p.link ? '\n' + p.link : ''}\nA short mock description.`), 'Let\u2019s start.', `Best regards,\n${name}${link ? '\n' + link : ''}`].join('\n\n');
    const data = { proposal: body, warnings: [] as string[] };
    return { text: JSON.stringify(data), data, raw: {} };
  }
  if (props.reply && props.proposal) { // chat: revises when the request contains "change", otherwise only answers
    const cur = /CURRENT PROPOSAL\n([\s\S]*)$/.exec(o.system)?.[1]?.trim() ?? '';
    const ask = /USER REQUEST\n([\s\S]*?)\n\n<job_page>/.exec(o.prompt)?.[1] ?? '';
    const data = /change|shorter|revise/i.test(ask) ? { reply: 'Done: I made the change.', proposal: cur + '\n\n(revised by mock)' } : { reply: 'Mock answer.', proposal: null };
    return { text: JSON.stringify(data), data, raw: {} };
  }
  const text = o.prompt;
  const verdict = text.includes('[mock-pass]') ? 'PASS' : text.includes('[mock-fail]') ? 'FAIL' : 'FLAG';
  const title = /^Title:\s*(.+)$/m.exec(text)?.[1]?.trim() || 'Mock job';
  const none = 'not shown';
  const data = {
    job: {
      verdict,
      title,
      job: [{ label: 'Budget', value: none }],
      client: [{ label: 'Payment verified', value: none }],
      competition: [{ label: 'Proposals', value: none }],
      fit: 'Mock provider: no real screening was done.',
      fails: verdict === 'FAIL' ? [{ code: 'F1', rule: 'Mock fail rule', value: 'mock value' }] : [],
      flags: verdict === 'PASS' ? [] : [{ code: 'G14', rule: 'Mock flag rule', value: 'mock value' }],
      override_note: '',
      proposal_notes: ['Mock provider.'],
      columns: {
        posted: none, job_type: 'Hourly', budget: none, length_hours: none, experience_level: none, service_category: 'mock',
        required_skills: 'mock', client_country: none, payment_verified: none, client_rating: none, jobs_posted: none, hire_rate: none,
        total_spent: none, hires: none, avg_spend_per_hire: none, avg_hourly_paid: none, member_since: none, proposals: none,
        interviewing: none, invites_sent: none, connects_cost: none, sample_match: 'none',
      },
    },
  };
  return { text: JSON.stringify(data), data, raw: {} };
}

const provider = process.env.LLM_PROVIDER === 'claude-cli' ? runClaude : mockRun;
export const providerName = process.env.LLM_PROVIDER === 'claude-cli' ? 'claude-cli' : 'mock';

/** A short, safe description of a failed call: a status or a known runner message, never model text. */
function callError(e: unknown): string {
  if (e instanceof LlmCallError) return `model error${e.status ? ' ' + e.status : ''}`;
  const m = e instanceof Error ? e.message : '';
  if (/^(timeout|CLI |no structured output|LLM_|model error|invalid_output)/.test(m)) return m.slice(0, 200);
  return 'error';
}

/** Every model call goes through here: it is timed and logged (job, step, model, ms, ok) so the Logs page can show it. */
export async function run(o: RunOptions): Promise<RunResult> {
  const ctx = llmContext.getStore();
  const t0 = Date.now(); let ok = false; let err: string | null = null;
  try { const r = await provider(o); ok = true; return r; }
  catch (e) { err = callError(e); throw e; }
  finally {
    // only calls made inside a job are logged; tests and scripts call the model without a context and without a database
    if (ctx) require('../db').exec('INSERT INTO llm_calls (screening_id, proposal_id, kind, step, model, provider, ms, ok, error) VALUES (?,?,?,?,?,?,?,?,?)',
      [ctx?.screeningId ?? null, ctx?.proposalId ?? null, ctx?.kind ?? 'other', o.label ?? null, o.model, providerName, Date.now() - t0, ok ? 1 : 0, err])
      .catch((e: Error) => console.error('call log failed:', e.message)); // logging must never break the job
  }
}
