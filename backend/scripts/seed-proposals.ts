// Seeds the detection signals, the six proposal types (templates, with a STARTER signal mapping) and the sample proposals.
// Insert-if-missing only: re-running never overwrites edits made in the app.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';
import { exec, pool, query } from '../src/db';
import { sanitizeRich } from '../src/html';

const load = (f: string) => JSON.parse(readFileSync(join(appRoot, 'seed', f), 'utf8'));

(async () => {
  const sig = load('signals.json'), tpl = load('templates.json'), samples = load('proposal-samples.json');
  const n = { layers: 0, signals: 0, values: 0, templates: 0, mappings: 0, samples: 0 };

  for (const l of sig.layers) n.layers += (await exec('INSERT IGNORE INTO signal_layers (code, name, sort_order, intro, rule_note) VALUES (?,?,?,?,?)', [l.code, l.name, l.sort, l.intro, l.rule_note])).affectedRows;
  const layers = new Map<string, number>((await query<any>('SELECT id, code FROM signal_layers')).map((r) => [r.code, r.id]));
  for (const s of sig.signals) {
    n.signals += (await exec('INSERT IGNORE INTO signals (number, layer_id, name, decides, multi_select, notes) VALUES (?,?,?,?,?,?)',
      [s.number, layers.get(s.layer), s.name, s.decides || null, s.multi_select ? 1 : 0, s.notes])).affectedRows;
  }
  const sigId = new Map<number, number>((await query<any>('SELECT id, number FROM signals')).map((r) => [r.number, r.id]));
  for (const s of sig.signals) {
    let i = 0;
    for (const v of s.values) {
      n.values += (await exec('INSERT IGNORE INTO signal_values (signal_id, name, detect, move, is_fallback, sort_order) VALUES (?,?,?,?,?,?)',
        [sigId.get(s.number), v.name, v.detect, v.move, v.is_fallback ? 1 : 0, i++])).affectedRows;
    }
  }

  for (const t of tpl.templates) {
    const r = await exec('INSERT IGNORE INTO templates (name, description, body_html, prompt, priority, is_default) VALUES (?,?,?,?,?,?)', [t.name, t.description, sanitizeRich(t.body_html), t.prompt || null, t.priority, t.is_default ? 1 : 0]);
    if (!r.affectedRows) continue; // already there: keep its edits and its mapping
    n.templates++;
    for (const [code, valueName, weight, role = 'weight', group = null] of t.signals) {
      const number = Number(String(code).replace(/^S/, ''));
      const v = (await query<any>('SELECT v.id FROM signal_values v JOIN signals s ON s.id=v.signal_id WHERE s.number=? AND v.name=?', [number, valueName]))[0];
      if (!v) throw new Error(`starter mapping for "${t.name}": no value "${valueName}" on signal ${number}`);
      n.mappings += (await exec(`INSERT IGNORE INTO template_signals (template_id, signal_id, value_id, weight, role, req_group, source) VALUES (?,?,?,?,?,?, 'starter')`,
        [r.insertId, sigId.get(number), v.id, weight ?? 0, role, role === 'required' ? group ?? 1 : null])).affectedRows;
    }
  }

  const tplId = new Map<string, number>((await query<any>('SELECT id, name FROM templates')).map((r) => [r.name, r.id]));
  for (const s of samples) {
    const tid = tplId.get(s.template);
    if (!tid) throw new Error('sample for an unknown template: ' + s.template);
    const exists = await query('SELECT id FROM template_samples WHERE template_id=? AND author=? AND job_url <=> ?', [tid, s.author, s.job_url]);
    if (exists.length) continue;
    await exec('INSERT INTO template_samples (template_id, title, author, job_url, job_keywords, content) VALUES (?,?,?,?,?,?)', [tid, s.title, s.author, s.job_url, s.job_keywords, s.content]);
    n.samples++;
  }
  console.log('added:', n);
  await pool.end();
})().catch((e) => { console.error('seed-proposals failed:', e.message); process.exit(1); });
