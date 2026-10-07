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
