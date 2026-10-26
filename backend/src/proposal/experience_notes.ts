/**
 * R137 (Hamza): the "Experience with ... (confirmed on job #N)." lines the app used to add to a project's Notes when an experience
 * question was answered Yes. The experience is in the project's tags; the Notes are a person's own. Only lines in exactly that form
 * are taken out; anything a person wrote stays. Each project's change is recorded, so it can be put back from Changes.
 */
import { exec, query } from '../db';
import { raw, record } from '../changesets';
import type {} from '../auth'; // its Request additions, for the change history (the migration runner loads nothing else)

export const APP_LINE = /^Experience with .+ \(confirmed on job #\d+\)\.\s*$/;
/** The notes without the app's lines (null when nothing else is left). */
export const withoutAppLines = (notes: string | null): string | null => {
  const kept = String(notes ?? '').split('\n').filter((l) => !APP_LINE.test(l.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return kept || null;
};
export async function removeAppExperienceNotes(): Promise<number> {
  const rows = await query<any>("SELECT id, notes FROM projects WHERE notes LIKE '%(confirmed on job #%'");
  let n = 0;
  for (const r of rows) {
    const next = withoutAppLines(r.notes);
    if ((next ?? '') === String(r.notes ?? '').trim()) continue;
    const before = await raw('project', r.id);
    await exec('UPDATE projects SET notes=? WHERE id=?', [next, r.id]);
    await record({ userId: null, source: 'app', kind: 'project', id: r.id, before, after: await raw('project', r.id),
      reason: 'Took out the "Experience with ..." lines the app had added to Notes. The experience is in the project\'s tags (R137).' });
    n++;
  }
  return n;
}
