// One time, on a database from before R25: the team plugin's proposal work (v0.2.7) into Upwork Pro. Safe to run again.
// - signals: "Rescue / extend" becomes "Rescue / takeover"; new values Extend existing product and Rebuild / migration; new signals
//   20 Platform, 21 Job focus, 22 Decisions left open (from seed/signals.json, added when missing)
// - the eight proposal types (seed/templates.json): types 1 to 6 updated, 7 and 8 added, each with its selection rules (required,
//   supporting, excluded), priority and the default type
// - the writing guide (seed/writing/*.md): rules, banned phrases, modules, screening answers, checklist and type selection, saved as a
//   new version when the text differs (the old text stays in the versions)
// - rules F6 (generic mass invite) and G18 (any other risk), added when missing
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';
import { audit, exec, pool, query } from '../src/db';
import { sanitizeRich } from '../src/html';

const seed = (f: string) => JSON.parse(readFileSync(join(appRoot, 'seed', f), 'utf8'));
const KINDS: Record<string, [string, number]> = { 'writing-rules': ['rules', 10], 'banned-phrases': ['banned', 20], modules: ['modules', 30], 'screening-answers': ['screening', 40], 'verification-checklist': ['checklist', 50], 'type-selection': ['selection', 60] };
(async () => {
  const n = { values: 0, signals: 0, types: 0, mappings: 0, docs: 0, rules: 0 };
  // signals
  const s3 = (await query<any>('SELECT id FROM signals WHERE number=3'))[0];
  if (s3) n.values += (await exec("UPDATE signal_values SET name='Rescue / takeover' WHERE signal_id=? AND name='Rescue / extend'", [s3.id])).affectedRows;
  const sig = seed('signals.json');
  const layers = new Map<string, number>((await query<any>('SELECT id, code FROM signal_layers')).map((r) => [r.code, r.id]));
  for (const s of sig.signals) n.signals += (await exec('INSERT IGNORE INTO signals (number, layer_id, name, decides, multi_select, notes) VALUES (?,?,?,?,?,?)', [s.number, layers.get(s.layer), s.name, s.decides || null, s.multi_select ? 1 : 0, s.notes])).affectedRows;
  const sigId = new Map<number, number>((await query<any>('SELECT id, number FROM signals')).map((r) => [r.number, r.id]));
  for (const s of sig.signals) {
    let i = 0;
    for (const v of s.values) {
      const sid = sigId.get(s.number)!;
      const cur = (await query<any>('SELECT id FROM signal_values WHERE signal_id=? AND name=?', [sid, v.name]))[0];
      if (cur) await exec('UPDATE signal_values SET detect=?, move=?, is_fallback=?, sort_order=? WHERE id=?', [v.detect, v.move, v.is_fallback ? 1 : 0, i, cur.id]);
      else { await exec('INSERT INTO signal_values (signal_id, name, detect, move, is_fallback, sort_order) VALUES (?,?,?,?,?,?)', [sid, v.name, v.detect, v.move, v.is_fallback ? 1 : 0, i]); n.values++; }
      i++;
    }
  }
  // the eight types
  for (const t of seed('templates.json').templates) {
    let row = (await query<any>('SELECT id FROM templates WHERE name=?', [t.name]))[0];
    if (row) await exec('UPDATE templates SET description=?, body_html=?, priority=?, is_default=?, active=1 WHERE id=?', [t.description, sanitizeRich(t.body_html), t.priority, t.is_default ? 1 : 0, row.id]);
    else row = { id: (await exec('INSERT INTO templates (name, description, body_html, prompt, priority, is_default) VALUES (?,?,?,?,?,?)', [t.name, t.description, sanitizeRich(t.body_html), null, t.priority, t.is_default ? 1 : 0])).insertId };
    n.types++;
    await exec('DELETE FROM template_signals WHERE template_id=?', [row.id]);
    for (const [code, valueName, weight, role = 'weight', group = null] of t.signals) {
      const number = Number(String(code).replace(/^S/, ''));
      const v = (await query<any>('SELECT v.id FROM signal_values v JOIN signals s ON s.id=v.signal_id WHERE s.number=? AND v.name=?', [number, valueName]))[0];
      if (!v) throw new Error(`${t.name}: no value "${valueName}" on signal ${number}`);
      n.mappings += (await exec(`INSERT INTO template_signals (template_id, signal_id, value_id, weight, role, req_group, source) VALUES (?,?,?,?,?,?, 'starter')`,
        [row.id, sigId.get(number), v.id, weight ?? 0, role, role === 'required' ? group ?? 1 : null])).affectedRows;
    }
  }
  // the writing guide
  const dir = join(appRoot, 'seed', 'writing');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const key = f.replace(/\.md$/, ''), content = readFileSync(join(dir, f), 'utf8');
    const [kind, sort] = KINDS[key] ?? ['rules', 90];
    const title = (/^#\s+(.+)$/m.exec(content)?.[1] ?? key).trim();
    const cur = (await query<any>('SELECT id, content FROM writing_docs WHERE doc_key=?', [key]))[0];
    if (!cur) {
      const r = await exec('INSERT INTO writing_docs (doc_key, kind, title, sort_order, content) VALUES (?,?,?,?,?)', [key, kind, title, sort, content]);
      await exec('INSERT INTO writing_doc_versions (doc_id, content, note) VALUES (?,?,?)', [r.insertId, content, 'From the team plugin v0.2.7']); n.docs++;
    } else if (cur.content.trim() !== content.trim()) {
      await exec('UPDATE writing_docs SET content=?, title=? WHERE id=?', [content, title, cur.id]);
      await exec('INSERT INTO writing_doc_versions (doc_id, content, note) VALUES (?,?,?)', [cur.id, content, 'From the team plugin v0.2.7']); n.docs++;
    }
  }
  // rules
  for (const r of seed('library.json').rules.filter((x: any) => ['F6', 'G18'].includes(x.code))) n.rules += (await exec('INSERT IGNORE INTO rules (code, type, rule, details) VALUES (?,?,?,?)', [r.code, r.type, r.rule, r.details ?? null])).affectedRows;
  console.log('upgraded:', n);
  await audit(null, 'guide_upgrade', JSON.stringify(n));
  await pool.end();
})().catch(async (e) => { console.error('upgrade-guide failed:', e.message); await pool.end(); process.exit(1); });
