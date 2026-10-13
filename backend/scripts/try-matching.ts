// Try the matching on a job text file without saving anything: npx ts-node scripts/try-matching.ts <file>
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { pool } from '../src/db';
import { tagJob } from '../src/screening/tagging';
import { loadDictionary, loadLibraryProjects, loadRelatedIndustries } from '../src/screening/context';
import { MORE_PROJECTS, rankProjects } from '../src/screening/matching';
import { getSettings } from '../src/settings';
(async () => {
  const text = readFileSync(process.argv[2], 'utf8');
  const tagged = await tagJob(text, await loadDictionary());
  console.log('industry:', tagged.filter((x) => x.tag.category === 'Industry').map((x) => `${x.tag.name} (${x.reason})`).join('; ') || 'none');
  console.log('core work:', tagged.filter((x) => x.core).sort((a, b) => a.core! - b.core!).map((x) => x.tag.name).join(', '));
  console.log('tags:', tagged.filter((x) => x.tag.category !== 'Industry').map((x) => x.tag.name).join(', '));
  const cfg = await getSettings();
  const m = rankProjects(tagged.map((x) => ({ id: x.tag.id, name: x.tag.name, category: x.tag.category, weight: x.tag.weight, compliance: !!x.tag.compliance, core: x.core })), await loadLibraryProjects(),
    { shown: cfg['matching.shown'], recommended: cfg['matching.recommended'], minScore: cfg['matching.min_score'], related: await loadRelatedIndustries(), more: MORE_PROJECTS });
  for (const x of m) console.log(`${x.rank}. ${x.project_name} | ${x.recommended ? 'RECOMMENDED' : x.extra ? 'more' : x.alternative ? 'alternative' : 'shown'} | ${x.pool} | work ${x.proves_work ? 'yes' : 'no'} | ${x.score}`);
  await pool.end();
})().catch(async (e) => { console.error(e.message); await pool.end(); process.exit(1); });
