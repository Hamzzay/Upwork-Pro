import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Api, ApiError } from './api';
import { readSheet, safePath, sheetNames } from './xlsx';

const CHUNK = 50;
const LIMIT = 90_000; // characters, about 22k tokens: under the 25k tokens Claude takes from one tool answer
const ok = (data: unknown) => {
  let text = typeof data === 'string' ? data : JSON.stringify(data); // compact: the library is large
  if (text.length > LIMIT) text = JSON.stringify({ note: `The answer was ${text.length} characters, too long to show. Ask for less (a smaller sheet piece, or without tags).`, start: text.slice(0, 2000) });
  return { content: [{ type: 'text' as const, text }] };
};
const fail = (e: unknown) => ({ isError: true as const, content: [{ type: 'text' as const, text: e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong' }] });
const wrap = <A>(fn: (a: A) => Promise<unknown>) => async (a: A) => { try { return ok(await fn(a)); } catch (e) { return fail(e); } };

const RULES = `RULES FOR USING THESE TOOLS
1. Never save without the person's yes. Show them get_preview (what will be created, changed, left out and why), then ask. Only then call commit_import.
2. commit_import needs the preview_checksum from the preview they saw. If you add rows after it, get the preview again.
3. Send rows exactly as they are in the sheet. Never fix, translate, shorten or invent values. If a cell is empty, leave it empty.
4. At most 50 rows per add_rows call. Send big sheets in pieces; the preview covers all pieces.
5. Rows that are invalid are reported with a reason: show them to the person; do not retry them with changed values on your own.
6. Order for a full set: rules, tag_dictionary, projects, profiles (projects need their tags to exist first).`;

export function registerTools(server: McpServer, api: Api, opts: { importDir?: string }) {
  /** The days an update counts in (zone.ts on the server): the team's working day unless asked otherwise. */
  const zoneParam = { time_zone: z.string().optional().describe('Which days to count in: "team" (the team\'s working day, US Eastern unless an admin changed it; the default), "mine" (the person\'s own zone), or a zone name such as Asia/Karachi. Every answer says the zone and days it counted.') };
  const T = (name: string, description: string, inputSchema: any, annotations: any, fn: (a: any) => Promise<unknown>) =>
    server.registerTool(name, { description, inputSchema, annotations }, wrap(fn) as any);

  T('list_import_types', `What can be imported into Upwork Pro, which columns each type reads, and whether the signed-in person is allowed to. Call this first.\n\n${RULES}`, {}, { readOnlyHint: true, openWorldHint: false }, async () => api.call('GET', '/import/types'));

  T('start_import', 'Start an import of one type (see list_import_types). Nothing is saved yet. Returns a batch id for add_rows. allow_changes=false (default) never touches something that already exists; true lets rows update existing items and shows each change in the preview.',
    { type: z.string().describe('tag_dictionary, projects, rules or profiles'), source: z.string().max(190).optional().describe('Where the data comes from, e.g. the sheet name'), allow_changes: z.boolean().optional() },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, async (a) => api.call('POST', '/import/batches', { type: a.type, source: a.source, allow_changes: a.allow_changes }));

  T('add_rows', 'Add up to 50 sheet rows to an import and check them (nothing is saved). Pass the sheet header row as "headers" and each row as a list of cells in the same order. Column names are matched loosely (case, spaces). Returns, per row, whether it would be created, changed, left alone, blocked or invalid, and why.',
    { batch_id: z.number().int(), headers: z.array(z.string()).describe('The header row of the sheet'), rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).min(1).max(CHUNK).describe('Rows exactly as in the sheet') },
    { readOnlyHint: false, destructiveHint: false }, async (a) => api.call('POST', `/import/batches/${a.batch_id}/rows`, { headers: a.headers, rows: a.rows }));

  T('get_preview', 'What committing this import would do: counts, what will be created, what will change (with the differences), what is blocked or invalid and why. Show this to the person before asking to save. Also returns the preview_checksum that commit_import needs.',
    { batch_id: z.number().int() }, { readOnlyHint: true }, async (a) => api.call('GET', `/import/batches/${a.batch_id}`));

  T('commit_import', 'Save the import. ONLY after the person has seen get_preview and said yes. All rows are saved together or none are. Needs the preview_checksum from that preview.',
    { batch_id: z.number().int(), preview_checksum: z.string(), skip_invalid: z.boolean().optional().describe('Leave out invalid rows instead of refusing to save') },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false }, async (a) => api.call('POST', `/import/batches/${a.batch_id}/commit`, { preview_checksum: a.preview_checksum, skip_invalid: a.skip_invalid }));

  T('undo_import', 'Undo a saved import: restores what it changed and removes what it added. Refuses (and changes nothing) if something now depends on it. Ask the person first.',
    { batch_id: z.number().int() }, { readOnlyHint: false, destructiveHint: true }, async (a) => api.call('POST', `/import/batches/${a.batch_id}/undo`, {}));

  T('discard_import', 'Throw away an import that has not been saved.', { batch_id: z.number().int() }, { readOnlyHint: false, destructiveHint: false }, async (a) => api.call('DELETE', `/import/batches/${a.batch_id}`));
  T('list_imports', 'The signed-in person\'s recent imports and their status.', {}, { readOnlyHint: true }, async () => api.call('GET', '/import/batches'));

  T('list_projects', 'The projects already in Upwork Pro (name, link, number of tags). Use it to check names before importing. Tag names only when with_tags is true (long).', { with_tags: z.boolean().optional() }, { readOnlyHint: true },
    async (a) => ({ projects: ((await api.call('GET', '/projects')).projects as any[]).map((p) => ({ id: p.id, name: p.name, live_link: p.live_link, showable_publicly: p.showable_publicly, active: p.active, tag_count: p.tags.length, ...(a.with_tags ? { tags: p.tags.map((t: any) => t.name) } : {}) })) }));
  T('list_tags', 'The tag dictionary: categories, tags and their weights.', {}, { readOnlyHint: true }, async () => api.call('GET', '/tags'));
  T('list_profiles', 'The Upwork profiles already in Upwork Pro.', {}, { readOnlyHint: true }, async () => api.call('GET', '/profiles'));

  // ---------- the Claude plugin: save the job it screened, the proposal it wrote, and what happens on Upwork ----------
  const PLUGIN_RULES = `HOW TO SAVE PLUGIN WORK INTO UPWORK PRO
1. Call plugin_options once: it lists the profiles, project names, rule codes, statuses, outcomes and loss reasons the app accepts.
2. Before save_job, call find_jobs with the job link: if the job is already saved, update that one instead of saving it again.
3. save_job stores your screening as it is (the app does not screen it again): verdict, each fail and flag with its code and the value behind it,
   the job and client facts, and the posting fields if you read them. Send the job page text exactly as pasted.
4. If the person continues past a FLAG or FAIL, send their reason (decision.reason, or continue_reason on save_proposal). Never invent a reason.
5. save_proposal stores the proposal text exactly as written, with the profile and project names you used. finished=true means ready to send.
6. If the profile or a project you use is not in plugin_options, add it straight away with add_profile or add_project (from your own
   profile record or what the person gives: never invent a field), then save. Existing records are never overwritten; only empty fields are filled.
7. update_status only after it happened on Upwork: Sent first, then Viewed, Chat opened, Interview, then an outcome. "When" is now unless the person says otherwise.
   A status set by mistake is undone with update_status too: an earlier step takes back the steps after it (and the outcome), keeping that step's time; "Not sent" takes back the send.
   A lost outcome needs one of the loss reasons, and the person's own words as the note if they gave any.`;

  T('plugin_options', `The values Upwork Pro accepts from the Claude plugin: active Upwork profiles (with their details), project names, rule codes, statuses, outcomes, loss reasons, and the quick reasons to continue past a FLAG or FAIL (continue_reasons) or to skip a job (skip_reasons). Call this first.\n\n${PLUGIN_RULES}`, {}, { readOnlyHint: true, openWorldHint: false },
    async () => api.call('GET', '/plugin/options'));

  T('find_jobs', 'Look up jobs already in Upwork Pro: by Upwork link (url) or job id, by text (q), by phase, or with or without a job link (link). Use it before save_job so the same job is not saved twice. Up to 50 a page: when "more" is true, call again with page = next_page.',
    { url: z.string().optional(), job_id: z.string().optional(), q: z.string().optional(), phase: z.enum(['in_progress', 'submitted', 'closed', 'not_pursued']).optional(),
      link: z.enum(['yes', 'no']).optional().describe('"no": only jobs with no job link yet (each has job_page in get_job); "yes": only those with one'), page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(50).optional() },
    { readOnlyHint: true }, async (a) => api.call('GET', '/plugin/jobs?' + new URLSearchParams(Object.entries(a).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))));

  T('get_job', 'One job in Upwork Pro: where it stands, its status and history, job_page (the job page as it was pasted, its link included), returning_client (other jobs we screened from the same Upwork client, how each went and why they match: tell the person), its latest proposal (the cover letter in text, the screening answers apart in screening_answers), and under "saved" everything each step saved (decision, tags, signals, profile and rate, the shortlist and the projects picked, whether tech stack tags were skipped, the type, the Loom video, how many drafts). "continue_from" names the step to continue at when the job was left halfway.', { id: z.number().int() }, { readOnlyHint: true }, async (a) => api.call('GET', `/plugin/jobs/${a.id}`));

  // ---------- analysis: many jobs at once, and the trend numbers ----------
  const jobFilters = {
    ...zoneParam,
    from: z.string().optional().describe('Screened on or after this day, YYYY-MM-DD'), to: z.string().optional().describe('Screened on or before this day, YYYY-MM-DD'),
    sent_from: z.string().optional().describe('Sent on or after this day, YYYY-MM-DD'), sent_to: z.string().optional().describe('Sent on or before this day, YYYY-MM-DD'),
    phase: z.enum(['in_progress', 'submitted', 'closed', 'not_pursued']).optional(), profile_name: z.string().optional().describe('Upwork profile name, see plugin_options'),
    person: z.string().optional().describe('The name of the person who submitted the jobs (managers and admins)'), outcome: z.string().optional().describe('An outcome from plugin_options, or "none" for no outcome yet'),
    verdict: z.enum(['PASS', 'FLAG', 'FAIL']).optional(), rule: z.string().optional().describe('A rule code, e.g. G14'), source: z.enum(['app', 'claude_plugin']).optional().describe('Written in Upwork Pro or with the Claude plugin'),
    ptype: z.string().optional().describe('Proposal type name'), tag: z.string().optional().describe('A job tag name'), project: z.string().optional().describe('A project shown in the proposal'),
    loom: z.enum(['yes', 'no']).optional().describe('Sent with or without a Loom video'), link: z.enum(['yes', 'no']).optional().describe('With or without a job link (each row has job_url)'), q: z.string().optional().describe('Text in the title, client country, person, profile or rule'),
  };
  const qs = (a: Record<string, unknown>) => new URLSearchParams(Object.entries(a).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)]));
  T('analyze_jobs', `Many jobs in one call, to compare what worked: which proposals were viewed, got a chat, an interview, a hire. One row per job as a list of cells; the column names come once in "columns". Filter by dates and anything else, newest first.
The answer always fits: when "more" is true, call again with after = next_after and the same filters, and repeat until "more" is false. Collect every page before you analyse; never draw a conclusion from one page of several.
Every row already has: who, profile, where it was written, gate result and rule codes, the decision, proposal type, projects shown, industry, proposal length, Loom video, Connects, sent / viewed / chat / interview with their times, outcome and loss reason, client country, budget, and: mode (auto or steps), review_score, opening_sent (the opening style used, or As written), versions, documents, experience_confirmed, experience_waiting, feedback_count.
"include" adds heavier fields only when the question needs them (each makes pages smaller): client (hire rate, spend, rating), tags, signals, flags (each rule with the value behind it), history, description (the job post), proposal (the proposal text), review (the independent review: score, verdict, suggestions, what hurts it), feedback (the feedback people left on it), experience (the experience questions and answers), documents (what the AI read from the client's files), openings (the openings offered, and the one used). For counts and rates across groups, use get_trends instead: it is already counted.
Since R114 every row also has: skip_reason (why it was skipped), job_needs, core_work (the work a project had to prove), type_suggested (the type the app suggested, to compare with proposal_type and type_chosen), version_sent, ai_calls and ai_seconds. More "include" options: gate (what the gate wrote: fit and notes for the proposal), shortlist (every project shown, picked or not, with the AI's reason and score), types (every proposal type ranked, with why), chats (what people asked the AI in the proposal chat and the opening chat, and what it answered), ai (the AI's work per step: calls, seconds, model, failures), changes (every hand change to the job with old and new value, who and when), reviews (every review of every version, not only the latest).`,
    { ...jobFilters, include: z.array(z.enum(['client', 'tags', 'signals', 'flags', 'history', 'description', 'proposal', 'review', 'feedback', 'experience', 'documents', 'openings', 'gate', 'shortlist', 'types', 'chats', 'ai', 'changes', 'reviews'])).optional(), after: z.number().int().optional().describe('next_after from the previous page'),
      text_chars: z.number().int().min(100).max(20000).optional().describe('Cut each description and proposal at this many characters (default 1500)') },
    { readOnlyHint: true, openWorldHint: false }, async (a) => api.call('GET', '/plugin/analysis/jobs?' + qs(a)));

  T('get_trends', `The trend numbers from Upwork Pro's Reports page, already counted: for every group of every report, how many jobs were screened, continued, written, sent, viewed, got a chat, an interview, were hired or lost, and the Connects spent. Reports: profile, person, type (proposal type), type_choice, project, project_count, industry, tag, signal, rule, verdict, decision, source, loom, loom_video, boost, connects, length, speed, sent_weekday, sent_time, country, job_type, experience, outcome, loss_reason, week, and since R82: mode (auto mode or step by step), opening (the opening style sent), review (review score band), versions, documents (client files attached), gaps (experience questions asked and confirmed), feedback (proposals with feedback).
Use the same filters as analyze_jobs. Pass "reports" to get only some; "top" is how many groups per report (default 15). Rates are of sent proposals. Always say the sample size next to a rate, and say when a group is too small to mean much. Also skip_reason (why jobs were skipped after screening).`,
    { ...jobFilters, reports: z.array(z.string()).optional().describe('Report keys, e.g. ["profile", "type", "week"]'), top: z.number().int().min(1).max(100).optional() },
    { readOnlyHint: true, openWorldHint: false }, async (a) => api.call('GET', '/plugin/analysis/report?' + qs(a)));

  const pairs = z.array(z.object({ label: z.string(), value: z.string() }));
  const rules = z.array(z.object({ code: z.string().describe('e.g. F2 or G14'), rule: z.string().optional(), value: z.string().optional().describe('The actual value behind it, e.g. "Hire rate 32%"') }));
  T('save_job', 'Save a job the plugin screened, right after the gate and before the person decides (leave decision out; record it with record_decision when they answer). Stored as sent (the app does not screen it again) and marked as coming from the Claude plugin. Refused if the same Upwork job is already saved (use find_jobs), unless force_new.',
    {
      job_text: z.string().describe('The job page text exactly as pasted'), job_url: z.string().optional(), title: z.string(),
      verdict: z.enum(['PASS', 'FLAG', 'FAIL']), fails: rules.optional(), flags: rules.optional(),
      job: pairs.optional().describe('Job facts: posted, budget, length, hours, experience...'), client: pairs.optional(), competition: pairs.optional(),
      fit: z.string().optional(), proposal_notes: z.array(z.string()).optional(),
      client_country: z.string().optional(), budget: z.string().optional(), hire_rate: z.string().optional(), job_type: z.string().optional(),
      posting: z.object({ posted: z.string().optional(), location: z.string().optional(), description: z.string().optional(), skills: z.array(z.string()).optional(), terms: pairs.optional(),
        screening_questions: z.array(z.string()).optional(), activity: pairs.optional(), client: pairs.optional(),
        client_history: z.array(z.object({ title: z.string().optional(), dates: z.string().optional(), amount: z.string().optional(), rating: z.string().optional(), feedback: z.string().optional() })).optional(),
        other_open_jobs: z.array(z.string()).optional(), company_name: z.string().optional(), client_name: z.string().optional() }).optional().describe('Leave out: Upwork Pro reads the post into fields from job_text by itself, in the background. Send it only if you already have it in this exact shape'),
      decision: z.object({ continue: z.boolean(), reason: z.string().optional() }).optional().describe('If the person already decided: continue (a FLAG or FAIL needs their reason) or skip'),
      force_new: z.boolean().optional(),
      invited: z.boolean().optional().describe('True when the client invited us to this job (an invitation, not a post we found). Upwork opens the chat itself, so reports count invites apart. Left out: an invitation page is noticed from job_text'),
    }, { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, async (a) => api.call('POST', '/plugin/jobs', a));

  T('record_decision', 'Record the person\'s decision on a saved job: continue (a FLAG or FAIL needs their reason) or skip (give the reason they skip, too).',
    { id: z.number().int(), continue: z.boolean(), reason: z.string().optional(), picks: z.array(z.string()).optional().describe('The quick reasons the person picked, exactly as in plugin_options (continue_reasons when continuing, skip_reasons when skipping). Kept as data for the Flag review') },
    { readOnlyHint: false, destructiveHint: false }, async (a) => api.call('POST', `/plugin/jobs/${a.id}/decision`, { continue: a.continue, reason: a.reason, picks: a.picks }));

  T('list_feedback', `The feedback people left on proposals in Upwork Pro, newest first: the part of the proposal, the category (Wrong fact, Wrong project, Tone, Too long, Opening, Banned phrase, Other), what was wrong, and the job, profile, proposal type, projects and version it was about; with the counts per category, and the experience people confirmed on proposals. Use it to review what keeps going wrong and propose fixes to the setup. Filters: category, profile, type, person, from, to (YYYY-MM-DD), q (search), limit.`,
    { category: z.string().optional(), profile: z.string().optional(), type: z.string().optional(), person: z.string().optional(), from: z.string().optional(), to: z.string().optional(), q: z.string().optional(), limit: z.number().int().min(1).max(500).optional(), page: z.number().int().min(1).optional().describe('When "more" is true, call again with page = next_page: every note is reachable'), ...zoneParam },
    { readOnlyHint: true, openWorldHint: false }, async (a) => { const q = new URLSearchParams(Object.entries(a).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString(); return api.call('GET', '/plugin/feedback' + (q ? '?' + q : '')); });

  T('get_dashboard', `The Dashboard of Upwork Pro, already counted for a period: screened (pass, flag, fail), continued, proposals written and finished, sent, viewed, chats, interviews, hired, Connects; the speed of each step; what is waiting on whom; jobs per day; the rules that fire most and how often people continue past them; numbers by person and by profile; and "quality": the average review score, jobs in auto mode (written, stopped), openings picked, experience confirmed and still waiting, feedback left, jobs with documents. Filters: from, to (YYYY-MM-DD), profile (id), user (id), mine.`,
    { from: z.string().optional(), to: z.string().optional(), profile: z.string().optional(), user: z.string().optional(), mine: z.boolean().optional(), ...zoneParam },
    { readOnlyHint: true, openWorldHint: false }, async (a) => api.call('GET', '/plugin/dashboard?' + qs({ ...a, mine: a.mine ? '1' : undefined })));

  T('get_proposal_record', `Everything about one job's proposal, to see how it came to be and why: every version with its full text, who or what made it (AI, chat, hand edit, restore, an opening) and its note; the screening answers; the independent review in full; the openings offered and the one used; the experience questions with the answers and projects; the feedback left on it; the comparisons made between versions (better, weaker, worth bringing over, which to send); and the client's documents with what the AI read from them. Also whether it was made in auto mode. Use find_jobs or analyze_jobs to get the job id. And under "more": why it was skipped, what the job needs and its core work, what the gate wrote (fit, notes for the proposal), the full project shortlist with the AI's reason for each (picked or not), every proposal type ranked with why, both chats with the AI (what the person asked and what it answered), the AI's work per step (calls, seconds, model), every hand change with old and new value, and every review of every version.`,
    { job_id: z.number().int().positive().describe('The job id in Upwork Pro') }, { readOnlyHint: true, openWorldHint: false }, async (a) => api.call('GET', '/plugin/proposal-record/' + a.job_id));

  T('get_activity', `What happened in Upwork Pro in a period (managers and admins): the AI calls by step and model (how many, how many failed, the average time), the latest failed calls with their error and job, and what people did, counted by action and person (screened, continued, wrote, saved versions, changed the setup, read reports and so on). Default: the last 30 days. Filters: from, to (YYYY-MM-DD).`,
    { from: z.string().optional(), to: z.string().optional(), ...zoneParam }, { readOnlyHint: true, openWorldHint: false }, async (a) => api.call('GET', '/plugin/activity?' + qs(a)));

  T('review_flags', `The Flag review from Upwork Pro, for deciding which gate rules to relax and which to keep (managers and admins). For every rule: the jobs it fired on, how many were continued past it or skipped, the quick reasons picked each way, how the continued jobs did once sent (viewed, chat, interview, hired) against clean passes, the same counts when it was the only rule that fired, and a hint (relax, keep, doing its job, mixed, too few jobs yet). Also how many jobs are screened against the target of 200. Present it as a short table, most fired first, and say plainly that a hint is a starting point: a rule is changed only by an admin, through setup (kind rule), after reading the reasons.`,
    {}, { readOnlyHint: true, openWorldHint: false }, async () => api.call('GET', '/reports/flag-review'));

  T('save_step', `Save one step of a job as soon as the person answers it, so Upwork Pro always shows where the job stands and it can be continued later. Call it after each of these, never all at the end:
- read: the job tags (with a reason each, and core_rank 1 to 3 on the core work tags), the one job industry, and the signals with the words from the post that show each.
- profile: the profile the person picked and the rate.
- projects: the shortlist you showed (with the reason for each, recommended ones marked) and the projects the person picked, and skip_tech_stack true when the person chose to match without the Tech stack tags. Every project must be in the library: add a missing one with add_project first.
- type: the proposal type the person picked.
- loom: the Loom video the person picked (its title, from get_library for that profile), or null for none.
Saving a step again replaces what that step saved; other steps stay. The answer gives the job's stage in Upwork Pro after the save. If it is refused, show the message, fix only what the person confirms, and save again; never go on as if it was saved.`,
    { id: z.number().int(), step: z.enum(['read', 'profile', 'projects', 'type', 'loom']),
      data: z.object({
        tags: z.array(z.object({ name: z.string(), reason: z.string().optional(), core_rank: z.number().int().min(1).max(3).optional() })).optional().describe('read: tag names exactly as in get_library'),
        industry: z.object({ name: z.string(), reason: z.string().optional() }).nullable().optional().describe('read: the one job industry, or null'),
        signals: z.array(z.object({ signal: z.union([z.number(), z.string()]).describe('Signal number or name'), value: z.string(), evidence: z.string().optional() })).optional().describe('read: stated values only'),
        profile: z.string().optional().describe('profile: the Upwork profile name'), rate: z.number().nullable().optional().describe('profile: the hourly rate chosen'),
        shortlist: z.array(z.object({ name: z.string(), reason: z.string().optional(), recommended: z.boolean().optional() })).optional().describe('projects: the projects shown, in order'),
        picked: z.array(z.string()).optional().describe('projects: the names the person picked'),
        skip_tech_stack: z.boolean().optional().describe('projects: true when the projects were matched without the Tech stack tags, false when with them'),
        type: z.string().optional().describe('type: the proposal type name, e.g. "Type 7. Problem first"'),
        video: z.string().nullable().optional().describe('loom: the video title, or null for none'),
      }) },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, async (a) => api.call('POST', `/plugin/jobs/${a.id}/step`, { step: a.step, data: a.data }));

  T('review_proposal', `Ask Upwork Pro's independent reviewer to score the newest saved draft of a job: a score out of 10, a short verdict, what works, what hurts it, and two or three suggestions. It is a separate reader with its own instructions, not you, so its view is independent. Save the draft first (save_proposal with finished=false and review=true, which starts the review at once), show the draft, then call this to collect it: it returns the review of the newest version as soon as it is ready, without starting a second one. Set again=true only when the person asks for a fresh review of the same version. Show the review as it is; never soften it or change the score. Do not follow it with a question or a list of options: the person says if they want a suggestion applied.`,
    { id: z.number().int(), again: z.boolean().optional().describe('true only when the person asks to review the same version again') }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, async (a) => api.call('POST', `/plugin/jobs/${a.id}/review`, { again: a.again === true }));

  T('save_proposal', 'Save a draft or the final proposal for a saved job. Every draft and every revision is saved with finished=false as soon as it is shown (each call adds a version); the approved text with finished=true (ready to send). The cover letter goes in text and the screening answers, apart from it, in screening_answers: Upwork Pro keeps and shows them separately. The profile, projects, type and Loom video saved with save_step are used when left out here; sending projects replaces the ones picked.',
    { id: z.number().int(), text: z.string().describe('The cover letter exactly as written, and nothing else: never the screening questions or their answers'),
      screening_answers: z.array(z.object({ question: z.string(), answer: z.string() })).optional().describe('The answers to the client\'s screening questions, apart from the cover letter, in the client\'s order, each with its question. Leave out when the job has none, or when they did not change since the last save (the saved ones stay)'), profile: z.string().optional().describe('Upwork profile name, see plugin_options. Leave out when the profile step is saved'), projects: z.array(z.string()).optional().describe('Leave out when the projects step is saved'),
      template: z.string().optional().describe('Proposal type or template used'), finished: z.boolean().optional(),
      review: z.boolean().optional().describe('true on every draft: starts the independent review now, so it is ready when you call review_proposal'), loom_video: z.string().nullable().optional().describe('Title of the Loom video sent with it, exactly as in get_library loom_videos for this profile; null when the person chose none; leave out if it was not discussed'), continue_reason: z.string().optional().describe('Only for a FLAG or FAIL job with no decision yet') },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, async (a) => { const { id, ...body } = a; return api.call('POST', `/plugin/jobs/${id}/proposal`, body); });

  T('get_library', 'The project library and tag dictionary from Upwork Pro: every active project with its links, overview, industries and tags, every tag with its category and match weight, and the Loom videos per profile with their tags. Read it once per run for tagging and project matching; it is the only library (no sheet copy). Case studies are long and left out: once the projects are chosen, call again with case_studies set to their names.',
    { case_studies: z.array(z.string()).max(10).optional().describe('Project names whose case study to include, e.g. ["Breesy", "Apex"]'),
      known_version: z.string().optional().describe('The "version" of the library you already read in this conversation: if nothing changed, the answer is just "unchanged" and you use your copy') }, { readOnlyHint: true, openWorldHint: false },
    async (a) => { const q = new URLSearchParams({ ...(a.case_studies?.length ? { case_studies: a.case_studies.join(',') } : {}), ...(a.known_version ? { known_version: a.known_version } : {}) }).toString();
      return api.call('GET', '/plugin/library' + (q ? '?' + q : '')); });

  T('match_projects', `Match the Stackup projects to a saved job, on the server: the app's own matching (platform, the job's core work, industry, the weighted tags, compliance) and then the AI's order with a reason for each, the same list the app shows. It works on the job tags saved with save_step read, so save that first. Takes up to a minute. Show what it returns as it is; never score or reorder projects yourself. skip_tech_stack: true to match without the Tech stack tags.`,
    { id: z.number().int(), skip_tech_stack: z.boolean().optional() }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async (a) => api.call('POST', `/plugin/jobs/${a.id}/match`, { skip_tech_stack: a.skip_tech_stack }));

  T('get_writing_guide', 'The writing guide from Upwork Pro: the proposal types (when each is chosen and its length), how to choose the type (type_selection), the opening lines rules for every type (opening_lines; the first_two_lines of each type win where they differ), writing rules, banned phrases, modules, screening answer rules and the verification checklist. Pass type (e.g. "1-standard-build" or "invite") for that type\'s full text, or all=true for every type.',
    { type: z.string().optional(), all: z.boolean().optional(), known_version: z.string().optional().describe('The "version" you already read in this conversation: if nothing changed, the answer is "unchanged"') }, { readOnlyHint: true, openWorldHint: false },
    async (a) => api.call('GET', '/plugin/writing-guide?' + new URLSearchParams({ ...(a.type ? { type: a.type } : {}), ...(a.all ? { all: '1' } : {}), ...(a.known_version ? { known_version: a.known_version } : {}) })));

  T('add_profile', 'Add an Upwork profile Upwork Pro does not have yet, or fill the empty fields of an existing one (never overwrites). Admins only. Send only what your profile record says; leave out anything marked TO FILL.',
    { name: z.string().describe('The profile name, e.g. "Hassan Ijaz"'), tagline: z.string().optional().describe('Upwork headline'), price: z.number().optional().describe('Default hourly rate'),
      lowest_price: z.number().optional().describe('Lowest rate when work is slow'), profile_url: z.string().optional(), github_url: z.string().optional(), gitlab_account: z.string().optional(),
      services: z.string().optional(), industries: z.string().optional().describe('Industries to lead with'), voice: z.string().optional(), signature: z.string().optional(),
      stats_allowed: z.string().optional().describe('Upwork stats allowed in proposals'), submitted_by: z.string().optional().describe('Who submits from this profile'), rules: z.string().optional().describe('Profile rules for proposals'),
      notes: z.string().optional() },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, async (a) => api.call('POST', '/plugin/profiles', a));

  // ---------- the setup, for admins and managers (the setup-admin skill) ----------
  const KIND = z.enum(['project', 'industry', 'tag', 'tag_category', 'profile', 'loom_video', 'rule', 'signal', 'signal_value', 'template', 'template_sample', 'opening_template', 'word_shortcut', 'writing_doc', 'setting', 'gate_instructions', 'reviewer_instructions']);
  const sq = (o: Record<string, unknown>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); const t = p.toString(); return t ? '?' + t : ''; };

  T('setup_start', 'Call this first for any change to the setup of Upwork Pro. It says who is signed in, which kinds of things they may change (projects, industries, tags, profiles, Loom videos, rules, signals, proposal types, opening templates (each proposal type picks one as its default opening), word shortcuts (a main word and the short word proposals use instead), the writing guide, the instructions of the independent reviewer, gate instructions, settings), what happens after a change is applied, and what can never be changed from Claude.',
    {}, { readOnlyHint: true, openWorldHint: false }, async () => api.call('GET', '/plugin/setup'));

  T('setup_list', 'List the items of one kind in the setup, with a search. Always look here before adding something, so nothing is added twice. For gate_instructions and reviewer_instructions it lists the versions; for setting, every setting with its value and what it does.',
    { kind: KIND, q: z.string().optional().describe('Words to search for') }, { readOnlyHint: true, openWorldHint: false }, async (a) => api.call('GET', `/plugin/setup/list/${a.kind}` + sq({ q: a.q })));

  T('setup_get', 'One item of the setup in full: every field, its tags, industries or projects by name, and its last changes with who made them. Give its id or its exact name. For gate_instructions and reviewer_instructions, leave item out for the active version.',
    { kind: KIND, item: z.union([z.string(), z.number()]).optional().describe('Id, code or exact name') }, { readOnlyHint: true, openWorldHint: false }, async (a) => api.call('GET', `/plugin/setup/item/${a.kind}` + sq({ item: a.item })));

  T('setup_examples', 'Two or three complete, real items of a kind, to show the person what a good one looks like BEFORE asking for theirs, and to copy the format and style from when you write the new one.',
    { kind: KIND }, { readOnlyHint: true, openWorldHint: false }, async (a) => api.call('GET', `/plugin/setup/examples/${a.kind}`));

  T('setup_prepare', `Step one of every setup change. It checks the change with the same rules as the app and returns it as before and after, what it affects, any warnings, and a change_id. NOTHING is saved. Show the result to the person as it is and ask for a yes.
Actions: create, update, switch_on, switch_off (nothing is ever deleted: switch it off). For gate_instructions: new_version (fields content, change_note) and activate (fields version). For reviewer_instructions (how the independent reviewer scores every proposal): new_version with only the parts that change, any of method (how to review, text), concerns (key concerns, most important first, a list), dos and donts (lists), score_guide (text), score_limits (a list), writing (how to write the review, text), limits ({ strengths, problems, suggestions }: how many of each), context ({ signals, writing_rules, banned_phrases, checklist, automatic_checks }: true or false), and change_note; then activate (fields version). A list replaces the whole list: send every item to keep.
Give linked things by NAME: a project's tags and industries, a tag's category and projects, a Loom video's profile and tags, a signal's layer. A list replaces the whole list, so send the full list you want. A signal value or a sample proposal needs parent (the signal, or the proposal type). A setting takes fields { value }.
Never send the person's raw text: write every text field yourself in the format of setup_examples, and show it first.`,
    { kind: KIND, action: z.enum(['create', 'update', 'switch_on', 'switch_off', 'new_version', 'activate']), item: z.union([z.string(), z.number()]).optional().describe('For update and switch: the id, code or exact name'),
      parent: z.union([z.string(), z.number()]).optional().describe('For a new signal value: the signal. For a new sample proposal: the proposal type'),
      fields: z.record(z.string(), z.any()).optional().describe('Only the fields to set or change'), reason: z.string().describe('One or two sentences: why this change is made. Kept with the change') },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, async (a) => api.call('POST', '/plugin/setup/prepare', a));

  T('setup_apply', 'Step two: save a change that setup_prepare returned. Call it ONLY after the person saw that exact change and said yes in the chat. If the item changed in between, or the change is older than two hours, it is refused: prepare again and show the new result.',
    { change_id: z.number().int() }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, async (a) => api.call('POST', '/plugin/setup/apply', a));

  T('setup_history', 'The changes made to the setup, newest first: who, when, from the app or from Claude, what changed, the reason, and whether it is to review, applied or put back. Admins only.',
    { kind: KIND.optional(), item: z.string().optional().describe('Part of the item name'), person: z.string().optional(), status: z.enum(['review', 'applied', 'reverted']).optional(), limit: z.number().int().min(1).max(50).optional(), page: z.number().int().min(1).optional().describe('When "more" is true, call again with page = next_page') },
    { readOnlyHint: true, openWorldHint: false }, async (a) => api.call('GET', '/plugin/setup/history' + sq(a)));

  T('setup_revert', 'Put one change back: the item returns to exactly how it was before that change. Main admin only. Ask for a yes first. If the item was changed again later, it is refused and says what would also be undone: show that, and only with a second yes call again with even_if_changed_since.',
    { change_set: z.number().int(), even_if_changed_since: z.boolean().optional() }, { readOnlyHint: false, destructiveHint: true, idempotentHint: false }, async (a) => api.call('POST', '/plugin/setup/revert', a));

  T('setup_review', 'Main admin only: mark a change by another admin as seen (reviewed), or all of them. It changes nothing in the setup.',
    { change_set: z.number().int().optional(), all: z.boolean().optional() }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, async (a) => api.call('POST', '/plugin/setup/seen', a));

  T('add_project', 'Add a project Upwork Pro does not have yet to the project library, or fill the empty fields of an existing one and add the tags it is missing (never removes or overwrites). Managers and admins. Send only what the person gives; never invent a field.',
    { name: z.string(), landing_link: z.string().optional(), system_link: z.string().optional(), android_link: z.string().optional().describe('Google Play link'), ios_link: z.string().optional().describe('App Store link'), mobile_link: z.string().optional().describe('Only for an older combined store link: it is split into Android and iOS'),
      staging_link: z.string().optional(), case_study_link: z.string().optional(), overview: z.string().optional().describe('Project overview'), case_study_summary: z.string().optional(),
      tags: z.array(z.string()).optional().describe('Tag names marked x for this project, Industry tags included') },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, async (a) => api.call('POST', '/plugin/projects', a));

  T('update_status', 'Record what happened on Upwork: Sent (only once the proposal is finished), then Viewed, Chat opened, Interview, or an outcome (a lost outcome needs a loss reason). "at" is the date and time it happened, default now; it is read in the team\'s working day time zone (US Eastern) unless time_zone says otherwise: pass "mine" when the person gives a time on their own clock.',
    { id: z.number().int(), status: z.string().describe('Sent, Viewed, Chat opened, Interview, or an outcome from plugin_options. An earlier step undoes the ones after it; "Not sent" undoes the send'), at: z.string().optional().describe('YYYY-MM-DD HH:MM, default now'),
      reason: z.string().optional().describe('Loss reason, required for a lost outcome'), note: z.string().optional().describe('A note about this status, e.g. what the client said'),
      connects: z.number().int().optional().describe('Connects the proposal cost (with Sent)'), boost: z.number().int().optional().describe('Extra Connects spent on a boost'), notes: z.string().optional().describe('The job\'s own notes (replaces them)'),
      invited: z.boolean().optional().describe('With Sent: true when the client invited us to this job, false when we found it ourselves'), ...zoneParam },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async (a) => {
      // no "at": the server takes now; an "at" is read in the time_zone asked for (the team's working day by default)
      return api.call('POST', `/plugin/jobs/${a.id}/status` + (a.time_zone ? '?' + qs({ time_zone: a.time_zone }) : ''), { status: a.status, at: a.at, reason: a.reason, note: a.note, connects: a.connects, boost: a.boost, notes: a.notes, invited: a.invited });
    });

  // R121: corrections after checking Upwork against Upwork Pro, without recording a status again
  T('update_job_details', 'Correct a job\'s details without recording a status: the Connects it cost, the boost, the Loom video sent, whether it was an invite, its Upwork job link (job_link; get_job\'s job_page has the page as pasted, its link at the end), and add_note to add a dated note under the job\'s notes (it never replaces them). Use it when Upwork shows different Connects or boost than Upwork Pro, or to note what happened (a client\'s questions, a reply not answered). Every change is kept in the job\'s history. Statuses and outcomes go through update_status.',
    { id: z.number().int(), connects: z.number().int().nullable().optional().describe('The base Connects the proposal cost (null clears it)'),
      boost: z.number().int().nullable().optional().describe('The extra Connects spent on a boost (null clears it). Upwork shows base plus boost as one total: split it from the Connects history when you can'),
      loom_video: z.string().nullable().optional().describe('The title of the Loom video sent, exactly as in plugin_options (null: none)'),
      invited: z.boolean().optional().describe('True when the client invited us to this job'),
      job_link: z.string().nullable().optional().describe('The job\'s Upwork link, https://www.upwork.com/jobs/~02... (null clears it). Jobs saved from now on get it by themselves'),
      add_note: z.string().optional().describe('A note to add, for example "Client asked about the API limits; replied 23 Oct 5:48 PM; no answer since"') },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async (a) => api.call('POST', `/plugin/jobs/${a.id}/details`, { connects: a.connects, boost: a.boost, loom_video: a.loom_video, invited: a.invited, job_link: a.job_link, add_note: a.add_note }));

  T('discard_job', 'Admins only: discard a job (a test, a duplicate, a stale draft never sent). It leaves every list, count, report and export, and Claude no longer sees it; nothing is deleted and an admin can restore it in the app. Always ask the person first and give the reason.',
    { id: z.number().int(), reason: z.string().describe('Why, for example "Stale, not sent" or "Duplicate of #197"') },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async (a) => api.call('POST', `/plugin/jobs/${a.id}/discard`, { reason: a.reason }));

  if (opts.importDir) {
    T('list_workbook_sheets', 'Local mode only: the sheets of an .xlsx workbook in the import folder.', { file: z.string().describe('File name inside the import folder') }, { readOnlyHint: true },
      async (a) => ({ file: a.file, sheets: await sheetNames(safePath(opts.importDir, a.file)) }));
    T('import_xlsx_file', `Local mode only: read one sheet of an .xlsx workbook in the import folder and check it for import (nothing is saved). Knows the sheets "Tag Dictionary", "Project Tagging" (the X-mark grid becomes a tag list) and "Rule Codes"; for any other sheet pass "type" (e.g. profiles). Returns the full preview: show it to the person, then ask before commit_import.`,
      { file: z.string(), sheet: z.string(), type: z.string().optional(), allow_changes: z.boolean().optional() }, { readOnlyHint: false, destructiveHint: false },
      async (a) => {
        const s = await readSheet(safePath(opts.importDir, a.file), a.sheet);
        const type = a.type ?? s.type;
        if (!type) throw new Error(`I do not know what "${a.sheet}" is. Pass type: tag_dictionary, projects, rules or profiles`);
        const { id } = await api.call('POST', '/import/batches', { type, source: `${a.file} / ${a.sheet}`, allow_changes: a.allow_changes });
        try {
          for (let i = 0; i < s.rows.length; i += CHUNK) await api.call('POST', `/import/batches/${id}/rows`, { headers: s.headers, rows: s.rows.slice(i, i + CHUNK) });
        } catch (e) { await api.call('DELETE', `/import/batches/${id}`).catch(() => undefined); throw e; }
        return { ...(await api.call('GET', `/import/batches/${id}`)), sheet_rows_read: s.rows.length, sheet_rows_skipped: s.skipped };
      });
  }
}
