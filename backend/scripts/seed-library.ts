// Seeds categories, tags, projects (with their tags), rule codes and Upwork profiles from seed/library.json.
// Insert-if-missing only: re-running never overwrites edits made through the app.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';
import { exec, pool, query } from '../src/db';

const G17 = '17. The work requires breaking platform rules, such as fake or multiple social accounts.';

(async () => {
  const lib = JSON.parse(readFileSync(join(appRoot, 'seed', 'library.json'), 'utf8'));
  const n = { cat: 0, tag: 0, proj: 0, link: 0, rule: 0, prof: 0 };

  for (const c of lib.categories) n.cat += (await exec('INSERT IGNORE INTO tag_categories (name, sort_order) VALUES (?,?)', [c.name, c.sort])).affectedRows;
  const cats = new Map((await query<any>('SELECT id, name FROM tag_categories')).map((r) => [r.name, r.id]));
  for (const t of lib.tags) {
    n.tag += (await exec('INSERT IGNORE INTO tags (category_id, name, weight, description, sort_order) VALUES (?,?,?,?,?)',
      [cats.get(t.category), t.name, t.weight, t.description, t.sort])).affectedRows;
  }
  const tagId = new Map((await query<any>('SELECT t.id, t.name FROM tags t')).map((r) => [r.name.toLowerCase(), r.id]));

  for (const p of lib.projects) {
    const r = await exec('INSERT IGNORE INTO projects (name, live_link, showable_publicly) VALUES (?,?,?)', [p.name, p.live_link, p.showable]);
    if (!r.affectedRows) continue; // already there: leave its tags alone
    n.proj++;
    for (const t of p.tags) {
      const id = tagId.get(t.toLowerCase());
      if (!id) throw new Error(`unknown tag ${t} on project ${p.name}`);
      n.link += (await exec('INSERT IGNORE INTO project_tags (project_id, tag_id) VALUES (?,?)', [r.insertId, id])).affectedRows;
    }
  }
  for (const r of lib.rules) n.rule += (await exec('INSERT IGNORE INTO rules (code, type, rule) VALUES (?,?,?)', [r.code, r.type, r.rule])).affectedRows;
  for (const name of lib.profiles) n.prof += (await exec('INSERT IGNORE INTO upwork_profiles (name) VALUES (?)', [name])).affectedRows;

  // Rule G17 is in the team's sheet but not in skill v1. Save it as an INACTIVE new version for an admin to review.
  const note = 'Adds flag 17 (platform rule breaking), matching rule code G17';
  const active = (await query<any>('SELECT content FROM skill_versions WHERE is_active=1 LIMIT 1'))[0];
  if (active && !active.content.includes(G17) && !(await query('SELECT id FROM skill_versions WHERE change_note=?', [note])).length) {
    const lines = active.content.split('\n');
    const i = lines.findIndex((l: string) => /^16\. /.test(l));
    if (i >= 0) {
      lines.splice(i + 1, 0, G17);
      const next = (await query<any>('SELECT COALESCE(MAX(version),0)+1 AS v FROM skill_versions'))[0].v;
      await exec('INSERT INTO skill_versions (version, content, change_note, is_active) VALUES (?,?,?,0)', [next, lines.join('\n'), note]);
      console.log(`saved inactive skill v${next} with flag 17`);
    }
  }
  console.log('added:', n);
  await pool.end();
})().catch((e) => { console.error('seed-library failed:', e.message); process.exit(1); });
