// Makes the project list and project tags match a library JSON (made by xlsx-to-seed.ts).
//   npx ts-node scripts/sync-library.ts [library.json]            dry run: prints the plan, changes nothing
//   npx ts-node scripts/sync-library.ts [library.json] --apply    applies it in one transaction
// - projects in the file: created if missing; their tags are set to exactly the file's tags
// - projects NOT in the file: deactivated, never deleted (they stop being used for matching; an admin can delete them in the app)
// - categories and tags missing from the database are added; existing tags keep their weight and wording (the app owns those)
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
      const ids = p.tags.map((t: string) => { const tid = tags.get(t.toLowerCase()); if (!tid) throw new Error(`unknown tag ${t} on ${p.name}`); return tid; });
      await conn.query('DELETE FROM project_tags WHERE project_id=?', [id]);
      if (ids.length) await conn.query('INSERT INTO project_tags (project_id, tag_id) VALUES ?', [ids.map((t: number) => [id, t])]);
    }
    for (const p of toDeactivate) await conn.query('UPDATE projects SET active=0 WHERE id=?', [p.id]);
    await conn.query('INSERT INTO audit_log (user_id, action, detail) VALUES (NULL, ?, ?)', ['library_sync', `projects=${lib.projects.length} deactivated=${toDeactivate.length}`]);
    await conn.commit();
    console.log('\nApplied.');
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); await pool.end(); }
})().catch((e) => { console.error('sync failed:', e.message); process.exit(1); });
