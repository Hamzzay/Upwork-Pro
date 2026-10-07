import 'dotenv/config';
import { exec, pool, query } from '../src/db';

/**
 * Example jobs for local review and demos: two or three in every Jobs tab (In progress, Submitted, Closed, Not pursued),
 * each with a report, a job posting, projects, a proposal and a status history where its phase has them.
 * They are marked (raw_input "[example]", title "Example · ...") so they never mix with real work:
 *   npm run seed:examples              add them (skipped if they already exist)
 *   npm run seed:examples -- --remove  remove them, and everything attached to them
 * Dev and demo only: never run this against the live database.
 */
const MARK = '[example]';
const ago = (days: number, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 3600_000).toISOString().slice(0, 19).replace('T', ' ');

type Stage = 'decide' | 'projects' | 'ready' | 'submitted' | 'closed' | 'skipped' | 'failed';
interface Ex {
  title: string; verdict: 'PASS' | 'FLAG' | 'FAIL'; codes: string[]; stage: Stage; days: number; country: string; budget: string; hire: string;
  statuses?: [string, number][]; outcome?: string; reason?: string; note?: string; notes?: string; error?: string;
}
const EXAMPLES: Ex[] = [
  { title: 'Shopify AI support chatbot with order lookups', verdict: 'FLAG', codes: ['G3', 'G14'], stage: 'decide', days: 0, country: 'United Kingdom', budget: '$25 to $45 /hr', hire: '58%' },
  { title: 'Real estate lead follow-up automation in GoHighLevel', verdict: 'PASS', codes: [], stage: 'projects', days: 1, country: 'United States', budget: '$3,000 fixed', hire: '81%' },
  { title: 'AI voice receptionist for a dental clinic', verdict: 'FLAG', codes: ['G4'], stage: 'ready', days: 1, country: 'Canada', budget: '$40 to $70 /hr', hire: '44%' },
  { title: 'GoHighLevel CRM migration from HubSpot', verdict: 'PASS', codes: [], stage: 'submitted', days: 3, country: 'Australia', budget: '$5,000 fixed', hire: '90%', statuses: [['Sent', 2]] },
  { title: 'RAG knowledge base for legal documents', verdict: 'FLAG', codes: ['G13'], stage: 'submitted', days: 5, country: 'Germany', budget: '$50 to $90 /hr', hire: '67%', statuses: [['Sent', 4], ['Viewed', 3], ['Chat opened', 1]] },
  { title: 'n8n invoice processing workflow', verdict: 'PASS', codes: [], stage: 'submitted', days: 12, country: 'Netherlands', budget: '$1,200 fixed', hire: '75%', statuses: [['Sent', 9]] },
  { title: 'AI voice agent for an HVAC company', verdict: 'PASS', codes: [], stage: 'closed', days: 20, country: 'United States', budget: '$60 /hr', hire: '88%', statuses: [['Sent', 18], ['Viewed', 17], ['Chat opened', 16], ['Interview', 14]], outcome: 'Hired' },
  { title: 'Next.js SaaS MVP for scheduling', verdict: 'FLAG', codes: ['G3', 'G10', 'G14', 'G15'], stage: 'closed', days: 15, country: 'India', budget: '$800 fixed', hire: '35%', statuses: [['Sent', 14], ['Viewed', 13], ['Chat opened', 12]], outcome: 'Not hired', reason: 'Budget too low', note: 'Client wanted the full MVP for under $1,000.' },
  { title: 'Web scraping pipeline for property listings', verdict: 'PASS', codes: [], stage: 'closed', days: 25, country: 'United States', budget: '$35 /hr', hire: '62%', statuses: [['Sent', 24], ['Viewed', 22], ['Chat opened', 21]], outcome: 'No response', reason: 'Went quiet after chat' },
  { title: 'Logo design with an unpaid test task', verdict: 'FAIL', codes: ['F2', 'G1'], stage: 'skipped', days: 6, country: 'Pakistan', budget: '$50 fixed', hire: '12%', notes: 'Unpaid test work and outside our services.' },
  { title: 'WordPress theme colour tweaks', verdict: 'FLAG', codes: ['G1', 'G2'], stage: 'skipped', days: 4, country: 'United States', budget: '$100 fixed', hire: '50%', notes: 'Too small and outside our services.' },
  { title: 'Link pasted before the Upwork API was connected', verdict: 'PASS', codes: [], stage: 'failed', days: 8, country: '', budget: '', hire: '', error: 'Links need the Upwork API, which is not connected yet. Paste the page text instead.' },
];

