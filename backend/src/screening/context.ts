import { query } from '../db';
import type { ProjectLite, RuleRow } from './contract';
import type { LibProject } from './matching';
import type { DictTag } from './tagging';

export async function loadContext(): Promise<{ rules: RuleRow[]; projects: ProjectLite[] }> {
  const rules = await query<RuleRow>(`SELECT code, type, rule, details FROM rules WHERE active=1
    ORDER BY type, CAST(SUBSTRING(code, 2) AS UNSIGNED)`); // ENUM sorts by its definition order: fail, then flag
  const rows = await query<{ name: string; tag: string | null }>(
    `SELECT p.name, t.name AS tag FROM projects p LEFT JOIN project_tags pt ON pt.project_id=p.id LEFT JOIN tags t ON t.id=pt.tag_id AND t.active=1
     WHERE p.active=1 ORDER BY p.name, t.sort_order`);
  const map = new Map<string, string[]>();
  for (const r of rows) { if (!map.has(r.name)) map.set(r.name, []); if (r.tag) map.get(r.name)!.push(r.tag); }
  return { rules, projects: [...map].map(([name, tags]) => ({ name, tags })) };
}

/** Active tags with their category: the dictionary the model tags jobs with. */
export async function loadDictionary(): Promise<DictTag[]> {
  return (await query<any>(
    `SELECT t.id, t.name, t.weight, t.description, c.name AS category, c.is_compliance AS compliance FROM tags t JOIN tag_categories c ON c.id=t.category_id
     WHERE t.active=1 ORDER BY c.sort_order, t.sort_order`)).map((r) => ({ ...r, compliance: !!r.compliance }));
}

/** Active projects with the ids of their active tags, for scoring. */
export async function loadLibraryProjects(): Promise<LibProject[]> {
  const rows = await query<{ id: number; name: string; tag_id: number | null }>(
    `SELECT p.id, p.name, t.id AS tag_id FROM projects p LEFT JOIN project_tags pt ON pt.project_id=p.id LEFT JOIN tags t ON t.id=pt.tag_id AND t.active=1
     WHERE p.active=1`);
  const map = new Map<number, LibProject>();
  for (const r of rows) { if (!map.has(r.id)) map.set(r.id, { id: r.id, name: r.name, tagIds: new Set() }); if (r.tag_id) map.get(r.id)!.tagIds.add(r.tag_id); }
  return [...map.values()];
}
