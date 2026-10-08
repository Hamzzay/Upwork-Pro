import { query } from '../db';
import type { ProjectLite, RuleRow } from './contract';
import { projectPlatforms, type LibProject } from './matching';
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

/** Active projects with the ids of their active tags, their industries and what they run on, for matching. */
export async function loadLibraryProjects(): Promise<LibProject[]> {
  const rows = await query<{ id: number; name: string; tag_id: number | null; tag: string | null }>(
    `SELECT p.id, p.name, t.id AS tag_id, t.name AS tag FROM projects p LEFT JOIN project_tags pt ON pt.project_id=p.id LEFT JOIN tags t ON t.id=pt.tag_id AND t.active=1
     WHERE p.active=1`);
  const links = new Map((await query<any>('SELECT id, landing_link, system_link, mobile_link FROM projects WHERE active=1')).map((r) => [r.id, r]));
  const inds = await query<{ project_id: number; name: string }>('SELECT pi.project_id, i.name FROM project_industries pi JOIN industries i ON i.id=pi.industry_id');
  const map = new Map<number, LibProject & { tagNames: string[] }>();
  for (const r of rows) {
    if (!map.has(r.id)) map.set(r.id, { id: r.id, name: r.name, tagIds: new Set(), tagNames: [], industries: inds.filter((x) => x.project_id === r.id).map((x) => x.name) });
    if (r.tag_id) { map.get(r.id)!.tagIds.add(r.tag_id); map.get(r.id)!.tagNames.push(r.tag!); }
  }
  return [...map.values()].map(({ tagNames, ...p }) => ({ ...p, platforms: projectPlatforms(links.get(p.id) ?? {}, tagNames) }));
}

/** Each industry's related industries ("Dental" -> ["Healthcare"]), from the Industries page. */
export async function loadRelatedIndustries(): Promise<Map<string, string[]>> {
  return new Map((await query<any>('SELECT name, related FROM industries WHERE active=1 AND related IS NOT NULL')).map((r) => [String(r.name).toLowerCase(), String(r.related).split(',').map((x) => x.trim()).filter(Boolean)]));
}
