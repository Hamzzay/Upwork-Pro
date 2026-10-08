// Makes the project list and project tags match a library JSON (made by xlsx-to-seed.ts).
//   npx ts-node scripts/sync-library.ts [library.json]            dry run: prints the plan, changes nothing
//   npx ts-node scripts/sync-library.ts [library.json] --apply    applies it in one transaction
// - projects in the file: created if missing; their tags are set to exactly the file's tags
// - projects NOT in the file: deactivated, never deleted (they stop being used for matching; an admin can delete them in the app)
// - categories and tags missing from the database are added; existing tags keep their weight and wording (the app owns those)
// - each project's links, overview and case study are set from the file, and its industries match its Industry tags
//   (industries missing from the Industries page are created)
// - profiles in the file are created if missing; an existing profile only gets the fields that are still empty (the app owns edits)
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot } from '../src/config';
import { pool } from '../src/db';

(async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const lib = JSON.parse(readFileSync(args.find((a) => !a.startsWith('--')) ?? join(appRoot, 'seed', 'library.json'), 'utf8'));
  const q = async (sql: string, p: any[] = []) => (await pool.query(sql, p))[0] as any[];

  const cats = new Map<string, number>((await q('SELECT id, name FROM tag_categories')).map((r) => [r.name, r.id]));
  const tags = new Map<string, number>((await q('SELECT id, name FROM tags')).map((r) => [r.name.toLowerCase(), r.id]));
  const dbProjects = await q('SELECT id, name, active FROM projects');
  const industries = new Map<string, number>((await q('SELECT id, name FROM industries')).map((r) => [r.name.toLowerCase(), r.id]));
  const industryTags = new Set<string>(lib.tags.filter((t: any) => t.category === 'Industry').map((t: any) => t.name.toLowerCase()));
  const profiles = new Map<string, any>((await q('SELECT * FROM upwork_profiles')).map((r) => [r.name.toLowerCase(), r]));
  const fileProfiles: any[] = (lib.profiles ?? []).map((x: any) => (typeof x === 'string' ? { name: x } : x));
  const PROFILE_FIELDS = ['profile_url', 'tagline', 'price', 'lowest_price', 'github_url', 'services', 'industries', 'voice', 'signature', 'stats_allowed', 'submitted_by', 'rules', 'notes'];
  const profileFill = fileProfiles.filter((f) => profiles.has(f.name.toLowerCase())).map((f) => {
    const cur = profiles.get(f.name.toLowerCase());
    return { id: cur.id, name: f.name, set: PROFILE_FIELDS.filter((k) => f[k] != null && f[k] !== '' && (cur[k] == null || cur[k] === '')).map((k) => [k, f[k]]) };
  }).filter((x) => x.set.length);
  const profileCreate = fileProfiles.filter((f) => !profiles.has(f.name.toLowerCase()));
  const missingIndustries = lib.tags.filter((t: any) => t.category === 'Industry' && !industries.has(t.name.toLowerCase())).map((t: any) => t.name);
  const byName = new Map<string, any>(dbProjects.map((p) => [p.name.toLowerCase(), p]));
  const links = await q('SELECT pt.project_id, t.name FROM project_tags pt JOIN tags t ON t.id=pt.tag_id');
  const have = new Map<number, Set<string>>();
  for (const l of links) { if (!have.has(l.project_id)) have.set(l.project_id, new Set()); have.get(l.project_id)!.add(l.name); }

  const missingCats = lib.categories.filter((c: any) => !cats.has(c.name));
  const missingTags = lib.tags.filter((t: any) => !tags.has(t.name.toLowerCase()));
  const fileNames = new Set<string>(lib.projects.map((p: any) => p.name.toLowerCase()));
  const toCreate = lib.projects.filter((p: any) => !byName.has(p.name.toLowerCase()));
  const toDeactivate = dbProjects.filter((p) => !fileNames.has(p.name.toLowerCase()) && Number(p.active));
  const toReactivate = lib.projects.filter((p: any) => byName.has(p.name.toLowerCase()) && !Number(byName.get(p.name.toLowerCase()).active));
  const tagPlan = lib.projects.filter((p: any) => byName.has(p.name.toLowerCase())).map((p: any) => {
    const cur = have.get(byName.get(p.name.toLowerCase()).id) ?? new Set<string>();
    const want = new Set<string>(p.tags);
    return { name: p.name, add: [...want].filter((t) => !cur.has(t)).length, remove: [...cur].filter((t) => !want.has(t)).length, id: byName.get(p.name.toLowerCase()).id };
  }).filter((x: any) => x.add || x.remove);

  console.log(`file: ${lib.projects.length} projects, ${lib.tags.length} tags | database: ${dbProjects.length} projects`);
  console.log('categories to add:', missingCats.map((c: any) => c.name));
  console.log('tags to add:', missingTags.map((t: any) => t.name));
  console.log('projects to create:', toCreate.map((p: any) => p.name));
  console.log('projects to reactivate:', toReactivate.map((p: any) => p.name));
  console.log('projects to DEACTIVATE (not in the file):', toDeactivate.map((p) => p.name));
  console.log(`projects whose tags change: ${tagPlan.length}`); for (const t of tagPlan) console.log(`  ${t.name}: +${t.add} -${t.remove}`);
  console.log('industries to add:', missingIndustries);
  console.log('profiles to create:', profileCreate.map((p) => p.name));
  console.log('profiles to fill:', profileFill.map((p) => `${p.name} (${p.set.map(([k]) => k).join(', ')})`));
  if (!apply) { console.log('\nDry run only. Add --apply to make these changes.'); await pool.end(); return; }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const c of missingCats) { const [r]: any = await conn.query('INSERT INTO tag_categories (name, sort_order, is_compliance) VALUES (?,?,?)', [c.name, c.sort, c.name === 'Compliance / sensitive data' ? 1 : 0]); cats.set(c.name, r.insertId); }
    for (const t of missingTags) { const [r]: any = await conn.query('INSERT INTO tags (category_id, name, weight, description, sort_order) VALUES (?,?,?,?,?)', [cats.get(t.category), t.name, t.weight, t.description, t.sort]); tags.set(t.name.toLowerCase(), r.insertId); }
    for (const p of lib.projects) {
      let row = byName.get(p.name.toLowerCase()); let id: number;
      if (!row) { const [r]: any = await conn.query('INSERT INTO projects (name, live_link, showable_publicly) VALUES (?,?,?)', [p.name, p.live_link, p.showable]); id = r.insertId; }
      else { id = row.id; await conn.query('UPDATE projects SET active=1 WHERE id=?', [id]); }
      await conn.query(`UPDATE projects SET live_link=?, landing_link=?, system_link=?, mobile_link=?, staging_link=?, case_study_link=?, overview=?, case_study_summary=? WHERE id=?`,
        [p.live_link ?? null, p.landing_link ?? null, p.system_link ?? null, p.mobile_link ?? null, p.staging_link ?? null, p.case_study_link ?? null, p.overview ?? null, p.case_study_summary ?? null, id]);
      // industries follow the project's Industry tags
      const inds = p.tags.filter((t: string) => industryTags.has(t.toLowerCase()));
      for (const t of inds) if (!industries.has(t.toLowerCase())) { const [r]: any = await conn.query('INSERT INTO industries (name) VALUES (?)', [t]); industries.set(t.toLowerCase(), r.insertId); }
      await conn.query('DELETE FROM project_industries WHERE project_id=?', [id]);
      if (inds.length) await conn.query('INSERT INTO project_industries (project_id, industry_id) VALUES ?', [inds.map((t: string) => [id, industries.get(t.toLowerCase())])]);
      const ids = p.tags.map((t: string) => { const tid = tags.get(t.toLowerCase()); if (!tid) throw new Error(`unknown tag ${t} on ${p.name}`); return tid; });
      await conn.query('DELETE FROM project_tags WHERE project_id=?', [id]);
      if (ids.length) await conn.query('INSERT INTO project_tags (project_id, tag_id) VALUES ?', [ids.map((t: number) => [id, t])]);
    }
    for (const p of toDeactivate) await conn.query('UPDATE projects SET active=0 WHERE id=?', [p.id]);
    for (const f of profileCreate) {
      const keys = ['name', ...PROFILE_FIELDS.filter((k) => f[k] != null && f[k] !== '')];
      await conn.query(`INSERT INTO upwork_profiles (${keys.join(', ')}) VALUES (?)`, [keys.map((k) => f[k])]);
    }
    for (const f of profileFill) await conn.query(`UPDATE upwork_profiles SET ${f.set.map(([k]) => k + '=?').join(', ')} WHERE id=?`, [...f.set.map(([, v]) => v), f.id]);
    await conn.query('INSERT INTO audit_log (user_id, action, detail) VALUES (NULL, ?, ?)', ['library_sync', `projects=${lib.projects.length} deactivated=${toDeactivate.length} profiles_created=${profileCreate.length} profiles_filled=${profileFill.length}`]);
    await conn.commit();
    console.log('\nApplied.');
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); await pool.end(); }
})().catch((e) => { console.error('sync failed:', e.message); process.exit(1); });
