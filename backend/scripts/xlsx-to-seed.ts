// Dev-only: converts the two Stackup workbooks into seed/library.json (committed). Deploys never parse xlsx.
// Usage: npx ts-node scripts/xlsx-to-seed.ts "<tag workbook>" "<Upwork Jobs History.xlsx>" [output.json]
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';

const val = (v: any): any =>
  v && v.richText ? v.richText.map((t: any) => t.text).join('') : v && typeof v === 'object' && 'result' in v ? v.result : v && v.text ? v.text : v;
const str = (v: any): string => String(val(v) ?? '').replace(/\s+/g, ' ').trim();

(async () => {
  const [tagFile, jobsFile, outFile] = process.argv.slice(2);
  if (!tagFile || !jobsFile) throw new Error('give the tag workbook and the jobs history workbook');
  const problems: string[] = [];

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(tagFile);

  // ---- Tag Dictionary ----
  const td = wb.getWorksheet('Tag Dictionary')!;
  const categories: string[] = [];
  const tags: any[] = [];
  const dictByName = new Map<string, any>();
  for (let r = 2; r <= td.rowCount; r++) {
    const cat = str(td.getRow(r).getCell(1).value), name = str(td.getRow(r).getCell(2).value);
    if (!cat || !name) continue; // blank rows and the trailing note row
    const weight = Number(val(td.getRow(r).getCell(5).value));
    if (!Number.isFinite(weight)) { problems.push(`dictionary row ${r}: bad weight for ${name}`); continue; }
    if (!categories.includes(cat)) categories.push(cat);
    if (dictByName.has(name.toLowerCase())) problems.push(`duplicate dictionary tag ${name}`);
    const t = { category: cat, name, weight, description: str(td.getRow(r).getCell(6).value) || null, sort: tags.length };
    tags.push(t); dictByName.set(name.toLowerCase(), t);
  }

  // ---- Project Tagging ----
  const pt = wb.getWorksheet('Project Tagging')!;
  const FIRST_TAG_COL = 5;
  const cols: { col: number; name: string; headerCat: string }[] = [];
  let lastCat = '';
  for (let c = FIRST_TAG_COL; c <= pt.columnCount; c++) {
    const name = str(pt.getRow(2).getCell(c).value);
    if (!name) continue;
    const headerCat = str(pt.getRow(1).getCell(c).value);
    if (headerCat) lastCat = headerCat;
    cols.push({ col: c, name, headerCat: headerCat || lastCat });
  }
  // tags that are columns in the tagging sheet but missing from the dictionary
  const addedFromSheet: string[] = [];
  for (const c of cols) {
    if (dictByName.has(c.name.toLowerCase())) continue;
    const t = { category: c.headerCat, name: c.name, weight: 1, description: null, sort: tags.length };
    if (!categories.includes(c.headerCat)) { categories.push(c.headerCat); }
    tags.push(t); dictByName.set(c.name.toLowerCase(), t); addedFromSheet.push(`${c.name} (category "${c.headerCat}", weight 1)`);
  }
  // dictionary tags with no column
  for (const t of tags) if (!cols.some((c) => c.name.toLowerCase() === t.name.toLowerCase())) problems.push(`dictionary tag without a column: ${t.name}`);
  for (const c of cols) { const d = dictByName.get(c.name.toLowerCase()); if (d.category !== c.headerCat) problems.push(`category mismatch for ${c.name}: sheet "${c.headerCat}" vs dictionary "${d.category}"`); }

  const projects: any[] = [];
  const seen = new Set<string>();
  for (let r = 4; r <= pt.rowCount; r++) {
    const row = pt.getRow(r);
    const name = str(row.getCell(1).value);
    if (!name) continue;
    if (/\(example\)/i.test(name)) continue; // the worked example row
    if (seen.has(name.toLowerCase())) { problems.push(`duplicate project name (case-insensitive): ${name}`); continue; }
    seen.add(name.toLowerCase());
    const marked = cols.filter((c) => /^x$/i.test(str(row.getCell(c.col).value))).map((c) => c.name);
    const expected = Number(val(row.getCell(4).value));
    if (Number.isFinite(expected) && expected !== marked.length) problems.push(`project ${name}: ${marked.length} marks but the Tags column says ${expected}`);
    projects.push({ name, live_link: str(row.getCell(2).value) || null, showable: str(row.getCell(3).value) || null, tags: marked });
  }

  // ---- Rule Codes + profiles from the jobs history ----
  const jb = new ExcelJS.Workbook();
  await jb.xlsx.readFile(jobsFile);
  const rc = jb.getWorksheet('Rule Codes')!;
  const rules: any[] = [];
  for (let r = 2; r <= rc.rowCount; r++) {
    const code = str(rc.getRow(r).getCell(1).value);
    if (!code) continue;
    const type = str(rc.getRow(r).getCell(2).value).toLowerCase();
    if (type !== 'fail' && type !== 'flag') { problems.push(`rule ${code}: bad type ${type}`); continue; }
    rules.push({ code, type, rule: str(rc.getRow(r).getCell(3).value) });
  }
  const jl = jb.getWorksheet('Job Log')!;
  const profiles = new Set<string>();
  for (let r = 2; r <= jl.rowCount; r++) { const p = str(jl.getRow(r).getCell(2).value); if (p) profiles.add(p); }

  if (problems.length) { console.error('PROBLEMS:\n- ' + problems.join('\n- ')); process.exit(1); }
  const out = { categories: categories.map((name, i) => ({ name, sort: i })), tags, projects, rules, profiles: [...profiles] };
  writeFileSync(outFile ?? join(appRoot, 'seed', 'library.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`categories ${categories.length}, tags ${tags.length}, projects ${projects.length}, rules ${rules.length}, profiles ${[...profiles].join(', ')}`);
  console.log('tags added from the tagging sheet because the dictionary lacks them:', addedFromSheet.length ? addedFromSheet : 'none');
  console.log('project marks total', projects.reduce((n, p) => n + p.tags.length, 0), 'projects with zero tags', projects.filter((p) => !p.tags.length).map((p) => p.name));
})().catch((e) => { console.error(e); process.exit(1); });
