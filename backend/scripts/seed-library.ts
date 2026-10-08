// Seeds categories, tags, projects (with their tags), rule codes and Upwork profiles from seed/library.json.
// Insert-if-missing only: re-running never overwrites edits made through the app (a rule's details are only filled when empty).
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';
import { exec, pool, query } from '../src/db';

(async () => {
  const lib = JSON.parse(readFileSync(join(appRoot, 'seed', 'library.json'), 'utf8'));
  const n = { cat: 0, tag: 0, proj: 0, link: 0, rule: 0, details: 0, prof: 0 };

  // the sheet's compliance category is flagged on insert; after that the flag belongs to the app (Tag dictionary, Categories)
  for (const c of lib.categories) n.cat += (await exec('INSERT IGNORE INTO tag_categories (name, sort_order, is_compliance) VALUES (?,?,?)', [c.name, c.sort, c.name === 'Compliance / sensitive data' ? 1 : 0])).affectedRows;
  const cats = new Map((await query<any>('SELECT id, name FROM tag_categories')).map((r) => [r.name, r.id]));
  for (const t of lib.tags) {
    n.tag += (await exec('INSERT IGNORE INTO tags (category_id, name, weight, description, sort_order) VALUES (?,?,?,?,?)',
      [cats.get(t.category), t.name, t.weight, t.description, t.sort])).affectedRows;
  }
  const tagId = new Map((await query<any>('SELECT t.id, t.name FROM tags t')).map((r) => [r.name.toLowerCase(), r.id]));

  for (const p of lib.projects) {
    const r = await exec(`INSERT IGNORE INTO projects (name, live_link, showable_publicly, landing_link, system_link, mobile_link, staging_link, case_study_link, overview, case_study_summary)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [p.name, p.live_link, p.showable, p.landing_link ?? null, p.system_link ?? null, p.mobile_link ?? null, p.staging_link ?? null, p.case_study_link ?? null, p.overview ?? null, p.case_study_summary ?? null]);
    if (!r.affectedRows) continue; // already there: leave its tags alone
    n.proj++;
    for (const t of p.tags) {
      const id = tagId.get(t.toLowerCase());
      if (!id) throw new Error(`unknown tag ${t} on project ${p.name}`);
      n.link += (await exec('INSERT IGNORE INTO project_tags (project_id, tag_id) VALUES (?,?)', [r.insertId, id])).affectedRows;
    }
  }
  for (const r of lib.rules) {
    n.rule += (await exec('INSERT IGNORE INTO rules (code, type, rule, details) VALUES (?,?,?,?)', [r.code, r.type, r.rule, r.details ?? null])).affectedRows;
    if (r.details) n.details += (await exec("UPDATE rules SET details=? WHERE code=? AND (details IS NULL OR details='')", [r.details, r.code])).affectedRows;
  }
  // a profile is a name, or a record with the plugin's fields; only a missing profile is inserted
  for (const x of lib.profiles) {
    const f = typeof x === 'string' ? { name: x } : x;
    const keys = Object.keys(f).filter((k) => f[k] != null && f[k] !== '');
    n.prof += (await exec(`INSERT IGNORE INTO upwork_profiles (${keys.join(', ')}) VALUES (?)`, [keys.map((k) => f[k])])).affectedRows;
  }

  // Industries: created ONCE from the "Industry" tag category and each project's industry tags, then owned by the app
  // (so an industry deleted later does not come back when this script is run again).
  const marker = 'industries_seeded';
  if (!(await query('SELECT id FROM audit_log WHERE action=?', [marker])).length && !(await query('SELECT id FROM industries LIMIT 1')).length) {
    const ind = await exec(`INSERT IGNORE INTO industries (name, description) SELECT t.name, t.description FROM tags t JOIN tag_categories c ON c.id=t.category_id WHERE c.name='Industry' ORDER BY t.sort_order`);
    const map = await exec(`INSERT IGNORE INTO project_industries (project_id, industry_id)
      SELECT pt.project_id, i.id FROM project_tags pt JOIN tags t ON t.id=pt.tag_id JOIN tag_categories c ON c.id=t.category_id AND c.name='Industry'
      JOIN industries i ON i.name=t.name`);
    await exec('INSERT INTO audit_log (user_id, action, detail) VALUES (NULL, ?, ?)', [marker, `industries=${ind.affectedRows} links=${map.affectedRows}`]);
    console.log(`industries seeded: ${ind.affectedRows}, project links: ${map.affectedRows}`);
  }

  // The gate prompt used to hold the FAIL and FLAG lists itself. Now the rules come from the Rules page and are added to the
  // gate instructions for every job, so an install still running a prompt with its own rule lists gets the instructions-only
  // version once, made active (the older versions stay in the history and can be activated again).
  const note = 'Gate instructions only: the FAIL and FLAG rules now come from the Rules page';
  const active = (await query<any>('SELECT content FROM skill_versions WHERE is_active=1 LIMIT 1'))[0];
  if (active && /^###\s+(FAIL|FLAG)\b/m.test(active.content) && !(await query('SELECT id FROM skill_versions WHERE change_note=?', [note])).length) {
    const content = readFileSync(join(appRoot, 'seed', 'gate-instructions.md'), 'utf8');
    const next = (await query<any>('SELECT COALESCE(MAX(version),0)+1 AS v FROM skill_versions'))[0].v;
    const r = await exec('INSERT INTO skill_versions (version, content, change_note, is_active) VALUES (?,?,?,0)', [next, content, note]);
    await exec('UPDATE skill_versions SET is_active = (id=?)', [r.insertId]);
    await exec('INSERT INTO audit_log (user_id, action, detail) VALUES (NULL, ?, ?)', ['skill_activate', `version=${next} gate instructions without rule lists`]);
    console.log(`gate instructions v${next} saved and active (rules now come from the Rules page)`);
  }
  console.log('added:', n);
  await pool.end();
})().catch((e) => { console.error('seed-library failed:', e.message); process.exit(1); });
