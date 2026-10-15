/**
 * The setup, run from Claude (PLAN-PLUGIN.md, Part B): projects, industries, tags, profiles, Loom videos, rules, signals, proposal
 * types, the writing guide, the gate instructions and settings. Two steps, always: `prepare` checks a change and shows it as before
 * and after and saves nothing; `apply` saves it, only for the person who prepared it. Apply calls the same route the website uses,
 * so a change from Claude gets the same checks, the same log line and the same change set (changesets.ts) as one made in the app.
 * Never from here: users, passwords, the AI provider and its keys, and deleting anything (an item is switched off instead).
 */
import { Router } from 'express';
import { z } from 'zod';
import { exec, query } from './db';
import { requireRole } from './auth';
import { config } from './config';
import { ChangedSince, KINDS, mainAdminId, raw, revert, same, type Raw } from './changesets';
import { lineDiff } from './changes';
import { categoryBody, industryBody, loomBody, profileBody, projectBody, tagBody } from './routes_library';
import { openingBody, sampleBody, signalBody, templateBody, valueBody } from './routes_proposals';
import { getSettings, SETTINGS } from './settings';
import { reviewerSections } from './proposal/reviewer';
import { activeReviewer, ensureReviewer, reviewerVersion } from './proposal/reviewer_store';
import { sectionsText } from './routes_reviewer';

export const setup = Router();
const staff = requireRole('admin', 'manager');
const ACTIONS = ['create', 'update', 'switch_on', 'switch_off', 'new_version', 'activate'] as const;
type Action = (typeof ACTIONS)[number];
class Refuse extends Error { constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); } }

/** A field the person gives by name, saved as an id: tags: ["Twilio"] becomes tag_ids: [41]. */
interface Ref { field: string; to: string; table: string; col?: string; many: boolean }
interface Spec {
  name: string;                                   // the column people know the item by
  body?: z.ZodObject<any>;                        // the website's own check for this kind
  create?: (parent: number | null) => string;     // the website's route that adds one
  item?: (id: string | number) => string;         // the website's route for one item
  put?: boolean;                                  // that route is PUT (default PATCH)
  refs?: Ref[];
  parent?: { table: string; col: string; label: string }; // an item that belongs to another: a signal value, a sample
  hint?: string[];                                // columns shown in a list besides the name
}
const ruleCreate = z.object({ type: z.enum(['fail', 'flag']), rule: z.string().trim().min(5, 'Describe the rule').max(300), details: z.string().trim().max(1000).optional() });
const ruleUpdate = z.object({ rule: z.string().trim().min(5).max(300).optional(), details: z.string().trim().max(1000).optional(), active: z.boolean().optional() });
const docBody = z.object({ content: z.string().trim().min(20, 'The text looks too short').max(100_000), title: z.string().trim().min(1).max(160).optional(), note: z.string().trim().max(250).optional(), active: z.boolean().optional() });
const SPEC: Record<string, Spec> = {
  project: { name: 'name', body: projectBody, create: () => '/projects', item: (id) => `/projects/${id}`, hint: ['overview'],
    refs: [{ field: 'tags', to: 'tag_ids', table: 'tags', many: true }, { field: 'industries', to: 'industry_ids', table: 'industries', many: true }] },
  industry: { name: 'name', body: industryBody, create: () => '/industries', item: (id) => `/industries/${id}`, hint: ['description', 'related'], refs: [{ field: 'projects', to: 'project_ids', table: 'projects', many: true }] },
  tag: { name: 'name', body: tagBody, create: () => '/admin/tags', item: (id) => `/admin/tags/${id}`, hint: ['weight', 'description'],
    refs: [{ field: 'category', to: 'category_id', table: 'tag_categories', many: false }, { field: 'projects', to: 'project_ids', table: 'projects', many: true }] },
  tag_category: { name: 'name', body: categoryBody, create: () => '/admin/categories', item: (id) => `/admin/categories/${id}`, hint: ['is_compliance'] },
  profile: { name: 'name', body: profileBody, create: () => '/profiles', item: (id) => `/profiles/${id}`, hint: ['tagline', 'price'] },
  loom_video: { name: 'title', body: loomBody, create: () => '/looms', item: (id) => `/looms/${id}`, hint: ['url', 'topic'],
    refs: [{ field: 'profile', to: 'profile_id', table: 'upwork_profiles', many: false }, { field: 'tags', to: 'tag_ids', table: 'tags', many: true }] },
  rule: { name: 'code', create: () => '/admin/rules', item: (code) => `/admin/rules/${code}`, hint: ['type', 'rule'] },
  signal: { name: 'name', body: signalBody, create: () => '/signals', item: (id) => `/signals/${id}`, hint: ['number', 'decides'], refs: [{ field: 'layer', to: 'layer_id', table: 'signal_layers', col: 'code', many: false }] },
  signal_value: { name: 'name', body: valueBody, create: (p) => `/signals/${p}/values`, item: (id) => `/signal-values/${id}`, hint: ['detect'], parent: { table: 'signals', col: 'signal_id', label: 'signal' } },
  template: { name: 'name', body: templateBody, create: () => '/templates', item: (id) => `/templates/${id}`, hint: ['description', 'priority'], refs: [{ field: 'default_opening', to: 'default_opening_id', table: 'opening_templates', many: false }] },
  opening_template: { name: 'name', body: openingBody, create: () => '/opening-templates', item: (id) => `/opening-templates/${id}`, hint: ['starts', 'instructions'] },
  template_sample: { name: 'title', body: sampleBody, create: (p) => `/templates/${p}/samples`, item: (id) => `/template-samples/${id}`, hint: ['author'], parent: { table: 'templates', col: 'template_id', label: 'proposal type' } },
  writing_doc: { name: 'title', body: docBody, item: (id) => `/writing-docs/${id}`, put: true, hint: ['doc_key', 'kind'] },
  setting: { name: 'k', item: (k) => `/admin/settings/${k}`, put: true },
  gate_instructions: { name: 'version' },
  reviewer_instructions: { name: 'version' },
};
/** Kinds kept as versions with one active: their table. */
const VERSIONS: Record<string, string> = { gate_instructions: 'skill_versions', reviewer_instructions: 'reviewer_versions' };
const HIDE = new Set(['created_at', 'updated_at', 'updated_by', 'created_by', 'added_via', 'source']);
const keyOf = (kind: string) => KINDS[kind].key ?? 'id';
const may = (kind: string, role: string) => !!KINDS[kind] && !!SPEC[kind] && KINDS[kind].roles.includes(role as any);
const settingKeys = () => Object.keys(SETTINGS).filter((k) => !k.startsWith('ai.'));
const short = (v: unknown, n = 160) => (v == null ? null : String(v).length > n ? String(v).slice(0, n) + '...' : v);

