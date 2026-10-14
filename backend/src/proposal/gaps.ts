/**
 * Experience gaps (R67): the client asks for something our facts do not show ("experience with Grok"). The person answers on the
 * proposal page: No, or Yes with the projects where it was done (none, one or several: R71) and a few words. A Yes with projects
 * teaches the library (the tag on each project, made if new, and the note), as far as the person's role allows; then only the affected lines of the
 * proposal are written again, as a new version.
 */
import { z } from 'zod';
import { audit, exec, query } from '../db';
import { raw, record } from '../changesets';

export const answersBody = z.object({ answers: z.array(z.object({
  id: z.number().int().positive(), has: z.boolean(),
  project_id: z.number().int().positive().nullable().optional(),       // one project (the plugin and older pages)
  project_ids: z.array(z.number().int().positive()).max(12).optional(), // several (R71)
  note: z.string().trim().max(600).optional(),
  tag_name: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
})).min(1).max(20) });
export type GapAnswer = z.infer<typeof answersBody>['answers'][number];
type Lib = 'added' | 'waiting' | 'note' | 'to_add' | 'none';
/** The projects of an answer, each once, in the order given. */
export const projectsOf = (a: GapAnswer) => [...new Set([...(a.project_ids ?? []), ...(a.project_id ? [a.project_id] : [])])];
/** One word for the gap, from its projects': what still needs someone comes first. */
export const libSummary = (libs: Lib[]): Lib => (!libs.length ? 'none' : (['to_add', 'waiting', 'added', 'note'] as Lib[]).find((x) => libs.includes(x)) ?? 'none');

/** The score a new tag gets: the usual score of its category (the most common one there), else 1. */
async function usualWeight(categoryId: number): Promise<number> {
  const r = (await query<any>('SELECT weight, COUNT(*) n FROM tags WHERE category_id=? GROUP BY weight ORDER BY n DESC, weight DESC LIMIT 1', [categoryId]))[0];
  return r ? Number(r.weight) : 1;
}

/**
 * What a Yes with a project gives the library (Ahmad, 14 October): the note, how it was used, always goes into the project's notes,
 * where the writer reads it. The tag never changes the matching by itself: a tag made from a Yes is made switched off (an admin
 * switches it on in the Tag dictionary when it should count), and an existing tag that is on is not linked now, because the link
 * alone would change the matching: it waits, marked on the gap, for an admin. By role: an admin makes the tag; a manager adds the
 * note (only an admin makes tags); an employee's answer waits, marked to add. Every change is a change set (Changes page).
 */
async function teachLibrary(a: GapAnswer, gap: any, user: { id: number; role: string }, projectId: number): Promise<Lib> {
  if (user.role !== 'admin' && user.role !== 'manager') return 'to_add';
  const project = (await query<any>('SELECT id, name, notes FROM projects WHERE id=?', [projectId]))[0];
  if (!project) return 'none';
  const name = (a.tag_name || gap.skill).trim();
  const reason = `Experience confirmed on a proposal (job #${gap.screening_id}): ${gap.ask}`;
  const before = await raw('project', project.id);
  let tag = (await query<any>('SELECT id, name, active FROM tags WHERE LOWER(name)=LOWER(?) ORDER BY active DESC LIMIT 1', [name]))[0];
  let result: 'added' | 'waiting' | 'note' = 'note';
  if (!tag && user.role === 'admin') {
    const cat = (await query<any>('SELECT id FROM tag_categories WHERE LOWER(name)=LOWER(?)', [a.category || gap.category || '']))[0]
      ?? (await query<any>("SELECT id FROM tag_categories WHERE name='Tech stack'"))[0] ?? (await query<any>('SELECT id FROM tag_categories ORDER BY sort_order LIMIT 1'))[0];
    if (cat) {
      const r = await exec('INSERT INTO tags (category_id, name, weight, description, active, sort_order) VALUES (?,?,?,?,0, (SELECT n FROM (SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM tags) x))',
        [cat.id, name, await usualWeight(cat.id), String(gap.ask).slice(0, 500)]);
      tag = { id: Number(r.insertId), name, active: 0 };
      await record({ userId: user.id, source: 'app', kind: 'tag', id: tag.id, before: null, after: await raw('tag', tag.id), reason: reason + ' (made switched off: it does not count in matching until an admin switches it on)' });
    }
  }
  // a switched off tag can be on the project at once: it counts only once an admin switches it on
  if (tag && !Number(tag.active)) { await exec('INSERT IGNORE INTO project_tags (project_id, tag_id) VALUES (?,?)', [project.id, tag.id]); result = 'added'; }
  else if (tag) result = 'waiting';
  const line = `Experience with ${name}${a.note ? ': ' + a.note : ''} (confirmed on job #${gap.screening_id}).`;
  if (!String(project.notes || '').includes(line)) await exec("UPDATE projects SET notes=TRIM(CONCAT(COALESCE(notes, ''), ?)) WHERE id=?", [(project.notes ? '\n' : '') + line, project.id]);
  await record({ userId: user.id, source: 'app', kind: 'project', id: project.id, before, after: await raw('project', project.id), reason });
  return result;
}

