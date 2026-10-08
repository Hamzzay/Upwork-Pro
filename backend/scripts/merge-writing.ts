// One time, on a database from before R21: the six proposal types become the templates (one Writing guide for the app and the
// Claude plugin). Run `npm run seed:proposals` first (it adds the three new signals and the six type templates), then this:
// - the three SOP templates are retired (inactive, kept for reference and for the proposals already written with them)
// - their sample proposals move to "Type 1. Standard build" (a copy the seed already added there is not doubled)
// - the type documents in the writing guide are removed: the templates are the types now
// Safe to run again.
import 'dotenv/config';
import { audit, exec, pool, query } from '../src/db';

const OLD = ['Stackup Proposal Architecture', 'Stackup Proposal Writing Framework SOP', 'Upwork Proposal Writing System'];
(async () => {
  const t1 = (await query<any>("SELECT id FROM templates WHERE name='Type 1. Standard build'"))[0];
  if (!t1) throw new Error('The six type templates are missing: run npm run seed:proposals first');
  const old = await query<any>('SELECT id, name FROM templates WHERE name IN (?)', [OLD]);
  const retired = old.length ? (await exec('UPDATE templates SET active=0 WHERE id IN (?) AND active=1', [old.map((o) => o.id)])).affectedRows : 0;
  let moved = 0, dropped = 0;
  for (const s of old.length ? await query<any>('SELECT id, author, job_url, content FROM template_samples WHERE template_id IN (?)', [old.map((o) => o.id)]) : []) {
    const twin = await query('SELECT id FROM template_samples WHERE template_id=? AND author <=> ? AND job_url <=> ? AND content=?', [t1.id, s.author, s.job_url, s.content]);
    if (twin.length) { await exec('DELETE FROM template_samples WHERE id=?', [s.id]); dropped++; }
    else { await exec('UPDATE template_samples SET template_id=? WHERE id=?', [t1.id, s.id]); moved++; }
  }
  const docs = (await exec("DELETE FROM writing_docs WHERE kind='type'")).affectedRows;
  const types = await query<any>("SELECT name, active FROM templates WHERE name LIKE 'Type %' ORDER BY priority");
  console.log(`templates retired: ${retired}; samples moved to Type 1: ${moved}, already there: ${dropped}; type documents removed: ${docs}`);
  console.log('active types:', types.filter((t) => Number(t.active)).map((t) => t.name).join(', '));
  if (retired || moved || dropped || docs) await audit(null, 'writing_merge', `retired=${retired} moved=${moved} dropped=${dropped} docs=${docs}`);
  await pool.end();
})().catch((e) => { console.error('merge-writing failed:', e.message); process.exit(1); });
