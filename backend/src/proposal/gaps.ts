/**
 * Experience gaps (R67): the client asks for something our facts do not show ("experience with Grok"). The person answers on the
 * proposal page: No, or Yes with the project where it was done (if any) and a few words. A Yes with a project teaches the library
 * (the tag on that project, made if new, and the note), as far as the person's role allows; then only the affected lines of the
 * proposal are written again, as a new version.
 */
import { z } from 'zod';
import { audit, exec, query } from '../db';
import { raw, record } from '../changesets';

export const answersBody = z.object({ answers: z.array(z.object({
  id: z.number().int().positive(), has: z.boolean(),
  project_id: z.number().int().positive().nullable().optional(),
  note: z.string().trim().max(600).optional(),
  tag_name: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
})).min(1).max(20) });
export type GapAnswer = z.infer<typeof answersBody>['answers'][number];

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
async function teachLibrary(a: GapAnswer, gap: any, user: { id: number; role: string }): Promise<'added' | 'waiting' | 'note' | 'to_add' | 'none'> {
  if (!a.project_id) return 'none';
  if (user.role !== 'admin' && user.role !== 'manager') return 'to_add';
  const project = (await query<any>('SELECT id, name, notes FROM projects WHERE id=?', [a.project_id]))[0];
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

/** An admin adds a waiting tag (an existing tag that is on) to its project, from the Proposal feedback page. */
export async function linkWaiting(gapId: number, user: { id: number; role: string }): Promise<string | null> {
  if (user.role !== 'admin') return 'Only an admin adds tags to projects from here';
  const g = (await query<any>("SELECT * FROM proposal_gaps WHERE id=? AND status='yes' AND library IN ('waiting', 'to_add')", [gapId]))[0];
  if (!g || !g.project_id) return 'Nothing waits for this one';
  if (g.library === 'to_add') { const lib = await teachLibrary({ id: g.id, has: true, project_id: g.project_id, note: g.note || undefined, tag_name: g.tag_name || undefined, category: g.category || undefined }, g, user); await exec('UPDATE proposal_gaps SET library=? WHERE id=?', [lib === 'waiting' ? 'waiting' : 'added', g.id]); if (lib !== 'waiting') return null; }
  const tag = (await query<any>('SELECT id FROM tags WHERE LOWER(name)=LOWER(?) ORDER BY active DESC LIMIT 1', [g.tag_name || g.skill]))[0];
  if (!tag) return 'The tag does not exist any more';
  const before = await raw('project', g.project_id);
  await exec('INSERT IGNORE INTO project_tags (project_id, tag_id) VALUES (?,?)', [g.project_id, tag.id]);
  await record({ userId: user.id, source: 'app', kind: 'project', id: g.project_id, before, after: await raw('project', g.project_id), reason: `Tag ${g.tag_name || g.skill} added from an experience confirmed on job #${g.screening_id}` });
  await exec("UPDATE proposal_gaps SET library='added' WHERE id=?", [g.id]);
  return null;
}

/** Save the answers; teach the library; queue the proposal's update when there is any Yes. */
export async function answerGaps(proposalId: number, answers: GapAnswer[], user: { id: number; role: string }): Promise<{ updated: boolean; library: Record<string, string> }> {
  const gaps = await query<any>('SELECT * FROM proposal_gaps WHERE proposal_id=? AND id IN (?)', [proposalId, answers.map((a) => a.id)]);
  const library: Record<string, string> = {};
  let anyYes = false;
  for (const a of answers) {
    const g = gaps.find((x) => x.id === a.id); if (!g) continue;
    if (!a.has) { await exec(`UPDATE proposal_gaps SET status='no', project_id=NULL, note=NULL, library=NULL, answered_by=?, answered_at=NOW() WHERE id=?`, [user.id, g.id]); continue; }
    anyYes = true;
    const lib = await teachLibrary(a, g, user);
    library[g.skill] = lib;
    await exec(`UPDATE proposal_gaps SET status='yes', project_id=?, note=?, tag_name=?, library=?, applied_version=NULL, answered_by=?, answered_at=NOW() WHERE id=?`,
      [a.project_id ?? null, a.note || null, (a.tag_name || g.skill).slice(0, 120), lib, user.id, g.id]);
  }
  if (anyYes) await exec(`UPDATE proposals SET gaps_status='queued', gaps_error=NULL WHERE id=?`, [proposalId]);
  await audit(user.id, 'proposal_gaps', `proposal=${proposalId} answers=${answers.length}${anyYes ? ' update queued' : ''}`);
  return { updated: anyYes, library };
}