/** An admin adds a waiting tag (an existing tag that is on) to its project, from the Proposal feedback page. One project, or all of the gap's. */
export async function linkWaiting(gapId: number, user: { id: number; role: string }, projectId?: number): Promise<string | null> {
  if (user.role !== 'admin') return 'Only an admin adds tags to projects from here';
  const g = (await query<any>("SELECT * FROM proposal_gaps WHERE id=? AND status='yes'", [gapId]))[0];
  const rows = g ? await query<any>(`SELECT id, project_id, library FROM proposal_gap_projects WHERE gap_id=? AND library IN ('waiting', 'to_add')${projectId ? ' AND project_id=?' : ''}`, projectId ? [gapId, projectId] : [gapId]) : [];
  if (!rows.length) return 'Nothing waits for this one';
  const answer: GapAnswer = { id: g.id, has: true, note: g.note || undefined, tag_name: g.tag_name || undefined, category: g.category || undefined };
  for (const r of rows) {
    let lib: Lib = r.library;
    if (lib === 'to_add') lib = await teachLibrary(answer, g, user, r.project_id); // an employee's answer: an admin teaches it now
    if (lib === 'waiting') {
      const tag = (await query<any>('SELECT id FROM tags WHERE LOWER(name)=LOWER(?) ORDER BY active DESC LIMIT 1', [g.tag_name || g.skill]))[0];
      if (!tag) return 'The tag does not exist any more';
      const before = await raw('project', r.project_id);
      await exec('INSERT IGNORE INTO project_tags (project_id, tag_id) VALUES (?,?)', [r.project_id, tag.id]);
      await record({ userId: user.id, source: 'app', kind: 'project', id: r.project_id, before, after: await raw('project', r.project_id), reason: `Tag ${g.tag_name || g.skill} added from an experience confirmed on job #${g.screening_id}` });
    }
    await exec("UPDATE proposal_gap_projects SET library='added' WHERE id=?", [r.id]);
  }
  const libs = (await query<any>('SELECT library FROM proposal_gap_projects WHERE gap_id=?', [gapId])).map((x) => x.library as Lib);
  await exec('UPDATE proposal_gaps SET library=? WHERE id=?', [libSummary(libs), gapId]);
  return null;
}

/** Save the answers; teach the library; queue the proposal's update when there is any Yes. */
export async function answerGaps(proposalId: number, answers: GapAnswer[], user: { id: number; role: string }): Promise<{ updated: boolean; library: Record<string, string> }> {
  const gaps = await query<any>('SELECT * FROM proposal_gaps WHERE proposal_id=? AND id IN (?)', [proposalId, answers.map((a) => a.id)]);
  const library: Record<string, string> = {};
  let anyYes = false;
  for (const a of answers) {
    const g = gaps.find((x) => x.id === a.id); if (!g) continue;
    await exec('DELETE FROM proposal_gap_projects WHERE gap_id=?', [g.id]); // answered again: the new answer's projects only
    if (!a.has) { await exec(`UPDATE proposal_gaps SET status='no', project_id=NULL, note=NULL, library=NULL, answered_by=?, answered_at=NOW() WHERE id=?`, [user.id, g.id]); continue; }
    anyYes = true;
    const ids = projectsOf(a), libs: Lib[] = [];
    for (const pid of ids) {
      const lib = await teachLibrary(a, g, user, pid); libs.push(lib);
      await exec('INSERT INTO proposal_gap_projects (gap_id, project_id, library) VALUES (?,?,?)', [g.id, pid, lib]);
    }
    const lib = libSummary(libs);
    library[g.skill] = lib;
    await exec(`UPDATE proposal_gaps SET status='yes', project_id=?, note=?, tag_name=?, library=?, applied_version=NULL, answered_by=?, answered_at=NOW() WHERE id=?`,
      [ids[0] ?? null, a.note || null, (a.tag_name || g.skill).slice(0, 120), lib, user.id, g.id]);
  }
  if (anyYes) await exec(`UPDATE proposals SET gaps_status='queued', gaps_error=NULL WHERE id=?`, [proposalId]);
  await audit(user.id, 'proposal_gaps', `proposal=${proposalId} answers=${answers.length}${anyYes ? ' update queued' : ''}`);
  return { updated: anyYes, library };
}
