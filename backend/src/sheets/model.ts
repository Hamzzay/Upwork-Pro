import type { SheetIO } from './google';
import { norm, type Rec, type SideChanges } from './merge';

/**
 * How the sheet "Stackup Project Tag Library" is laid out, and how records are read from it and written back.
 * Columns are always found by their header text, never by position, since the team adds columns.
 *
 * Project Tagging: row 1 holds category names over the tag columns plus single column headers (Project name, links, overview...),
 *   row 2 the tag names, row 3 an instruction line, projects from row 4. A tag is true when its cell is "x".
 * Tag Dictionary: one row per tag: Category, Tag, (job counts), Match weight, What it means.
 * Profiles: one row per Upwork profile, created by the sync when it does not exist yet.
 * Only cells the sync owns are written; other columns (counts, formulas, notes) are left alone.
 */
export const TABS = { projects: 'Project Tagging', tags: 'Tag Dictionary', profiles: 'Profiles' };

export const PROJECT_COLS: [string, string][] = [['Project name', 'name'], ['Landing Page Link', 'landing_link'], ['System link', 'system_link'], ['Staging Link', 'staging_link'],
  ['Mobile Link', 'mobile_link'], ['Showable publicly', 'showable'], ['Project overview', 'overview'], ['Case study link', 'case_study_link'], ['Case study summary', 'case_study_summary']];
export const TAG_COLS: [string, string][] = [['Category', 'category'], ['Tag', 'name'], ['Match weight', 'weight'], ['What it means', 'description']];
export const PROFILE_COLS: [string, string][] = [['Name', 'name'], ['Active', 'active'], ['Upwork profile link', 'profile_url'], ['Headline', 'tagline'], ['Default hourly rate', 'price'],
  ['Lowest rate', 'lowest_price'], ['GitHub', 'github_url'], ['GitLab', 'gitlab_account'], ['Services', 'services'], ['Industries to lead with', 'industries'], ['Voice', 'voice'],
  ['Signature', 'signature'], ['Upwork stats allowed', 'stats_allowed'], ['Who submits', 'submitted_by'], ['Rules', 'rules'], ['Notes', 'notes']];
const FIRST_PROJECT_ROW = 3;

export const keyOf = (name: string) => name.trim().toLowerCase();
const headerIndex = (row: string[], cols: [string, string][]) => {
  const m = new Map<string, number>();
  row.forEach((h, i) => { const hit = cols.find(([t]) => t.toLowerCase() === h.trim().toLowerCase()); if (hit && !m.has(hit[1])) m.set(hit[1], i); });
  return m;
};

/** The Project Tagging layout: where each field and each tag column is. */
export function projectLayout(g: string[][]) {
  const r0 = g[0] ?? [], r1 = g[1] ?? [];
  const fields = headerIndex(r0.map((h, i) => (r1[i] ? '' : h)), PROJECT_COLS); // a single column has a row 1 header and no tag name
  const tags = new Map<string, { col: number; name: string; category: string }>();
  let cat = '';
  for (let i = 0; i < Math.max(r0.length, r1.length); i++) {
    if (r0[i]) cat = r1[i] ? r0[i].trim() : '';
    if (r1[i] && r1[i].trim() && cat) tags.set(keyOf(r1[i]), { col: i, name: r1[i].trim(), category: cat });
  }
  return { fields, tags };
}

export function readProjects(g: string[][]): Map<string, Rec> {
  const { fields, tags } = projectLayout(g), out = new Map<string, Rec>();
  const nameCol = fields.get('name') ?? 0;
  for (let r = FIRST_PROJECT_ROW; r < g.length; r++) {
    const name = (g[r][nameCol] ?? '').trim(); if (!name) continue;
    const rec: Rec = {};
    for (const [, f] of PROJECT_COLS) rec[f] = fields.has(f) ? norm(g[r][fields.get(f)!] ?? '') : null;
    rec.name = name;
    rec.tags = [...tags.values()].filter((t) => (g[r][t.col] ?? '').trim().toLowerCase() === 'x').map((t) => t.name);
    out.set(keyOf(name), rec);
  }
  return out;
}

/** Tags from the Tag Dictionary, plus any tag column in Project Tagging the dictionary does not list yet. */
export function readTags(dict: string[][], proj: string[][]): Map<string, Rec> {
  const out = new Map<string, Rec>();
  const h = headerIndex(dict[0] ?? [], TAG_COLS);
  for (let r = 1; r < dict.length; r++) {
    const name = (dict[r][h.get('name') ?? 1] ?? '').trim(), category = (dict[r][h.get('category') ?? 0] ?? '').trim();
    if (!name || !category) continue;
    out.set(keyOf(name), { name, category, weight: norm(dict[r][h.get('weight') ?? -1] ?? ''), description: norm(dict[r][h.get('description') ?? -1] ?? '') });
  }
  for (const [k, t] of projectLayout(proj).tags) if (!out.has(k)) out.set(k, { name: t.name, category: t.category, weight: null, description: null });
  return out;
}

