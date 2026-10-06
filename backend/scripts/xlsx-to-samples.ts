// Dev-only: turns the "Testing Sheet" of Upwork Details.xlsx into seed/proposal-samples.json (committed).
// Columns: Hamza = Upwork Proposal Writing System, Hassan = Stackup Proposal Architecture, Ahmad = Stackup Proposal Writing Framework SOP. Job Link names the job.
// Usage: npx ts-node scripts/xlsx-to-samples.ts "<Upwork Details .xlsx>" [output.json]
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';

const COLUMN_TEMPLATE: Record<string, string> = { Hamza: 'Upwork Proposal Writing System', Hassan: 'Stackup Proposal Architecture', Ahmad: 'Stackup Proposal Writing Framework SOP' };
const OPENING: Record<string, RegExp> = { Hamza: /^(perfect|[A-Z][\w ]{1,30}[,.]|I have built)/i, Hassan: /^(understood|[A-Z][\w ]{1,30}[.,]|I have built)/i, Ahmad: /^(for your|[A-Z][\w ]{1,30}[,.]|I have built)/i };

/** The text of a cell, joining rich-text runs (so a link that sits in its own run is kept). */
function cellText(cell: ExcelJS.Cell): string {
  const v: any = cell.value;
  const parts = (x: any): string => {
    if (x === null || x === undefined) return '';
    if (typeof x === 'string') return x;
    if (x.richText) return x.richText.map((r: any) => r.text ?? '').join('');
    if (x.result !== undefined) return parts(x.result);
    if (x.text !== undefined) return parts(x.text);
    if (x.hyperlink) return String(x.hyperlink);
    return '';
  };
  return parts(v).replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

(async () => {
  const [file, out] = process.argv.slice(2);
  if (!file) throw new Error('give the Upwork Details .xlsx file');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('Testing Sheet'); if (!ws) throw new Error('no "Testing Sheet"');
  const header: Record<number, string> = {}; ws.getRow(1).eachCell((c, i) => { header[i] = cellText(c); });
  const authorCols = Object.entries(header).filter(([, h]) => COLUMN_TEMPLATE[h]).map(([i, h]) => ({ col: Number(i), author: h }));
  const linkCol = Number(Object.entries(header).find(([, h]) => h === 'Job Link')?.[0]);
  const kwCols = Object.entries(header).filter(([, h]) => /keywords/i.test(h)).map(([i]) => Number(i));
  const problems: string[] = [];
  if (authorCols.length !== 3 || !linkCol) problems.push('expected the columns Hamza, Hassan, Ahmad and Job Link; found: ' + JSON.stringify(header));
  const samples: any[] = []; const perCol: Record<string, number> = {}; let jobs = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const link = cellText(ws.getRow(r).getCell(linkCol));
    const kw = kwCols.map((c) => cellText(ws.getRow(r).getCell(c))).filter(Boolean).join(', ');
    const texts = authorCols.map((a) => ({ ...a, text: cellText(ws.getRow(r).getCell(a.col)) })).filter((t) => t.text);
    if (!link && !texts.length) continue;
    jobs++;
    if (!link) problems.push(`row ${r}: proposals without a job link`);
    for (const t of texts) {
      if (t.text.length < 300) problems.push(`row ${r} ${t.author}: only ${t.text.length} characters, probably a failed read: ${t.text.slice(0, 40)}`);
      if (/\[object Object\]/.test(t.text)) problems.push(`row ${r} ${t.author}: object text`);
      if (!OPENING[t.author].test(t.text)) problems.push(`row ${r} ${t.author}: unexpected opening: ${t.text.slice(0, 40)}`);
      perCol[t.author] = (perCol[t.author] ?? 0) + 1;
      const opening = t.text.split(/[.,\n]/)[0].slice(0, 60);
      samples.push({ template: COLUMN_TEMPLATE[t.author], author: t.author, job_url: /^https?:\/\//.test(link) ? link : null, job_keywords: kw || null, title: `${t.author}: ${opening}`, content: t.text });
    }
  }
  if (problems.length) { console.error('PROBLEMS:\n- ' + problems.join('\n- ')); process.exit(1); }
  writeFileSync(out ?? join(appRoot, 'seed', 'proposal-samples.json'), JSON.stringify(samples, null, 1) + '\n');
  console.log('jobs with samples:', jobs, '| samples:', samples.length, '| per author:', perCol);
  for (const s of samples) console.log(`  [${s.template}] ${s.job_url?.slice(-12)} ${s.content.length} chars | "${s.content.slice(0, 55).replace(/\n/g, ' ')}"`);
})().catch((e) => { console.error(e.message); process.exit(1); });
