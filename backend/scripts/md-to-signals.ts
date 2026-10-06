// Dev-only: turns the three detection guides into seed/signals.json (committed). Deploys never parse markdown.
// Usage: npx ts-node scripts/md-to-signals.ts <layer1.md> <layer2.md> <layer3.md> [output.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';

interface Val { name: string; detect: string | null; move: string | null; is_fallback: boolean }
interface Sig { number: number; layer: string; name: string; decides: string; multi_select: boolean; has_fallback: boolean; values: Val[]; notes: string | null }

const LAYERS = [
  { code: 'structural', name: 'Layer 1: Structural signals' },
  { code: 'domain', name: 'Layer 2: Domain and capability signals' },
  { code: 'hidden', name: 'Layer 3: Hidden signals' },
];
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const unmd = (s: string) => clean(s.replace(/\*\*/g, '').replace(/(^|[^*])\*([^*]+)\*/g, '$1$2'));
const ACRONYMS = new Set(['MVP', 'AI', 'HIPAA', 'ASAP']);
/** UPPER CASE names from the guides become readable: "GREENFIELD/MVP" -> "Greenfield / MVP", "PRICE vs VALUE ANCHOR" -> "Price vs value anchor". */
const title = (s: string) => {
  const m = /^([^(]*?)\s*(\(.*\))?\s*$/.exec(s.trim())!; const head = m[1]; const tail = m[2] ? ' ' + m[2] : '';
  const letters = head.replace(/[^A-Za-z]/g, '');
  if (!letters || head.replace(/[^A-Z]/g, '').length / letters.length < 0.6) return head + tail;
  const lower = head.split(/(\s+|\/)/).map((w) => (w === '/' ? ' / ' : ACRONYMS.has(w) ? w : w.toLowerCase())).join('').replace(/\s+/g, ' ').trim();
  return lower.charAt(0).toUpperCase() + lower.slice(1) + tail;
};

function parseLayer(md: string, layer: string) {
  const intro = clean(/^###\s+(.*)$/m.exec(md)?.[1] ?? '');
  const important = /^IMPORTANT:\s*(.*)$/m.exec(md)?.[1] ?? '';
  const overall = /## OVERALL RULE\s*\n([\s\S]*?)$/m.exec(md)?.[1]?.trim() ?? '';
  const sections = md.split(/^## SIGNAL /m).slice(1).map((s) => s.split(/^## OVERALL RULE/m)[0]);
  const sigs: Sig[] = sections.map((sec) => {
    const lines = sec.split('\n');
    const head = /^(\d+)\s+[—-]\s+(.+)$/.exec(lines[0].trim());
    if (!head) throw new Error('bad signal heading: ' + lines[0]);
    const number = Number(head[1]);
    const name = title(head[2].replace(/\s*\(.*\)\s*$/, '').trim());
    const body = lines.slice(1);
    let decides = '', notes: string | null = null;
    const values: Val[] = [];
    let cur: Val | null = null;            // the value being filled
    let group: Val[] = [];                 // values that share one move (bullet lists in signals 6 and 7)
    let mode: 'none' | 'fallbackText' = 'none';
    const flushGroup = () => { group = []; };
    for (let i = 0; i < body.length; i++) {
      const raw = body[i], line = raw.trim();
      if (!line || line === '---') { if (mode === 'fallbackText' && !line) mode = 'none'; continue; }
      let m: RegExpExecArray | null;
      if ((m = /^\*\*Decides:\*\*\s*(.*)$/.exec(line))) { decides = unmd(m[1]); continue; }
      if (/^\(No fallback needed/.test(line)) { notes = unmd(line.replace(/^\(|\)$/g, '')); continue; }
      if ((m = /^\*\*FALLBACK\s*(?:\(([^)]*)\))?:\*\*\s*(.*)$/.exec(line))) {
        cur = { name: 'Fallback', detect: m[1] ? unmd(m[1]) : null, move: unmd(m[2]), is_fallback: true }; values.push(cur); flushGroup(); mode = 'fallbackText'; continue;
      }
      if ((m = /^\*\*Detect(?:\s*\(([^)]*)\))?:\*\*\s*(.*)$/.exec(line))) { // open-ended signals: a list of values or one open value
        flushGroup(); mode = 'none';
        if (m[2].trim()) { cur = { name: 'Named tools', detect: unmd(m[2]), move: null, is_fallback: false }; values.push(cur); group = [cur]; }
        else cur = null;
        if (m[1]) notes = unmd(m[1]);
        continue;
      }
      if ((m = /^\*\*(.+?)\s+[—-]\s+detect:\*\*\s*(.*)$/.exec(line))) {
        flushGroup(); mode = 'none';
        cur = { name: title(m[1].replace(/\*\*/g, '')), detect: unmd(m[2]), move: null, is_fallback: false }; values.push(cur); group = [cur]; continue;
      }
      if ((m = /^-\s+(?:\*)?Move:(?:\*)?\s*(.*)$/.exec(line)) || (m = /^\*Move:\*\s*(.*)$/.exec(line))) {
        const mv = unmd(m[1]); for (const v of group.length ? group : cur ? [cur] : []) v.move = mv; continue;
      }
      if (/^(6|7)$/.test(String(number)) && values.every((v) => !v.is_fallback) && (m = /^-\s+(?:\*\*)?([^:*(]+?)\s*(\([^)]*\))?(?:\*\*)?:(?:\*\*)?\s+(.+)$/.exec(line))) { // a bullet value, e.g. "- Voice: receptionist, phone"
        const v: Val = { name: unmd(m[1]), detect: unmd(m[3]) + (m[2] ? ' ' + unmd(m[2]) : ''), move: null, is_fallback: false }; values.push(v); group.push(v); continue;
      }
      if (mode === 'fallbackText' && cur) { cur.move = (cur.move + ' ' + unmd(line)).trim(); continue; } // fallback text running over several lines
      if (/^\*\*Detect/.test(line)) throw new Error(`signal ${number}: unparsed detect line: ${line}`);
      if (/^[#*-]/.test(line) && !/^\(/.test(line)) throw new Error(`signal ${number}: unparsed line: ${line}`);
    }
    // multi-select: the capability signal says "multi-select" in its heading, record-all-that-apply
    const multi = /multi-select/i.test(head[2]) || number === 7;
    return { number, layer, name, decides, multi_select: multi, has_fallback: values.some((v) => v.is_fallback), values, notes };
  });
  return { intro, important, overall, sigs };
}

(async () => {
  const [f1, f2, f3, out] = process.argv.slice(2);
  if (!f1 || !f2 || !f3) throw new Error('give the three detection guide files');
  const parsed = [parseLayer(readFileSync(f1, 'utf8'), 'structural'), parseLayer(readFileSync(f2, 'utf8'), 'domain'), parseLayer(readFileSync(f3, 'utf8'), 'hidden')];
  const sigs = parsed.flatMap((p) => p.sigs);

  // ---- hard checks, from reading the guides ----
  const expect: Record<number, [number, boolean]> = { 1: [3, true], 2: [3, true], 3: [2, true], 4: [2, true], 5: [2, false], 6: [8, true], 7: [5, true], 8: [1, true], 9: [2, true], 10: [1, true],
    11: [2, true], 12: [2, true], 13: [2, true], 14: [2, true], 15: [2, true], 16: [2, true] };
  const problems: string[] = [];
  if (sigs.length !== 16) problems.push(`expected 16 signals, got ${sigs.length}`);
  sigs.forEach((s, i) => { if (s.number !== i + 1) problems.push(`signal order: position ${i + 1} is signal ${s.number}`); });
  for (const s of sigs) {
    const [n, fb] = expect[s.number] ?? [0, false];
    const stated = s.values.filter((v) => !v.is_fallback);
    if (!s.decides && s.layer !== 'hidden') problems.push(`signal ${s.number}: no "Decides" text`); // the hidden-layer guide gives none
    if (stated.length !== n) problems.push(`signal ${s.number} (${s.name}): expected ${n} stated values, got ${stated.length} [${stated.map((v) => v.name).join(' | ')}]`);
    if (s.has_fallback !== fb) problems.push(`signal ${s.number}: fallback expected ${fb}`);
    for (const v of s.values) { if (!v.move) problems.push(`signal ${s.number} value "${v.name}": no move`); if (!v.is_fallback && !v.detect) problems.push(`signal ${s.number} value "${v.name}": no detect`); }
  }
  if (!sigs.find((s) => s.number === 7)?.multi_select) problems.push('signal 7 must be multi-select');
  if (sigs.filter((s) => s.multi_select).length !== 1) problems.push('only signal 7 should be multi-select');
  if (problems.length) { console.error('PROBLEMS:\n- ' + problems.join('\n- ')); process.exit(1); }

  const layers = LAYERS.map((l, i) => ({ ...l, sort: i, intro: parsed[i].intro + (parsed[i].important ? ' ' + parsed[i].important : ''), rule_note: parsed[i].overall || null }));
  writeFileSync(out ?? join(appRoot, 'seed', 'signals.json'), JSON.stringify({ layers, signals: sigs }, null, 1) + '\n');
  console.log('signals', sigs.length, '| values', sigs.reduce((n, s) => n + s.values.length, 0));
  for (const s of sigs) console.log(`  ${s.number}. ${s.name} [${s.layer}]${s.multi_select ? ' multi' : ''}: ${s.values.map((v) => (v.is_fallback ? 'FALLBACK' : v.name)).join(' | ')}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