export function readProfiles(g: string[][]): Map<string, Rec> {
  const out = new Map<string, Rec>(), h = headerIndex(g[0] ?? [], PROFILE_COLS);
  if (!h.has('name')) return out;
  for (let r = 1; r < g.length; r++) {
    const name = (g[r][h.get('name')!] ?? '').trim(); if (!name) continue;
    const rec: Rec = {};
    for (const [, f] of PROFILE_COLS) rec[f] = h.has(f) ? norm(g[r][h.get(f)!] ?? '') : null;
    rec.name = name;
    rec.active = /^(no|false|0|disabled)$/i.test(String(rec.active ?? '')) ? 'No' : 'Yes';
    out.set(keyOf(name), rec);
  }
  return out;
}

const cell = (v: unknown) => (v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v));
const lastRow = (g: string[][], col: number, from: number) => { let last = from - 1; for (let r = from; r < g.length; r++) if ((g[r][col] ?? '').trim()) last = r; return last; };

/**
 * Applies the merge's changes to the sheet. Structure first (one change at a time, re-reading the tab after each, since rows and
 * columns move), then plain cell writes. `full` holds the complete merged record of every created or updated key.
 */
export async function applyToSheet(io: SheetIO, ch: { tags: SideChanges; projects: SideChanges; profiles: SideChanges }, full: { tags: Map<string, Rec>; projects: Map<string, Rec>; profiles: Map<string, Rec> }) {
  const tabs = await io.tabs();
  const id = async (title: string) => (await io.tabs()).find((t) => t.title === title)?.sheetId;
  const ensureRows = async (title: string, need: number) => {
    const t = (await io.tabs()).find((x) => x.title === title)!;
    if (need > t.rows) await io.structure([{ appendDimension: { sheetId: t.sheetId, dimension: 'ROWS', length: need - t.rows + 20 } }]);
  };
  const writes: { tab: string; row: number; col: number; value: string }[] = [];

  // ---- tags: a new tag gets a dictionary row (inside its category) and a column (at the end of its category group)
  for (const { key, rec } of ch.tags.create) {
    let dict = await io.grid(TABS.tags); const h = headerIndex(dict[0] ?? [], TAG_COLS);
    const catCol = h.get('category') ?? 0, tagCol = h.get('name') ?? 1;
    let at = -1; for (let r = 1; r < dict.length; r++) if ((dict[r][catCol] ?? '').trim().toLowerCase() === String(rec.category).toLowerCase() && (dict[r][tagCol] ?? '').trim()) at = r;
    if (at < 0) at = lastRow(dict, tagCol, 1);
    await io.structure([{ insertDimension: { range: { sheetId: await id(TABS.tags), dimension: 'ROWS', startIndex: at + 1, endIndex: at + 2 }, inheritFromBefore: true } }]);
    for (const [, f] of TAG_COLS) if (h.has(f)) writes.push({ tab: TABS.tags, row: at + 1, col: h.get(f)!, value: cell(rec[f]) });
    await io.write(writes.splice(0));
    const proj = await io.grid(TABS.projects); const lay = projectLayout(proj);
    if (lay.tags.has(key)) continue;
    const group = [...lay.tags.values()].filter((t) => t.category.toLowerCase() === String(rec.category).toLowerCase());
    const after = group.length ? Math.max(...group.map((t) => t.col)) : Math.max(...[...lay.tags.values()].map((t) => t.col), 0);
    await io.structure([{ insertDimension: { range: { sheetId: await id(TABS.projects), dimension: 'COLUMNS', startIndex: after + 1, endIndex: after + 2 }, inheritFromBefore: true } }]);
    writes.push({ tab: TABS.projects, row: 1, col: after + 1, value: String(rec.name) });
    if (!group.length) writes.push({ tab: TABS.projects, row: 0, col: after + 1, value: String(rec.category) }); // a new category starts its own group
    await io.write(writes.splice(0));
  }
  for (const key of ch.tags.remove) {
    const dict = await io.grid(TABS.tags); const h = headerIndex(dict[0] ?? [], TAG_COLS);
    const r = dict.findIndex((row, i) => i > 0 && keyOf(row[h.get('name') ?? 1] ?? '') === key);
    if (r > 0) await io.structure([{ deleteDimension: { range: { sheetId: await id(TABS.tags), dimension: 'ROWS', startIndex: r, endIndex: r + 1 } } }]);
    const t = projectLayout(await io.grid(TABS.projects)).tags.get(key);
    if (t) await io.structure([{ deleteDimension: { range: { sheetId: await id(TABS.projects), dimension: 'COLUMNS', startIndex: t.col, endIndex: t.col + 1 } } }]);
  }
  if (ch.tags.update.length) {
    const dict = await io.grid(TABS.tags); const h = headerIndex(dict[0] ?? [], TAG_COLS);
    for (const { key, fields } of ch.tags.update) {
      const r = dict.findIndex((row, i) => i > 0 && keyOf(row[h.get('name') ?? 1] ?? '') === key);
      if (r < 0) continue;
      for (const [f, v] of Object.entries(fields)) if (h.has(f) && f !== 'name') writes.push({ tab: TABS.tags, row: r, col: h.get(f)!, value: cell(v) });
    }
  }

  // ---- projects: removed rows go (bottom first), then updates and new rows
  {
    let g = await io.grid(TABS.projects);
    const nameCol = projectLayout(g).fields.get('name') ?? 0;
    const rowsToDelete = ch.projects.remove.map((k) => g.findIndex((row, i) => i >= FIRST_PROJECT_ROW && keyOf(row[nameCol] ?? '') === k)).filter((r) => r >= FIRST_PROJECT_ROW).sort((a, b) => b - a);
    const sid = await id(TABS.projects);
    for (const r of rowsToDelete) await io.structure([{ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: r, endIndex: r + 1 } } }]);
    if (rowsToDelete.length) g = await io.grid(TABS.projects);
    const lay = projectLayout(g);
    const put = (row: number, rec: Rec, only?: string[]) => {
      for (const [, f] of PROJECT_COLS) if (lay.fields.has(f) && (!only || only.includes(f))) writes.push({ tab: TABS.projects, row, col: lay.fields.get(f)!, value: cell(rec[f]) });
      if (!only || only.includes('tags')) {
        const want = new Set(((rec.tags as string[]) ?? []).map(keyOf));
        for (const [k, t] of lay.tags) { const has = (g[row]?.[t.col] ?? '').trim().toLowerCase() === 'x'; if (has !== want.has(k)) writes.push({ tab: TABS.projects, row, col: t.col, value: want.has(k) ? 'x' : '' }); }
      }
    };
    for (const { key, fields } of ch.projects.update) {
      const r = g.findIndex((row, i) => i >= FIRST_PROJECT_ROW && keyOf(row[lay.fields.get('name') ?? 0] ?? '') === key);
      if (r >= 0) put(r, { ...full.projects.get(key)!, ...fields }, Object.keys(fields));
    }
    let next = Math.max(lastRow(g, lay.fields.get('name') ?? 0, FIRST_PROJECT_ROW), FIRST_PROJECT_ROW - 1) + 1;
    if (ch.projects.create.length) await ensureRows(TABS.projects, next + ch.projects.create.length);
    for (const { key } of ch.projects.create) { put(next, full.projects.get(key)!); next++; }
  }

  // ---- profiles: the tab and any missing header are added first
  {
    if (!tabs.some((t) => t.title === TABS.profiles)) await io.structure([{ addSheet: { properties: { title: TABS.profiles, gridProperties: { frozenRowCount: 1 } } } }]);
    let g = await io.grid(TABS.profiles);
    const header = g[0] ?? [];
    const missing = PROFILE_COLS.filter(([t]) => !header.some((x) => x.trim().toLowerCase() === t.toLowerCase()));
    missing.forEach(([t], i) => writes.push({ tab: TABS.profiles, row: 0, col: header.length + i, value: t }));
    if (writes.length) { await io.write(writes.filter((w) => w.tab === TABS.profiles)); writes.splice(0, writes.length, ...writes.filter((w) => w.tab !== TABS.profiles)); g = await io.grid(TABS.profiles); }
    const h = headerIndex(g[0] ?? [], PROFILE_COLS), nameCol = h.get('name')!;
    const sid = await id(TABS.profiles);
    const del = ch.profiles.remove.map((k) => g.findIndex((row, i) => i > 0 && keyOf(row[nameCol] ?? '') === k)).filter((r) => r > 0).sort((a, b) => b - a);
    for (const r of del) await io.structure([{ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: r, endIndex: r + 1 } } }]);
    if (del.length) g = await io.grid(TABS.profiles);
    const put = (row: number, rec: Rec, only?: string[]) => { for (const [, f] of PROFILE_COLS) if (h.has(f) && (!only || only.includes(f))) writes.push({ tab: TABS.profiles, row, col: h.get(f)!, value: cell(rec[f]) }); };
    for (const { key, fields } of ch.profiles.update) {
      const r = g.findIndex((row, i) => i > 0 && keyOf(row[nameCol] ?? '') === key);
      if (r > 0) put(r, fields, Object.keys(fields));
    }
    let next = lastRow(g, nameCol, 1) + 1;
    if (ch.profiles.create.length) await ensureRows(TABS.profiles, next + ch.profiles.create.length);
    for (const { key } of ch.profiles.create) { put(next, full.profiles.get(key)!); next++; }
  }
  await io.write(writes);
}