async function remove() {
  const ids = (await query<{ id: number }>('SELECT id FROM screenings WHERE raw_input=?', [MARK])).map((r) => r.id);
  if (!ids.length) return console.log('no example jobs to remove');
  const props = (await query<{ id: number }>('SELECT id FROM proposals WHERE screening_id IN (?)', [ids])).map((r) => r.id);
  if (props.length) for (const t of ['proposal_versions', 'proposal_messages']) await exec(`DELETE FROM ${t} WHERE proposal_id IN (?)`, [props]);
  for (const t of ['proposals', 'job_matches', 'job_tags', 'job_signals', 'overrides', 'status_events', 'field_changes', 'early_drafts', 'llm_calls']) {
    await exec(`DELETE FROM ${t} WHERE screening_id IN (?)`, [ids]);
  }
  await exec('DELETE FROM screenings WHERE id IN (?)', [ids]);
  console.log(`removed ${ids.length} example jobs`);
}

async function add() {
  if ((await query('SELECT 1 FROM screenings WHERE raw_input=? LIMIT 1', [MARK])).length) return console.log('example jobs already present (run with --remove first to recreate them)');
  const user = (await query<any>("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1"))[0];
  const profile = (await query<any>('SELECT id, name FROM upwork_profiles WHERE active=1 ORDER BY id LIMIT 1'))[0];
  const projects = await query<any>('SELECT id, name FROM projects WHERE active=1 ORDER BY id LIMIT 4');
  const template = (await query<any>('SELECT id, name FROM templates WHERE active=1 ORDER BY priority, id LIMIT 1'))[0];
  const rules = new Map((await query<any>('SELECT code, type, rule FROM rules')).map((r) => [r.code, r]));
  if (!user || !profile || projects.length < 2 || !template) throw new Error('run migrate, seed, seed:library and seed:proposals first (needs an admin, a profile, projects and a template)');
  let n = 0;
  for (const e of EXAMPLES) {
    const title = 'Example · ' + e.title;
    const created = ago(e.days, 3);
    const fails = e.codes.filter((c) => c.startsWith('F')).map((c) => ({ code: c, rule: rules.get(c)?.rule ?? c, value: 'Example value' }));
    const flags = e.codes.filter((c) => c.startsWith('G')).map((c) => ({ code: c, rule: rules.get(c)?.rule ?? c, value: 'Example value' }));
    const pair = (label: string, value: string) => ({ label, value: value || 'not shown' });
    const report = { job: { verdict: e.verdict, title, job: [pair('Job type and budget', e.budget), pair('Experience level', 'Intermediate')], client: [pair('Country', e.country), pair('Hire rate', e.hire)],
      competition: [pair('Proposals', '10 to 15')], fit: 'Example job: the kind of work Stackup delivers.', fails, flags, override_note: '', proposal_notes: ['Example notes for the proposal.'],
      columns: { client_country: e.country || 'not shown', budget: e.budget || 'not shown', hire_rate: e.hire || 'not shown', job_type: e.budget.includes('/hr') ? 'Hourly' : 'Fixed-price' } } };
    const posting = { title, posted: 'Posted ' + (e.days ? e.days + ' days ago' : 'today'), location: 'Worldwide',
      description: `This is an example job used to show how Upwork Pro lists and tracks work.\n\nWe need: ${e.title.toLowerCase()}.\n- Clear milestones\n- Weekly updates\n\nPlease include similar work you have done.`,
      skills: ['API Integration', 'Automation', 'JavaScript'], terms: [pair('Budget', e.budget), pair('Experience level', 'Intermediate')], screening_questions: ['Describe a similar project you delivered.'],
      activity: [pair('Proposals', '10 to 15')], client: [pair('Country', e.country), pair('Hire rate', e.hire)], client_history: [], other_open_jobs: [] };
    const done = e.stage !== 'failed';
    const continued = !['decide', 'skipped', 'failed'].includes(e.stage);
    const r = await exec(`INSERT INTO screenings (user_id, input_type, raw_input, job_text, status, title, verdict, report_json, rule_codes, fail_reasons, flag_reasons, client_country, budget, hire_rate, job_type,
        model, provider, created_at, started_at, finished_at, error_code, error_message, posting_json, posting_status, proceeded, notes, continued_at, tagging_status, tagged_at)
      VALUES (?, 'text', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'example', 'example', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, MARK, posting.description, done ? 'done' : 'error', title, done ? e.verdict : null, done ? JSON.stringify(report) : null, e.codes.join(', ') || null,
        fails.map((x) => `${x.rule}: ${x.value}`).join(' | ') || null, flags.map((x) => `${x.rule}: ${x.value}`).join(' | ') || null, e.country || null, e.budget || null, e.hire || null,
        report.job.columns.job_type, created, created, done ? ago(e.days, 2) : created, done ? null : 'unsupported_link', e.error ?? null, done ? JSON.stringify(posting) : null, done ? 'done' : null,
        e.stage === 'skipped' ? 'no' : continued ? 'yes' : null, e.notes ?? null, continued ? ago(e.days, 2) : null, continued ? 'done' : null, continued ? ago(e.days, 2) : null]);
    const id = Number(r.insertId);
    if (continued && e.verdict !== 'PASS') await exec('INSERT INTO overrides (screening_id, user_id, verdict_at_time, reason) VALUES (?,?,?,?)', [id, user.id, e.verdict, 'Example: strong client history, worth applying.']);
    if (continued) {
      const picked = e.stage !== 'projects';
      for (const [i, p] of projects.entries()) {
        await exec(`INSERT INTO job_matches (screening_id, project_id, project_name, rank_no, score, max_score, compliance_gap, recommended, shared_tags, selected) VALUES (?,?,?,?,?,?,0,?,?,?)`,
          [id, p.id, p.name, i + 1, 12 - i * 2, 16, i < 2 ? 1 : 0, JSON.stringify([]), picked && i < 2 ? 1 : 0]);
      }
      if (picked) {
        await exec('UPDATE screenings SET selection_confirmed_at=?, selection_confirmed_by=?, proposal_profile_id=?, upwork_profile_id=?, proposal_profile_confirmed_at=?, proposal_profile_confirmed_by=? WHERE id=?',
          [ago(e.days, 1), user.id, profile.id, profile.id, ago(e.days, 1), user.id, id]);
        const pr = await exec(`INSERT INTO proposals (screening_id, status, template_choice, template_id, template_name, created_by, created_at, finished_at, profile_id, finalized_at, finalized_by, model, warnings)
          VALUES (?, 'done', 'auto', ?, ?, ?, ?, ?, ?, ?, ?, 'example', '[]')`, [id, template.id, template.name, user.id, ago(e.days, 1), ago(e.days, 1), profile.id, ago(e.days, 0), user.id]);
        await exec(`INSERT INTO proposal_versions (proposal_id, version_no, content_html, source, note, created_by, created_at) VALUES (?, 1, ?, 'ai', 'Example proposal', NULL, ?)`,
          [pr.insertId, `<p>Example proposal for ${e.title.toLowerCase()}.</p><p>We have delivered ${projects[0].name} and ${projects[1].name}, which match this work closely.</p><p>Best regards,<br>${profile.name}</p>`, ago(e.days, 1)]);
      }
    }
    for (const [st, d] of e.statuses ?? []) {
      const at = ago(d);
      const col: Record<string, string> = { Sent: 'proposal_sent_at=?, proposal_sent_date=DATE(?)', Viewed: "client_viewed='yes', client_viewed_at=?", 'Chat opened': "client_replied='yes', client_replied_at=?", Interview: "interviewed='yes', interviewed_at=?" };
      await exec(`UPDATE screenings SET ${col[st]}, connects_spent=COALESCE(connects_spent, 16), tracking_updated_at=? WHERE id=?`, [...(st === 'Sent' ? [at, at] : [at]), at, id]);
      await exec('INSERT INTO status_events (screening_id, status, happened_at, user_id) VALUES (?,?,?,?)', [id, st, at, user.id]);
    }
    if (e.outcome) {
      const at = ago(Math.max(0, (e.statuses?.at(-1)?.[1] ?? 1) - 2));
      await exec('UPDATE screenings SET outcome=?, outcome_at=?, outcome_reason=?, outcome_note=?, tracking_updated_at=? WHERE id=?', [e.outcome, at, e.reason ?? null, e.note ?? null, at, id]);
      await exec('INSERT INTO status_events (screening_id, status, happened_at, user_id, reason, note) VALUES (?,?,?,?,?,?)', [id, e.outcome, at, user.id, e.reason ?? null, e.note ?? null]);
    }
    n++;
  }
  console.log(`added ${n} example jobs (In progress 3, Submitted 3, Closed 3, Not pursued 3)`);
}

(async () => {
  if (process.argv.includes('--remove')) await remove(); else await add();
  await pool.end();
})().catch(async (e) => { console.error('seed:examples failed:', e.message); await pool.end(); process.exit(1); });