function kindOf(req: any): string {
  const kind = String(req.params.kind ?? req.body?.kind ?? '');
  if (!SPEC[kind]) throw new Refuse(400, `Unknown kind. Use one of: ${Object.keys(SPEC).join(', ')}`);
  if (!may(kind, req.user.role)) throw new Refuse(403, `Your role (${req.user.role}) may not change ${KINDS[kind].label.toLowerCase()}s. An admin can.`);
  return kind;
}
/** The names behind a list of ids, or the other way round, with the names that do not exist. */
async function idsFor(ref: Ref, names: string[]): Promise<{ ids: number[]; unknown: string[] }> {
  const col = ref.col ?? 'name', want = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))];
  if (!want.length) return { ids: [], unknown: [] };
  const rows = await query<any>(`SELECT id, ${col} AS n${ref.col ? ', name' : ''} FROM ${ref.table}`);
  const by = new Map<string, number>(); for (const r of rows) { by.set(String(r.n).toLowerCase(), r.id); if (r.name) by.set(String(r.name).toLowerCase(), r.id); }
  const ids: number[] = [], unknown: string[] = [];
  for (const n of want) { const id = by.get(n.toLowerCase()); if (id) ids.push(id); else unknown.push(n); }
  return { ids, unknown };
}
const namesFor = async (table: string, ids: number[], col = 'name') => (ids.length ? (await query<any>(`SELECT id, ${col} AS n FROM ${table} WHERE id IN (?)`, [ids])).map((r) => String(r.n)).sort((a, b) => a.localeCompare(b)) : []);

