/**
 * R139 (Hamza): jobs saved with no job link get the one in their own pasted page, once (the data step on deploy). Each fill is kept in
 * the job's history as a change from nothing to the link, by "job link from the post"; a page with no link, or several, stays empty.
 */
import { exec, query } from '../db';
import { jobIdFromUrl, jobLinkInText } from './jobsource';

export async function fillJobLinks(): Promise<number> {
  const rows = await query<any>("SELECT id, raw_input, job_text FROM screenings WHERE source_url IS NULL OR source_url=''");
  let n = 0;
  for (const r of rows) {
    const link = jobLinkInText(`${r.raw_input ?? ''}\n${r.job_text ?? ''}`); if (!link) continue;
    await exec("UPDATE screenings SET source_url=?, upwork_job_id=COALESCE(upwork_job_id, ?) WHERE id=? AND (source_url IS NULL OR source_url='')", [link, jobIdFromUrl(link), r.id]);
    await exec('INSERT INTO field_changes (screening_id, field, old_value, new_value, source, user_id) VALUES (?,?,?,?,?,NULL)', [r.id, 'source_url', null, link, 'job link from the post']);
    n++;
  }
  return n;
}
