import type { SheetIO, TabMeta } from '../src/sheets/google';

/** An in-memory spreadsheet with the same calls as Google's, for tests: grids of strings, row and column inserts and deletes. */
export class FakeSheet implements SheetIO {
  tabsData = new Map<string, { id: number; g: string[][]; rows: number }>();
  calls: string[] = [];
  constructor(tabs: Record<string, string[][]>) { let i = 0; for (const [t, g] of Object.entries(tabs)) this.tabsData.set(t, { id: ++i, g: g.map((r) => [...r]), rows: Math.max(g.length, 100) }); }
  private byId(id: number) { for (const [t, v] of this.tabsData) if (v.id === id) return { t, v }; throw new Error('no sheet ' + id); }
  async tabs(): Promise<TabMeta[]> { return [...this.tabsData].map(([title, v]) => ({ title, sheetId: v.id, rows: v.rows, cols: 200 })); }
  async grid(tab: string): Promise<string[][]> {
    const g = this.tabsData.get(tab)!.g; let last = g.length - 1; while (last >= 0 && g[last].every((c) => !c)) last--;
    const rows = g.slice(0, last + 1); const w = Math.max(0, ...rows.map((r) => { let n = r.length; while (n > 0 && !r[n - 1]) n--; return n; }));
    return rows.map((r) => Array.from({ length: w }, (_, i) => r[i] ?? ''));
  }
  async structure(reqs: any[]) {
    for (const q of reqs) {
      const k = Object.keys(q)[0]; this.calls.push(k);
      if (k === 'addSheet') this.tabsData.set(q.addSheet.properties.title, { id: this.tabsData.size + 1, g: [], rows: 100 });
      else if (k === 'appendDimension') this.byId(q.appendDimension.sheetId).v.rows += q.appendDimension.length;
      else {
        const { sheetId, dimension, startIndex, endIndex } = q[k].range; const { v } = this.byId(sheetId); const n = endIndex - startIndex;
        if (dimension === 'ROWS') { while (v.g.length < startIndex) v.g.push([]); if (k === 'insertDimension') v.g.splice(startIndex, 0, ...Array.from({ length: n }, () => [])); else v.g.splice(startIndex, n); }
        else for (const r of v.g) { while (r.length < startIndex) r.push(''); if (k === 'insertDimension') r.splice(startIndex, 0, ...Array(n).fill('')); else r.splice(startIndex, n); }
      }
    }
  }
  async write(cells: { tab: string; row: number; col: number; value: string }[]) {
    for (const c of cells) {
      const v = this.tabsData.get(c.tab)!; if (c.row >= v.rows) throw new Error(`row ${c.row} is beyond the grid (${v.rows})`);
      while (v.g.length <= c.row) v.g.push([]); const r = v.g[c.row]; while (r.length <= c.col) r.push(''); r[c.col] = c.value;
    }
  }
}