/** Find an item by its id (or code, or setting name) or by its name. */
async function find(kind: string, idOrName: unknown): Promise<string | number | null> {
  const v = String(idOrName ?? '').trim(); if (!v) return null;
  if (kind === 'setting') return settingKeys().includes(v) ? v : (settingKeys().find((k) => (SETTINGS as any)[k].label?.toLowerCase() === v.toLowerCase()) ?? null);
  const k = KINDS[kind], key = keyOf(kind), s = SPEC[kind];
  if (VERSIONS[kind]) return (await query<any>(`SELECT id FROM ${VERSIONS[kind]} WHERE version=?`, [Number(v.replace(/\D/g, '')) || 0]))[0]?.id ?? null;
  if (key === 'id' && /^\d+$/.test(v)) { const r = (await query<any>(`SELECT id FROM ${k.table} WHERE id=?`, [Number(v)]))[0]; if (r) return r.id; }
  const cols = [s.name, ...(kind === 'writing_doc' ? ['doc_key'] : []), ...(kind === 'signal' && /^\d+$/.test(v) ? ['number'] : [])];
  for (const c of cols) { const r = await query<any>(`SELECT ${key} AS id FROM ${k.table} WHERE ${c}=? LIMIT 2`, [v]); if (r.length === 1) return r[0].id; if (r.length > 1) throw new Refuse(409, `More than one ${k.label.toLowerCase()} is called "${v}". Use its id (see setup_list).`); }
  return null;
}
/** One item in full, with names instead of ids. */
async function detail(kind: string, id: string | number): Promise<Record<string, unknown> | null> {
  if (kind === 'setting') { const def = (SETTINGS as any)[id]; if (!def) return null; return { id, name: def.label ?? id, value: (await getSettings() as any)[id], what_it_does: def.help || null }; }
  if (kind === 'gate_instructions') { const v = (await query<any>('SELECT id, version, content, change_note, is_active, created_at FROM skill_versions WHERE id=?', [id]))[0]; return v ? { ...v, is_active: !!v.is_active } : null; }
  if (kind === 'reviewer_instructions') { const v = await reviewerVersion(Number(id)); return v ? { id: v.id, version: v.version, is_active: v.is_active, change_note: v.change_note, created_at: v.created_at, ...v.sections,
    fixed: 'Not changeable here: the facts the reviewer reads (the job, the proposal and its answers, the profile, the projects, the proposal type, the client requirements) and the output format (score, verdict, strengths, problems, suggestions).' } : null; }
  const r = await raw(kind, id); if (!r) return null;
  const out: Record<string, unknown> = {};
  for (const [c, v] of Object.entries(r.row)) if (!HIDE.has(c)) out[c] = v;
  for (const ref of SPEC[kind].refs ?? []) if (!ref.many && out[ref.to] != null) { out[ref.field] = (await namesFor(ref.table, [Number(out[ref.to])], ref.col))[0] ?? null; delete out[ref.to]; }
  for (const [field, , , , other] of KINDS[kind].links ?? []) out[field] = await namesFor(other, r.links[field] ?? []);
  if (kind === 'project') out.tags_by_category = Object.fromEntries(Object.entries((await query<any>('SELECT c.name AS c, t.name AS t FROM project_tags pt JOIN tags t ON t.id=pt.tag_id JOIN tag_categories c ON c.id=t.category_id WHERE pt.project_id=? ORDER BY c.sort_order, t.name', [id]))
    .reduce((m: Record<string, string[]>, x) => { (m[x.c] ??= []).push(x.t); return m; }, {})));
  const p = SPEC[kind].parent; if (p && out[p.col] != null) out[p.label] = (await query<any>(`SELECT name FROM ${p.table} WHERE id=?`, [out[p.col]]))[0]?.name ?? null;
  for (const [field, rows] of Object.entries(r.rows)) out[field] = rows;
  // R91: an opening template's examples read as the list the body takes
  if (kind === 'opening_template' && 'examples_json' in out) { try { out.examples = JSON.parse(String(out.examples_json ?? '[]')) ?? []; } catch { out.examples = []; } delete out.examples_json; out.match_examples = !!Number(out.match_examples); }
  return out;
}

const send = (res: any, e: unknown) => {
  if (e instanceof Refuse) return void res.status(e.status).json({ error: e.message, ...e.extra });
  if (e instanceof z.ZodError) return void res.status(400).json({ error: e.issues[0]?.message ?? 'Not valid', field: e.issues[0]?.path.join('.') || undefined });
  throw e;
};

