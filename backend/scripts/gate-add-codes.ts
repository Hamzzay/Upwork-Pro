// Saves a new, INACTIVE gate version whose FAIL and FLAG lines carry their rule codes (F1 to F5, G1 to G17).
// The base is the newest version that already has every rule (the one with flag 17), otherwise the active one.
// Nothing changes for screening until an admin activates the new version in Upwork JobGate.
import 'dotenv/config';
import { exec, pool, query } from '../src/db';
import { addRuleCodes, codesMissingFromPrompt } from '../src/screening/gatecodes';

const NOTE = 'Rule codes written into the prompt (F1 to F5, G1 to G17)';

(async () => {
  const rules = await query<any>('SELECT code, type, active FROM rules WHERE active=1');
  const versions = await query<any>('SELECT id, version, content, is_active FROM skill_versions ORDER BY version DESC');
  if (versions.some((v) => v.change_note === NOTE) || (await query('SELECT id FROM skill_versions WHERE change_note=?', [NOTE])).length) { console.log('a gate version with the codes already exists'); await pool.end(); return; }
  const base = versions.find((v) => /^17\. The work requires breaking platform rules/m.test(v.content)) ?? versions.find((v) => v.is_active);
  if (!base) throw new Error('no gate version to start from');
  const coded = addRuleCodes(base.content, rules);
  const missing = codesMissingFromPrompt(coded.text, rules);
  if (missing.length) throw new Error('codes still missing from the prompt: ' + missing.join(', '));
  const next = (await query<any>('SELECT COALESCE(MAX(version),0)+1 AS v FROM skill_versions'))[0].v;
  await exec('INSERT INTO skill_versions (version, content, change_note, is_active) VALUES (?,?,?,0)', [next, coded.text, NOTE]);
  console.log(`saved gate version ${next} (inactive) from version ${base.version}: ${coded.fail} FAIL and ${coded.flag} FLAG lines now carry their codes`);
  await pool.end();
})().catch((e) => { console.error('gate-add-codes failed:', e.message); process.exit(1); });
