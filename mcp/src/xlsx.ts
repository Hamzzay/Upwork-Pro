import ExcelJS from 'exceljs';
import { existsSync, realpathSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

/** Reads one sheet of a local workbook into the {headers, rows} shape the import API takes. Only used by the local (stdio) server. */
const val = (v: any): any =>
  v && v.richText ? v.richText.map((t: any) => t.text).join('') : v && typeof v === 'object' && 'result' in v ? v.result : v && v.text ? v.text : v instanceof Date ? v.toISOString().slice(0, 10) : v;
const str = (v: any): string => String(val(v) ?? '').replace(/\s+/g, ' ').trim();

/** The sheet's own names for what the importer calls a type. */
export const SHEET_TYPES: Record<string, string> = { 'tag dictionary': 'tag_dictionary', 'project tagging': 'projects', 'rule codes': 'rules' };

export function safePath(dir: string | undefined, file: string): string {
  if (!dir) throw new Error('Reading files is off. Set IMPORT_DIR to the folder that holds your workbooks, then restart the MCP');
  const root = realpathSync(resolve(dir));
  const full = resolve(root, file);
  if (!existsSync(full)) throw new Error(`No such file in the import folder: ${file}`);
  const real = realpathSync(full);
  if (real !== root && !real.startsWith(root + sep)) throw new Error('That file is outside the import folder');
  if (extname(real).toLowerCase() !== '.xlsx') throw new Error('Only .xlsx files can be read');
  return real;
}

export async function sheetNames(path: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path);
  return wb.worksheets.map((w) => w.name);
}

export async function readSheet(path: string, sheet: string): Promise<{ headers: string[]; rows: string[][]; type?: string; skipped: string[] }> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet(sheet);
  if (!ws) throw new Error(`No sheet called "${sheet}". Sheets: ${wb.worksheets.map((w) => w.name).join(', ')}`);
  const type = SHEET_TYPES[sheet.trim().toLowerCase()];
  const skipped: string[] = [];

  if (type === 'projects' && ws.getRow(2).cellCount > 8) { // the X-mark matrix: row 2 holds tag names, a marked cell means the project has that tag
    const cols: { col: number; name: string }[] = [];
    for (let c = 5; c <= ws.columnCount; c++) { const n = str(ws.getRow(2).getCell(c).value); if (n) cols.push({ col: c, name: n }); }
    const rows: string[][] = [];
    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r); const name = str(row.getCell(1).value);
      if (!name) continue;
      if (/\(example\)/i.test(name)) { skipped.push(`row ${r}: ${name}`); continue; }
      rows.push([name, str(row.getCell(2).value), str(row.getCell(3).value), cols.filter((c) => /^x$/i.test(str(row.getCell(c.col).value))).map((c) => c.name).join('; ')]);
    }
    return { headers: ['Project name', 'Live link', 'Showable publicly', 'Tag list'], rows, type, skipped };
  }

  // an ordinary table: the first row with at least two filled cells is the header
  let h = 1; for (; h <= Math.min(6, ws.rowCount); h++) if (ws.getRow(h).actualCellCount >= 2) break;
  const headers: string[] = []; const width = ws.columnCount;
  for (let c = 1; c <= width; c++) headers.push(str(ws.getRow(h).getCell(c).value));
  const rows: string[][] = [];
  for (let r = h + 1; r <= ws.rowCount; r++) {
    const cells = headers.map((_, i) => str(ws.getRow(r).getCell(i + 1).value));
    if (cells.filter(Boolean).length < 2) { if (cells.some(Boolean)) skipped.push(`row ${r}: a single cell, treated as a note`); continue; }
    rows.push(cells);
  }
  return { headers, rows, type, skipped };
}