// ---------- reading ----------
setup.get('/plugin/setup', staff, async (req, res) => {
  const main = (await mainAdminId()) === req.user!.id;
  res.json({ you: { name: req.user!.name, role: req.user!.role, main_admin: main }, kinds: Object.keys(SPEC).filter((k) => may(k, req.user!.role)).map((k) => ({ kind: k, what: KINDS[k].label })),
    how: 'setup_examples, then ask, then setup_prepare, show the change, and setup_apply only after a clear yes.',
    after_apply: req.user!.role !== 'admin' || main ? 'A change applies at once and is kept under Changes.' : 'A change applies at once. The main admin sees it under Changes, marked to review, and can put it back.',
    never_from_claude: ['users and passwords', 'the AI provider and its keys', 'deleting anything (switch it off instead)', 'discarding a job'] });
});
setup.get('/plugin/setup/list/:kind', staff, async (req, res) => {
  try {
    const kind = kindOf(req), q = String(req.query.q ?? '').trim().toLowerCase(), s = SPEC[kind], k = KINDS[kind];
    let rows: Record<string, unknown>[];
    if (kind === 'setting') { const cur = await getSettings() as any; rows = settingKeys().map((key) => ({ id: key, name: (SETTINGS as any)[key].label ?? key, value: short(Array.isArray(cur[key]) ? cur[key].join(', ') : cur[key]), what_it_does: (SETTINGS as any)[key].help || null })); }
    else if (VERSIONS[kind]) { if (kind === 'reviewer_instructions') await ensureReviewer(); rows = (await query<any>(`SELECT id, version, change_note, is_active, created_at FROM ${VERSIONS[kind]} ORDER BY version DESC`)).map((v) => ({ id: v.id, name: 'Version ' + v.version, active: !!v.is_active, note: v.change_note, saved: v.created_at })); }
    else {
      const all = await query<any>(`SELECT * FROM ${k.table}`);
      const cats = kind === 'tag' ? new Map((await query<any>('SELECT id, name FROM tag_categories')).map((c) => [c.id, c.name])) : null;
      const parents = s.parent ? new Map((await query<any>(`SELECT id, name FROM ${s.parent.table}`)).map((c) => [c.id, c.name])) : null;
      const profs = kind === 'loom_video' ? new Map((await query<any>('SELECT id, name FROM upwork_profiles')).map((c) => [c.id, c.name])) : null;
      rows = all.map((r) => ({ id: r[keyOf(kind)], name: r[s.name], ...(k.active ? { active: !!r[k.active] } : {}), ...(cats ? { category: cats.get(r.category_id) } : {}), ...(profs ? { profile: profs.get(r.profile_id) } : {}),
        ...(parents && s.parent ? { [s.parent.label]: parents.get(r[s.parent.col]) } : {}), ...Object.fromEntries((s.hint ?? []).map((h) => [h === 'weight' ? 'score' : h, short(r[h])])) }));
    }
    const shown = q ? rows.filter((r) => JSON.stringify(Object.values(r)).toLowerCase().includes(q)) : rows;
    res.json({ kind, total: rows.length, shown: shown.length, items: shown.slice(0, 300) });
  } catch (e) { send(res, e); }
});
setup.get('/plugin/setup/item/:kind', staff, async (req, res) => {
  try {
    const kind = kindOf(req);
    if (kind === 'reviewer_instructions') await ensureReviewer();
    const id = VERSIONS[kind] && !req.query.item ? (await query<any>(`SELECT id FROM ${VERSIONS[kind]} WHERE is_active=1`))[0]?.id : await find(kind, req.query.item);
    const item = id == null ? null : await detail(kind, id);
    if (!item) throw new Refuse(404, `No ${KINDS[kind].label.toLowerCase()} with that id or name. Call setup_list to see what exists.`);
    const changes = await query<any>(`SELECT c.id AS change_set, c.created_at AS at, u.name AS who, c.action, c.source, c.status, c.reason FROM change_sets c LEFT JOIN users u ON u.id=c.user_id WHERE c.entity=? AND c.entity_id=? ORDER BY c.id DESC LIMIT 5`, [kind, String(VERSIONS[kind] ? 'active' : id)]);
    res.json({ kind, item, last_changes: changes });
  } catch (e) { send(res, e); }
});
/** Two or three complete items of a kind, to show the person what a good one looks like before they give theirs. */
setup.get('/plugin/setup/examples/:kind', staff, async (req, res) => {
  try {
    const kind = kindOf(req), k = KINDS[kind];
    if (kind === 'setting' || VERSIONS[kind]) return void res.json({ kind, examples: [], note: 'No examples for this kind: read the current one with setup_get.' });
    const rows = await query<any>(`SELECT * FROM ${k.table}${k.active ? ` WHERE ${k.active}=1` : ''}`);
    const tagCount = kind === 'project' ? new Map((await query<any>('SELECT project_id, COUNT(*) AS n FROM project_tags GROUP BY project_id')).map((r) => [r.project_id, Number(r.n)])) : null;
    // the most complete ones: every field filled counts, and for a project its overview, case study and tags must be there
    const score = (r: any) => Object.values(r).filter((v) => v != null && v !== '').length + (tagCount ? Math.min(tagCount.get(r.id) ?? 0, 30) / 3 : 0);
    const good = rows.filter((r) => kind !== 'project' || (String(r.overview ?? '').length > 150 && String(r.case_study_summary ?? '').length > 300 && (tagCount!.get(r.id) ?? 0) >= 8));
    const picked = (good.length >= 2 ? good : rows).sort((a, b) => score(b) - score(a)).slice(0, 3);
    res.json({ kind, examples: (await Promise.all(picked.map((r) => detail(kind, r[keyOf(kind)])))).filter(Boolean), note: 'Show these to the person as the shape a good one has. Write the new one in the same format and style.' });
  } catch (e) { send(res, e); }
});

// ---------- step one: prepare (saves nothing but the prepared change itself) ----------
const prepareBody = z.object({ kind: z.string(), action: z.enum(ACTIONS), item: z.union([z.string(), z.number()]).optional(), parent: z.union([z.string(), z.number()]).optional(),
  fields: z.record(z.string(), z.any()).default({}), reason: z.string().trim().min(5, 'Say in a sentence why this change is made').max(2000) });
const eq = (a: unknown, b: unknown) => { const n = (x: unknown) => (x == null || x === '' ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x instanceof Date ? x.toISOString() : x);
  const x = n(a), y = n(b); return x === y || (x != null && y != null && String(x) === String(y)) || (x != null && y != null && String(x).trim() !== '' && !isNaN(Number(x)) && !isNaN(Number(y)) && Number(x) === Number(y)); };
const showVal = (was: unknown, is: unknown) => { const a = was == null ? '' : String(was), b = is == null ? '' : String(is);
  if (a.length > 300 || b.length > 300) { const d = lineDiff(a, b); return { lines_removed: d.removed.slice(0, 40), lines_added: d.added.slice(0, 40), ...(d.removed.length > 40 || d.added.length > 40 ? { note: 'Long text: the first 40 changed lines are shown.' } : {}) }; }
  return { before: was ?? null, after: is ?? null }; };

