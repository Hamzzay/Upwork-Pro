import { exec, query } from '../db';

/**
 * R143 (Hamza): the steps on Upwork come in order (Sent, Viewed, Chat opened, Interview): a chat means the client viewed the proposal,
 * an interview means both. A later step marked without the ones before it fills them in, each at the time of the step that showed it
 * (it happened by then); a step already recorded keeps its own time. Returns what was filled in, with the step that implied it.
 */
export async function fillEarlierSteps(id: number, userId: number | null, withEvents: boolean): Promise<string[]> {
  const r = (await query<any>(`SELECT client_viewed, client_viewed_at, client_replied, client_replied_at, interviewed, interviewed_at FROM screenings WHERE id=?`, [id]))[0];
  if (!r) return [];
  const filled: [string, string, any][] = []; // [step, because of, at]
  if (r.interviewed === 'yes' && r.client_replied !== 'yes') filled.push(['Chat opened', 'Interview', r.interviewed_at]);
  if ((r.client_replied === 'yes' || r.interviewed === 'yes') && r.client_viewed !== 'yes') filled.push(['Viewed', r.client_replied === 'yes' ? 'Chat opened' : 'Interview', r.client_replied === 'yes' ? r.client_replied_at ?? r.interviewed_at : r.interviewed_at]);
  if (!filled.length) return [];
  await exec(`UPDATE screenings SET client_replied=IF(interviewed='yes', 'yes', client_replied), client_replied_at=IF(interviewed='yes' AND client_replied_at IS NULL, interviewed_at, client_replied_at),
    client_viewed=IF(client_replied='yes' OR interviewed='yes', 'yes', client_viewed), client_viewed_at=IF((client_replied='yes' OR interviewed='yes') AND client_viewed_at IS NULL, COALESCE(client_replied_at, interviewed_at), client_viewed_at)
    WHERE id=?`, [id]);
  if (withEvents) for (const [step, why, at] of filled.reverse()) await exec('INSERT INTO status_events (screening_id, status, happened_at, user_id, reason, note) VALUES (?,?,?,?,NULL,?)', [id, step, at, userId, `Filled in: ${why} comes after it`]);
  return filled.map(([step]) => step);
}

/** R143: the jobs saved before this with a later step and not the ones before it, filled in once (data step 075); each in the history. */
export async function fillAllEarlierSteps(): Promise<number> {
  const rows = await query<any>(`SELECT id FROM screenings WHERE (client_replied='yes' AND (client_viewed IS NULL OR client_viewed<>'yes')) OR (interviewed='yes' AND ((client_replied IS NULL OR client_replied<>'yes') OR (client_viewed IS NULL OR client_viewed<>'yes')))`);
  for (const r of rows) {
    const before = (await query<any>('SELECT client_viewed, client_replied FROM screenings WHERE id=?', [r.id]))[0];
    const filled = await fillEarlierSteps(r.id, null, true);
    for (const step of filled) {
      const [field, old] = step === 'Viewed' ? ['client_viewed', before.client_viewed] : ['client_replied', before.client_replied];
      await exec('INSERT INTO field_changes (screening_id, field, old_value, new_value, source, user_id) VALUES (?,?,?,?,?,NULL)', [r.id, field, old ?? null, 'yes', 'filled in from a later step']);
    }
  }
  return rows.length;
}
