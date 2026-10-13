// Write a proposal for a job with its chosen projects and profile, saving nothing: npx ts-node scripts/try-writing.ts <job id> [type id]
import 'dotenv/config';
import { pool } from '../src/db';
import { draftPreview } from '../src/proposal/pipeline';
(async () => {
  const d = await draftPreview(Number(process.argv[2]), process.argv[3] ? Number(process.argv[3]) : null);
  console.log(d ? `TYPE: ${d.template.name}\nWARNINGS: ${d.warnings.map((w) => w.text).join(' | ') || 'none'}\n\n${d.text}` : 'nothing written');
  await pool.end();
})().catch(async (e) => { console.error(e.message); await pool.end(); process.exit(1); });