async function affects(kind: string, action: Action, id: string | number | null, changed: string[]): Promise<string[]> {
  const out: string[] = [], n = async (sql: string, p: any[] = []) => Number((await query<any>(sql, p))[0]?.n ?? 0);
  if (kind === 'project') {
    if (action === 'create') out.push('The project can be matched to jobs from the next job on. To be recommended it needs at least one tag for the work it proves (Workflow type or AI capability).');
    if (action === 'switch_off') out.push('It is no longer offered on the Projects step or to Claude. Jobs and proposals that already used it keep it.');
    if (changed.includes('tags') || changed.includes('industries')) out.push('Matching uses the new tags and industries from the next job matched. Jobs already matched keep their lists.');
    if (changed.some((c) => /link|overview|case_study/.test(c))) out.push('The writer uses the new text and links from the next proposal written.');
  }
  if (kind === 'tag' && id != null) { const c = await n('SELECT COUNT(*) AS n FROM project_tags WHERE tag_id=?', [id]);
    out.push(`This tag is on ${c} project${c === 1 ? '' : 's'}.`); if (changed.some((c) => c.startsWith('score'))) out.push('The score is how much the tag counts when a job has it too: a higher score moves the projects with this tag up the list.');
    if (changed.includes('description')) out.push('The description is what the AI reads to decide whether a job gets this tag.'); if (action === 'switch_off') out.push('Jobs are no longer given this tag, and it no longer counts in matching.'); }
  if (kind === 'tag' && action === 'create') out.push('The AI can give this tag to jobs from the next job on. It only helps matching once projects have it too.');
  if (kind === 'industry') out.push('Industries order the Projects step: the same industry first, then related ones, among projects that prove the work.');
  if (kind === 'rule') { out.push('Every active rule is added to the gate instructions for every job screened from now on.');
    if (id != null) { const c = await n("SELECT COUNT(*) AS n FROM screenings WHERE discarded_at IS NULL AND FIND_IN_SET(?, REPLACE(rule_codes, ' ', ''))", [id]); out.push(`${id} fired on ${c} past job${c === 1 ? '' : 's'}. Past results do not change.`); }
    if (action === 'create') out.push('It gets the next free code. Codes are never reused.'); }
  if (kind === 'profile' && id != null) { const c = await n('SELECT COUNT(*) AS n FROM screenings WHERE proposal_profile_id=? AND discarded_at IS NULL', [id]); out.push(`${c} job${c === 1 ? ' uses' : 's use'} this profile. The writer uses the new values from the next proposal written.`); }
  if (kind === 'loom_video') out.push('The video is suggested on the Profile step for jobs that share its tags, for its profile only.');
  if (kind === 'signal' || kind === 'signal_value') out.push('Signals are read from every job and decide which proposal type is suggested.');
  if (kind === 'template' || kind === 'template_sample') out.push('Used from the next proposal written with this type. Proposals already written do not change.');
  if (kind === 'writing_doc') out.push('The writer reads this for every proposal from now on. The earlier text is kept as a version.');
  if (kind === 'setting' && id != null) out.push((SETTINGS as any)[id]?.help || 'Changes how the app behaves from now on.');
  if (kind === 'reviewer_instructions') out.push(action === 'activate' ? 'Every review from now on, in the app and from Claude, uses this version. Reviews already made do not change.' : 'Saved as a new version that is NOT active yet. Test it on a past proposal in the app (Reviewer, Try it), then activate it.');
  if (kind === 'gate_instructions') out.push(action === 'activate' ? 'Every job screened from now on is checked with this version.' : 'Saved as a new version that is NOT active yet. Test it on a past job in the app (Gate instructions, Test), then activate it.');
  return out;
}

