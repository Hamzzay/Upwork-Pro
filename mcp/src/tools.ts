import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Api, ApiError } from './api';
import { readSheet, safePath, sheetNames } from './xlsx';

const CHUNK = 50;
const LIMIT = 60_000;
const ok = (data: unknown) => {
  let text = typeof data === 'string' ? data : JSON.stringify(data, null, 1);
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
   A lost outcome needs one of the loss reasons, and the person's own words as the note if they gave any.`;

  T('plugin_options', `The values Upwork Pro accepts from the Claude plugin: active Upwork profiles (with their details), project names, rule codes, statuses, outcomes and loss reasons. Call this first.\n\n${PLUGIN_RULES}`, {}, { readOnlyHint: true, openWorldHint: false },
    async () => api.call('GET', '/plugin/options'));

  T('find_jobs', 'Look up jobs already in Upwork Pro: by Upwork link (url) or job id, by text (q), or by phase. Use it before save_job so the same job is not saved twice.',
    { url: z.string().optional(), job_id: z.string().optional(), q: z.string().optional(), phase: z.enum(['in_progress', 'submitted', 'closed', 'not_pursued']).optional(), limit: z.number().int().min(1).max(50).optional() },
    { readOnlyHint: true }, async (a) => api.call('GET', '/plugin/jobs?' + new URLSearchParams(Object.entries(a).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))));

  T('get_job', 'One job in Upwork Pro: where it stands, its status and history, and its latest proposal text.', { id: z.number().int() }, { readOnlyHint: true }, async (a) => api.call('GET', `/plugin/jobs/${a.id}`));

  const pairs = z.array(z.object({ label: z.string(), value: z.string() }));
  const rules = z.array(z.object({ code: z.string().describe('e.g. F2 or G14'), rule: z.string().optional(), value: z.string().optional().describe('The actual value behind it, e.g. "Hire rate 32%"') }));
  T('save_job', 'Save a job the plugin screened. Stored as sent (the app does not screen it again) and marked as coming from the Claude plugin. Refused if the same Upwork job is already saved (use find_jobs), unless force_new.',
    {
      job_text: z.string().describe('The job page text exactly as pasted'), job_url: z.string().optional(), title: z.string(),
      verdict: z.enum(['PASS', 'FLAG', 'FAIL']), fails: rules.optional(), flags: rules.optional(),
      job: pairs.optional().describe('Job facts: posted, budget, length, hours, experience...'), client: pairs.optional(), competition: pairs.optional(),
      fit: z.string().optional(), proposal_notes: z.array(z.string()).optional(),
      client_country: z.string().optional(), budget: z.string().optional(), hire_rate: z.string().optional(), job_type: z.string().optional(),
      posting: z.object({ posted: z.string().optional(), location: z.string().optional(), description: z.string().optional(), skills: z.array(z.string()).optional(), terms: pairs.optional(),
        screening_questions: z.array(z.string()).optional(), activity: pairs.optional(), client: pairs.optional(),
        client_history: z.array(z.object({ title: z.string().optional(), dates: z.string().optional(), amount: z.string().optional(), rating: z.string().optional(), feedback: z.string().optional() })).optional(),
        other_open_jobs: z.array(z.string()).optional() }).optional().describe('The job post in fields, if you read them'),
      decision: z.object({ continue: z.boolean(), reason: z.string().optional() }).optional().describe('If the person already decided: continue (a FLAG or FAIL needs their reason) or skip'),
      force_new: z.boolean().optional(),
    }, { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, async (a) => api.call('POST', '/plugin/jobs', a));

  T('record_decision', 'Record the person\'s decision on a saved job: continue (a FLAG or FAIL needs their reason) or skip.',
    { id: z.number().int(), continue: z.boolean(), reason: z.string().optional() }, { readOnlyHint: false, destructiveHint: false }, async (a) => api.call('POST', `/plugin/jobs/${a.id}/decision`, { continue: a.continue, reason: a.reason }));

  T('save_proposal', 'Save the proposal the plugin wrote for a saved job, with the profile (name) and the project names it used. Saving again adds a new version. finished=true (default) means ready to send.',
    { id: z.number().int(), text: z.string().describe('The proposal exactly as written'), profile: z.string().describe('Upwork profile name, see plugin_options'), projects: z.array(z.string()).optional(),
      template: z.string().optional().describe('Proposal type or template used'), finished: z.boolean().optional(), continue_reason: z.string().optional().describe('Only for a FLAG or FAIL job with no decision yet') },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, async (a) => { const { id, ...body } = a; return api.call('POST', `/plugin/jobs/${id}/proposal`, body); });

  T('get_library', 'The project library and tag dictionary from Upwork Pro: every active project with its links, overview, case study, industries and tags, and every tag with its category and match weight. Read it once per run for tagging and project matching; it is the only library (no sheet copy).',
    {}, { readOnlyHint: true, openWorldHint: false }, async () => api.call('GET', '/plugin/library'));

  T('get_writing_guide', 'The writing guide from Upwork Pro: the proposal types (when each is chosen and its length), how to choose the type (type_selection), writing rules, banned phrases, modules, screening answer rules and the verification checklist. Pass type (e.g. "1-standard-build" or "invite") for that type\'s full text, or all=true for every type.',
    { type: z.string().optional(), all: z.boolean().optional() }, { readOnlyHint: true, openWorldHint: false },
    async (a) => api.call('GET', '/plugin/writing-guide?' + new URLSearchParams({ ...(a.type ? { type: a.type } : {}), ...(a.all ? { all: '1' } : {}) })));

  T('add_profile', 'Add an Upwork profile Upwork Pro does not have yet, or fill the empty fields of an existing one (never overwrites). Admins only. Send only what your profile record says; leave out anything marked TO FILL.',
    { name: z.string().describe('The profile name, e.g. "Hassan Ijaz"'), tagline: z.string().optional().describe('Upwork headline'), price: z.number().optional().describe('Default hourly rate'),
      lowest_price: z.number().optional().describe('Lowest rate when work is slow'), profile_url: z.string().optional(), github_url: z.string().optional(), gitlab_account: z.string().optional(),
      services: z.string().optional(), industries: z.string().optional().describe('Industries to lead with'), voice: z.string().optional(), signature: z.string().optional(),
      stats_allowed: z.string().optional().describe('Upwork stats allowed in proposals'), submitted_by: z.string().optional().describe('Who submits from this profile'), rules: z.string().optional().describe('Profile rules for proposals'),
      notes: z.string().optional() },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, async (a) => api.call('POST', '/plugin/profiles', a));

  T('add_project', 'Add a project Upwork Pro does not have yet to the project library, or fill the empty fields of an existing one and add the tags it is missing (never removes or overwrites). Managers and admins. Send only what the person gives; never invent a field.',
    { name: z.string(), landing_link: z.string().optional(), system_link: z.string().optional(), mobile_link: z.string().optional().describe('One or more store links, space separated'),
      staging_link: z.string().optional(), case_study_link: z.string().optional(), overview: z.string().optional().describe('Project overview'), case_study_summary: z.string().optional(),
      tags: z.array(z.string()).optional().describe('Tag names marked x for this project, Industry tags included') },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, async (a) => api.call('POST', '/plugin/projects', a));

  T('update_status', 'Record what happened on Upwork: Sent (only once the proposal is finished), then Viewed, Chat opened, Interview, or an outcome (a lost outcome needs a loss reason). "at" is the date and time it happened, default now.',
    { id: z.number().int(), status: z.string().describe('Sent, Viewed, Chat opened, Interview, or an outcome from plugin_options'), at: z.string().optional().describe('YYYY-MM-DD HH:MM, default now'),
      reason: z.string().optional().describe('Loss reason, required for a lost outcome'), note: z.string().optional() },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async (a) => {
      const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      return api.call('POST', `/plugin/jobs/${a.id}/status`, { status: a.status, at: a.at || local, reason: a.reason, note: a.note });
    });

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
