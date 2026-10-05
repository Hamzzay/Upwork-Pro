import 'dotenv/config'; // the provider is chosen at import time, so the env file must be loaded first
import { runClaude, type RunOptions, type RunResult } from './claude-runner';

/** Canned answer: no network, no cost. Shape matches the report contract. Triggers: [mock-pass], [mock-fail]. */
async function mockRun(o: RunOptions): Promise<RunResult> {
  const names: string[] | undefined = (o.schema as any)?.properties?.tags?.items?.properties?.tag?.enum;
  if (names) { // the tagging call: a fixed spread of dictionary tags, so matching has something to score
    const pick = [1, 12, 25, 40, 55, 70, 85].map((i) => names[i % names.length]);
    const data = { tags: [...new Set(pick)].map((tag) => ({ tag, reason: 'Mock reason: no real tagging was done.' })) };
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

export const run = process.env.LLM_PROVIDER === 'claude-cli' ? runClaude : mockRun;
export const providerName = process.env.LLM_PROVIDER === 'claude-cli' ? 'claude-cli' : 'mock';