setup.post('/plugin/setup/prepare', staff, async (req, res) => {
  try {
    const b = prepareBody.parse(req.body); const kind = kindOf({ ...req, params: {}, body: b, user: req.user }), s = SPEC[kind], k = KINDS[kind], action = b.action;
    const fields: Record<string, any> = { ...b.fields }; const changes: Record<string, unknown>[] = []; const warnings: string[] = [];
    let method = 'PATCH', path = '', body: Record<string, any> = {}, id: string | number | null = null, name: string | null = null;

    if (kind === 'gate_instructions') {
      if (req.user!.role !== 'admin') throw new Refuse(403, 'Only an admin changes the gate instructions');
      if (action === 'new_version') { const c = z.object({ content: z.string().min(200, 'The gate instructions look too short').max(100_000), change_note: z.string().trim().max(250).optional() }).parse(fields);
        const cur = (await query<any>('SELECT version, content FROM skill_versions WHERE is_active=1'))[0];
        if (cur && cur.content === c.content) throw new Refuse(400, 'This text is the same as the active version: nothing to save.');
        method = 'POST'; path = '/admin/skill'; body = c; name = 'A new version'; changes.push({ field: 'instructions', ...showVal(cur?.content ?? '', c.content) }); }
      else if (action === 'activate') { const vid = await find(kind, fields.version ?? b.item); if (vid == null) throw new Refuse(404, 'No such version. Call setup_list for the versions.');
        const [v, cur] = [(await query<any>('SELECT version, is_active FROM skill_versions WHERE id=?', [vid]))[0], (await query<any>('SELECT version FROM skill_versions WHERE is_active=1'))[0]];
        if (v.is_active) throw new Refuse(400, `Version ${v.version} is already the active one.`);
        method = 'POST'; path = `/admin/skill/${vid}/activate`; id = 'active'; name = 'Version ' + v.version; changes.push({ field: 'active version', before: cur?.version ?? null, after: v.version }); }
      else throw new Refuse(400, 'For the gate instructions use action new_version (fields: content, change_note) or activate (fields: version).');
    } else if (kind === 'reviewer_instructions') {
      if (req.user!.role !== 'admin') throw new Refuse(403, 'Only an admin changes the reviewer');
      const active = await activeReviewer();
      if (action === 'new_version') {
        // only the sections sent change; the rest is kept from the active version
        const { change_note, ...given } = fields;
        const known = Object.keys(reviewerSections.shape); const extra = Object.keys(given).filter((f) => !known.includes(f));
        if (extra.length) throw new Refuse(400, `Not a part of the reviewer: ${extra.join(', ')}. Its parts: ${known.join(', ')}, and change_note.`);
        if (!Object.keys(given).length) throw new Refuse(400, `Send at least one part to change: ${known.join(', ')}.`);
        const merged = { ...active.sections, ...given, limits: { ...active.sections.limits, ...(given.limits ?? {}) }, context: { ...active.sections.context, ...(given.context ?? {}) } };
        const sections = reviewerSections.parse(merged);
        if (JSON.stringify(sections) === JSON.stringify(reviewerSections.parse(active.sections))) throw new Refuse(400, 'This is the same as the active version: nothing to save.');
        const was = sectionsText(active.sections), is = sectionsText(sections);
        for (const f of Object.keys(is)) if ((was[f] ?? null) !== (is[f] ?? null)) changes.push({ field: f, ...showVal(was[f], is[f]) });
        method = 'POST'; path = '/admin/reviewer'; body = { sections, change_note: z.string().trim().max(250).optional().parse(change_note) }; name = 'A new version';
      } else if (action === 'activate') {
        const vid = await find(kind, fields.version ?? b.item); if (vid == null) throw new Refuse(404, 'No such version. Call setup_list for the versions.');
        const v = await reviewerVersion(Number(vid));
        if (v!.is_active) throw new Refuse(400, `Version ${v!.version} is already the active one.`);
        method = 'POST'; path = `/admin/reviewer/${vid}/activate`; id = 'active'; name = 'Version ' + v!.version; changes.push({ field: 'active version', before: active.version, after: v!.version });
      } else throw new Refuse(400, 'For the reviewer use action new_version (fields: any of method, concerns, dos, donts, score_guide, score_limits, writing, limits, context, and change_note) or activate (fields: version).');
    } else {
      if (action === 'new_version' || action === 'activate') throw new Refuse(400, 'new_version and activate are only for gate_instructions and reviewer_instructions.');
      if (action === 'create') {
        if (!s.create) throw new Refuse(400, `A ${k.label.toLowerCase()} cannot be added from here, only changed.`);
        const given = fields[s.name]; const there = given ? await find(kind, given) : null;
        if (there != null && kind !== 'signal_value' && kind !== 'template_sample') throw new Refuse(409, `A ${k.label.toLowerCase()} called "${given}" already exists. Update that one instead (action update).`, { existing: await detail(kind, there) });
      } else {
        id = await find(kind, b.item); if (id == null) throw new Refuse(404, `No ${k.label.toLowerCase()} with that id or name. Call setup_list to see what exists.`);
        if (!s.item) throw new Refuse(400, 'This kind cannot be changed from here.');
        if (action === 'switch_on' || action === 'switch_off') { if (!k.active) throw new Refuse(400, `A ${k.label.toLowerCase()} has no on and off.`); for (const f of Object.keys(fields)) delete fields[f]; fields.active = action === 'switch_on'; }
      }
      // names to ids
      for (const ref of s.refs ?? []) {
        if (!(ref.field in fields)) continue;
        const given = fields[ref.field]; delete fields[ref.field];
        const r = await idsFor(ref, ref.many ? (Array.isArray(given) ? given : [given]) : [given]);
        if (r.unknown.length) throw new Refuse(400, `Not in Upwork Pro: ${r.unknown.join(', ')} (${ref.field}). Use the exact names from setup_list, or add them first.`, { unknown: r.unknown, field: ref.field });
        fields[ref.to] = ref.many ? r.ids : r.ids[0] ?? null;
      }
      let parentId: number | null = null;
      if (s.parent && action === 'create') { const pk = s.parent.table === 'signals' ? 'signal' : 'template'; parentId = Number(await find(pk, b.parent)) || null; if (!parentId) throw new Refuse(400, `Say which ${s.parent.label} this belongs to (parent).`); }

      const cur = id != null ? await raw(kind, id) : null;
      if (kind === 'setting') {
        const key = String(id); const value = (SETTINGS as any)[key].schema.parse(fields.value); const was = (await getSettings() as any)[key];
        if (JSON.stringify(was) === JSON.stringify(value)) throw new Refuse(400, 'That is the value it already has: nothing to change.');
        method = 'PUT'; path = s.item!(key); body = { value }; name = (SETTINGS as any)[key].label ?? key; changes.push({ field: name, before: was, after: value });
      } else {
        const schema = kind === 'rule' ? (action === 'create' ? ruleCreate : ruleUpdate) : s.body!;
        const allowed = Object.keys(schema.shape); const extra = Object.keys(fields).filter((f) => !allowed.includes(f));
        if (extra.length) throw new Refuse(400, `Not a field of a ${k.label.toLowerCase()}: ${extra.join(', ')}. Its fields: ${[...allowed.filter((a) => !(s.refs ?? []).some((r) => r.to === a)), ...(s.refs ?? []).map((r) => r.field)].join(', ')}.`);
        if (kind === 'writing_doc' && fields.content === undefined) fields.content = cur!.row.content; // the route wants the text with every save
        const parsed: Record<string, any> = (action === 'create' || kind === 'writing_doc' ? schema : schema.partial()).parse(fields);
        // keep only what the person gave, and of that only what really changes
        for (const f of Object.keys(parsed)) {
          if (!(f in fields)) { delete parsed[f]; continue; }
          const ref = (s.refs ?? []).find((r) => r.to === f);
          if (ref?.many) { const was = cur?.links[ref.field] ?? [], is: number[] = parsed[f] ?? [];
            const add = is.filter((x) => !was.includes(x)), rem = was.filter((x) => !is.includes(x));
            if (cur && !add.length && !rem.length) { delete parsed[f]; continue; }
            changes.push({ field: ref.field, added: await namesFor(ref.table, add), removed: await namesFor(ref.table, rem), ...(cur ? { now_has: is.length } : {}) }); continue; }
          const was = cur ? cur.row[f] : null;
          if (cur && eq(was, parsed[f]) && !(kind === 'writing_doc' && f === 'content')) { delete parsed[f]; continue; }
          if (kind === 'writing_doc' && f === 'content' && eq(was, parsed[f])) continue; // sent along, not a change
          if (f === 'note') continue;
          if (ref) changes.push({ field: ref.field, before: was == null ? null : (await namesFor(ref.table, [Number(was)], ref.col))[0] ?? null, after: parsed[f] == null ? null : (await namesFor(ref.table, [Number(parsed[f])], ref.col))[0] ?? null });
          else if (parsed[f] != null && parsed[f] !== '' || cur) changes.push({ field: f === 'weight' ? 'score (weight)' : f, ...showVal(typeof was === 'number' && typeof parsed[f] === 'boolean' ? !!was : was, parsed[f]) });
        }
        if (!changes.length) throw new Refuse(400, 'Nothing would change: the item already has these values.');
        method = action === 'create' ? 'POST' : s.put ? 'PUT' : 'PATCH'; path = action === 'create' ? s.create!(parentId) : s.item!(id!); body = parsed;
        name = String(parsed[s.name] ?? cur?.row[s.name] ?? '') || null;
        if (kind === 'project' && action === 'create') { if (!(parsed.tag_ids ?? []).length) warnings.push('No tags: without a tag for the work it proves, this project is never recommended.'); if (!parsed.overview) warnings.push('No overview.'); if (!parsed.case_study_summary) warnings.push('No case study.'); if (!parsed.live_link) warnings.push('No link to show in a proposal (live_link).'); }
        if (kind === 'rule' && action === 'create') name = 'A new ' + parsed.type + ' rule';
      }
    }
    const before: Raw | null = id != null && kind !== 'setting' ? await raw(kind, id) : id != null ? await raw(kind, id) : null;
    const r = await exec('INSERT INTO setup_prepared (user_id, kind, action, entity_id, entity_name, method, path, body_json, before_json, reason) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [req.user!.id, kind, action, id == null ? null : String(id), name?.slice(0, 200) ?? null, method, path, JSON.stringify(body), before ? JSON.stringify(before) : null, b.reason]);
    const main = (await mainAdminId()) === req.user!.id;
    res.json({ change_id: r.insertId, saved: false, kind, action, item: name, changes, affects: await affects(kind, action, id, changes.map((c) => String(c.field))), warnings,
      next: 'Show this to the person exactly as it is. Call setup_apply with this change_id only after a clear yes. It can be applied for two hours.',
      after_apply: req.user!.role === 'admin' && !main ? 'It applies at once. The main admin sees it under Changes, marked to review, and can put it back.' : 'It applies at once and is kept under Changes, where it can be put back.' });
  } catch (e) { send(res, e); }
});

// ---------- step two: apply (the website's own route does the saving) ----------
setup.post('/plugin/setup/apply', staff, async (req, res) => {
  try {
    const b = z.object({ change_id: z.number().int().positive() }).parse(req.body);
    const p = (await query<any>('SELECT *, created_at < NOW() - INTERVAL 2 HOUR AS old FROM setup_prepared WHERE id=? AND user_id=?', [b.change_id, req.user!.id]))[0];
    if (!p) throw new Refuse(404, 'No prepared change with that number for you. Prepare it again.');
    if (p.applied_at) throw new Refuse(409, 'This change was already applied.', { change_set: p.change_set_id });
    if (Number(p.old)) throw new Refuse(410, 'This was prepared more than two hours ago. Prepare it again, so the person sees the current values.');
    if (!may(p.kind, req.user!.role)) throw new Refuse(403, 'Your role may not make this change.');
    // somebody changed the item between the two steps: the person approved a "before" that is no longer true
    if (p.entity_id != null && !same(p.before_json ? JSON.parse(p.before_json) : null, await raw(p.kind, p.entity_id)))
      throw new Refuse(409, 'This item was changed by someone else after you prepared this. Prepare it again to see the current values.');
    const last = Number((await query<any>('SELECT COALESCE(MAX(id),0) AS n FROM change_sets'))[0].n);
    const r = await fetch(`http://127.0.0.1:${config.port}/api${p.path}`, { method: p.method, body: p.body_json,
      headers: { Authorization: String(req.headers.authorization ?? ''), 'Content-Type': 'application/json', 'X-Upw-Prepared': String(p.id) } });
    const answer: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Refuse(r.status === 401 ? 403 : r.status, answer?.error ? `Not saved: ${answer.error}` : 'Not saved: Upwork Pro refused the change.');
    let set: number | null = null; // the change set is written just after the route answers
    for (let i = 0; i < 20 && set == null; i++) { set = (await query<any>('SELECT id FROM change_sets WHERE id>? AND user_id=? AND entity=? ORDER BY id DESC LIMIT 1', [last, req.user!.id, p.kind]))[0]?.id ?? null; if (set == null) await new Promise((x) => setTimeout(x, 150)); }
    await exec('UPDATE setup_prepared SET applied_at=NOW(), change_set_id=? WHERE id=?', [set, p.id]);
    const newId = answer?.id ?? answer?.code ?? p.entity_id;
    res.json({ ok: true, saved: true, kind: p.kind, action: p.action, item: answer?.code ?? p.entity_name, id: newId, change_set: set,
      ...(VERSIONS[p.kind] && p.action === 'new_version' ? { version: answer?.version, note: 'Saved as a new version. It is not active yet.' } : {}),
      where: 'In Upwork Pro under Changes' + (set ? `, change ${set}` : '') + '.' });
  } catch (e) { send(res, e); }
});

// ---------- the history, and putting a change back ----------
setup.get('/plugin/setup/history', requireRole('admin'), async (req, res) => {
  try {
    const f = z.object({ kind: z.string().max(40).optional(), item: z.string().max(200).optional(), status: z.enum(['review', 'applied', 'reverted']).optional(), person: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
    const where: string[] = [], p: any[] = [];
    if (f.kind) { where.push('c.entity=?'); p.push(f.kind); }
    if (f.item) { where.push('(c.entity_name LIKE ? OR c.entity_id=?)'); p.push('%' + f.item + '%', f.item); }
    if (f.person) { where.push('u.name LIKE ?'); p.push('%' + f.person + '%'); }
    if (f.status === 'review') where.push("c.needs_review=1 AND c.status='applied'"); else if (f.status) { where.push('c.status=?'); p.push(f.status); }
    const rows = await query<any>(`SELECT c.id, c.created_at, u.name AS who, c.source, c.entity, c.entity_name, c.action, c.changes_json, c.reason, c.status, c.needs_review FROM change_sets c LEFT JOIN users u ON u.id=c.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id DESC LIMIT ?`, [...p, f.limit]);
    res.json({ you_are_main_admin: (await mainAdminId()) === req.user!.id, changes: rows.map((c) => ({ change_set: c.id, at: c.created_at, who: c.who, from: c.source === 'claude_plugin' ? 'Claude' : 'the app', kind: c.entity, item: c.entity_name, action: c.action,
      changed: (JSON.parse(c.changes_json || '[]') as any[]).map((x) => ({ field: x.field, ...(x.added || x.removed ? { added: (x.added ?? []).slice(0, 12), removed: (x.removed ?? []).slice(0, 12) } : { before: short(x.from, 200), after: short(x.to, 200) }) })).slice(0, 12),
      reason: c.reason, status: c.status === 'reverted' ? 'put back' : Number(c.needs_review) ? 'to review' : 'applied' })) });
  } catch (e) { send(res, e); }
});
const mainOnly = async (req: any) => { if ((await mainAdminId()) !== req.user.id) throw new Refuse(403, 'Only the main admin can review changes and put them back.'); };
setup.post('/plugin/setup/revert', requireRole('admin'), async (req, res) => {
  try {
    await mainOnly(req); const b = z.object({ change_set: z.number().int().positive(), even_if_changed_since: z.boolean().optional() }).parse(req.body);
    try { const r = await revert(b.change_set, req.user!.id, !!b.even_if_changed_since); res.json({ ok: true, put_back: true, kind: r.entity, item: r.name, change_set: r.id }); }
    catch (e: any) {
      if (e instanceof ChangedSince) throw new Refuse(409, 'This item was changed again after that change. Putting it back would also undo what came later. Show the person what would be undone; only with their yes, call again with even_if_changed_since.', { would_also_undo: e.changes });
      if (e?.status) throw new Refuse(e.status, e.message); throw e;
    }
  } catch (e) { send(res, e); }
});
setup.post('/plugin/setup/seen', requireRole('admin'), async (req, res) => {
  try {
    await mainOnly(req); const b = z.object({ change_set: z.number().int().positive().optional(), all: z.boolean().optional() }).parse(req.body);
    if (!b.change_set && !b.all) throw new Refuse(400, 'Give a change_set, or all: true.');
    const r = b.all ? await exec('UPDATE change_sets SET needs_review=0, reviewed_by=?, reviewed_at=NOW() WHERE needs_review=1', [req.user!.id])
      : await exec('UPDATE change_sets SET needs_review=0, reviewed_by=?, reviewed_at=NOW() WHERE id=? AND needs_review=1', [req.user!.id, b.change_set]);
    res.json({ ok: true, marked_seen: r.affectedRows });
  } catch (e) { send(res, e); }
});
