// No database and no real model: pure logic plus the mock provider.
import assert from 'node:assert/strict';
process.env.LLM_PROVIDER = 'mock';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectInput, InputError, jobIdFromUrl } from '../src/screening/jobsource';
import { buildReportJsonSchema, contractAddendum, COLUMN_KEYS, normalizeReport, report } from '../src/screening/contract';
import { screenJobText } from '../src/screening/service';
import { sheetValues } from '../src/screening/persist';
import { renderJobText } from '../src/upwork/client';
import { COMPLIANCE_CATEGORY, rankProjects, validSelection, type JobTag, type LibProject } from '../src/screening/matching';
import { buildTagSchema, tagJob, tagSystemPrompt } from '../src/screening/tagging';

const lib = JSON.parse(readFileSync(join(__dirname, '..', 'seed', 'library.json'), 'utf8'));
const rules = lib.rules as { code: string; type: 'fail' | 'flag'; rule: string }[];
const projects = lib.projects.map((p: any) => ({ name: p.name, tags: p.tags }));
const ctx = { rules, projects };

(async () => {
  // input detection
  const url = 'https://www.upwork.com/jobs/Fractional-AI-Solutions-Architect_~022106902630457880971?utm_source=x';
  assert.equal(jobIdFromUrl(url), '2106902630457880971');
  assert.deepEqual(detectInput(url), { type: 'link', url, jobId: '2106902630457880971' });
  assert.equal((detectInput('https://www.upwork.com/jobs/~01abcdef') as any).jobId, null);
  for (const bad of ['', '   ', 'hello', 'https://example.com/x']) assert.throws(() => detectInput(bad), InputError);
  assert.equal(detectInput('x'.repeat(200)).type, 'text');

  // seed file sanity
  assert.equal(lib.rules.length, 22);
  assert.equal(lib.tags.length, 102);
  assert.equal(lib.projects.length, 31);
  assert.ok(lib.projects.every((p: any) => p.tags.length > 0), 'every library project is tagged');
  assert.ok(lib.projects.every((p: any) => p.tags.every((t: string) => lib.tags.some((x: any) => x.name === t))));
  assert.equal(new Set(lib.projects.map((p: any) => p.name.toLowerCase())).size, 31);

  // schema: no $schema key (the CLI rejects the 2020-12 default); rule codes become an enum
  const schema: any = buildReportJsonSchema(rules.map((r) => r.code));
  assert.equal('$schema' in schema, false);
  assert.deepEqual(schema.properties.job.properties.flags.items.properties.code.enum, rules.map((r) => r.code));
  assert.deepEqual(Object.keys(schema.properties.job.properties.columns.properties), [...COLUMN_KEYS]);

  // addendum carries the code legend and the project library
  const add = contractAddendum(rules, projects);
  assert.ok(add.includes('G14 (flag)') && add.includes('F1 (fail)') && add.includes('Open Dental AI Calling (Chloe): '));
  assert.ok(contractAddendum(rules, []).includes('no projects provided'));

  // mock end to end through the service
  const flag = await screenJobText('Title: A\n' + 'x'.repeat(150), 'skill', ctx);
  assert.equal(flag.job.verdict, 'FLAG');
  assert.equal((await screenJobText('Title: B\n[mock-fail] ' + 'x'.repeat(150), 'skill', ctx)).job.verdict, 'FAIL');
  assert.equal((await screenJobText('Title: C\n[mock-pass] ' + 'x'.repeat(150), 'skill', ctx)).job.verdict, 'PASS');
  assert.equal(report.safeParse({ job: {} }).success, false);

  // sheet values: codes deduplicated, in rule order, unknown dropped; sample match filtered to real projects; long text cut
  const rep = JSON.parse(JSON.stringify(flag));
  rep.job.fails = [{ code: 'F1', rule: 'Already hired', value: 'Hires: 1' }];
  rep.job.flags = [
    { code: 'G14', rule: '50+ proposals', value: '50+' }, { code: 'G14', rule: 'Connects', value: '26' },
    { code: 'G3', rule: 'Low hourly', value: '$8' }, { code: 'ZZ9', rule: 'Bogus', value: 'x' },
  ];
  rep.job.columns.sample_match = 'navience; Not A Real Project;  Open Dental AI Calling (Chloe) ; navience';
  rep.job.columns.required_skills = 'y'.repeat(2000);
  const v = sheetValues(rep, rules.map((r) => r.code), projects.map((p: any) => p.name));
  assert.equal(v.rule_codes, 'F1, G3, G14');
  assert.equal(v.fail_reasons, 'Already hired: Hires: 1');
  assert.equal(v.flag_reasons, '50+ proposals: 50+ | Connects: 26 | Low hourly: $8 | Bogus: x');
  assert.equal(v.columns.sample_match, 'Navience; Open Dental AI Calling (Chloe)');
  assert.equal(v.columns.required_skills.length, 800);
  rep.job.columns.sample_match = 'Totally unknown';
  assert.equal(sheetValues(rep, rules.map((r) => r.code), []).columns.sample_match, 'none');

  // old and new stored reports both normalise to { jobs: [...] }
  assert.equal(normalizeReport({ jobs: [{ a: 1 }] }).jobs.length, 1);
  assert.equal(normalizeReport({ job: { a: 1 } }).jobs.length, 1);
  assert.equal(normalizeReport(null).jobs.length, 0);

  assert.ok(renderJobText({ title: 'T', rows: [{ label: 'Hires', value: null }], description: 'D' }).includes('Hires: not shown'));
  // ---- matching ----
  const T = (id: number, name: string, category: string, weight: number): JobTag => ({ id, name, category, weight });
  const wf1 = T(1, 'Lead generation', 'Workflow type', 3), ind = T(2, 'Dental', 'Industry', 2), tool = T(3, 'HubSpot', 'CRM and business tools', 1);
  const ai = T(4, 'AI powered', 'AI capability', 0), hipaa = T(5, 'HIPAA / PHI', COMPLIANCE_CATEGORY, 2);
  const P = (id: number, name: string, ...tags: number[]): LibProject => ({ id, name, tagIds: new Set(tags) });
  // scoring is the sum of shared weights; AI powered counts for nothing
  let m = rankProjects([wf1, ind, tool, ai], [P(10, 'A', 1, 2), P(11, 'B', 1, 3, 4), P(12, 'C', 4), P(13, 'D')]);
  assert.deepEqual(m.map((x) => [x.project_name, x.score]), [['A', 5], ['B', 4]], 'C scores 0 (only AI powered) and D shares nothing: both dropped');
  assert.equal(m[0].max_score, 6); assert.deepEqual(m.map((x) => x.recommended), [true, true]);
  // ties: more shared tags first, then name
  m = rankProjects([wf1, ind, tool], [P(20, 'Zed', 1, 3), P(21, 'Alpha', 1, 3), P(22, 'Many', 2, 3)]);
  assert.deepEqual(m.map((x) => x.project_name), ['Alpha', 'Zed', 'Many'], 'Alpha and Zed tie on score and tags, name decides');
  // top 5 only, best 2 recommended, ranks 1..5
  const many = Array.from({ length: 9 }, (_, i) => P(30 + i, 'P' + i, 1, ...(i < 5 ? [2] : [])));
  m = rankProjects([wf1, ind], many);
  assert.equal(m.length, 5); assert.deepEqual(m.map((x) => x.rank), [1, 2, 3, 4, 5]); assert.deepEqual(m.map((x) => x.recommended), [true, true, false, false, false]);
  // compliance: projects missing a required compliance tag go below those that have it, even with a higher score
  m = rankProjects([wf1, ind, hipaa], [P(40, 'HighNoHipaa', 1, 2), P(41, 'LowWithHipaa', 5)]);
  assert.deepEqual(m.map((x) => [x.project_name, x.compliance_gap]), [['LowWithHipaa', 0], ['HighNoHipaa', 1]]);
  // no compliance tag in the job: no gap anywhere
  assert.ok(rankProjects([wf1], [P(50, 'X', 1)]).every((x) => x.compliance_gap === 0));
  // fewer than 2 matches, and none
  assert.equal(rankProjects([wf1], [P(60, 'Only', 1), P(61, 'Nope', 2)]).length, 1);
  assert.equal(rankProjects([], [P(70, 'X', 1)]).length, 0);
  // duplicate job tags count once
  assert.equal(rankProjects([wf1, wf1], [P(80, 'X', 1)])[0].score, 3);
  // selection rule: exactly 2 distinct, from the matches shown
  const shown = [{ project_id: 10 }, { project_id: 11 }, { project_id: 12 }];
  assert.equal(validSelection([10, 11], shown), null);
  for (const bad of [[10], [10, 10], [10, 11, 12], [10, 99], []]) assert.ok(validSelection(bad, shown), 'rejects ' + JSON.stringify(bad));

  // ---- tagging through the mock provider ----
  const dict = lib.tags.map((t: any, i: number) => ({ id: i + 1, name: t.name, category: t.category, weight: t.weight, description: t.description }));
  const tschema: any = buildTagSchema(dict.map((t: any) => t.name));
  assert.equal('$schema' in tschema, false); assert.equal(tschema.properties.tags.items.properties.tag.enum.length, 102);
  const sys = tagSystemPrompt(dict);
  assert.ok(sys.includes('Compliance / sensitive data:') && sys.includes('  - MVP: First usable version of a new product'));
  const tagged = await tagJob('Title: x\n' + 'y'.repeat(200), dict);
  assert.ok(tagged.length >= 5 && tagged.every((t) => t.reason && dict.some((d: any) => d.id === t.tag.id)), 'mock tagging returns valid dictionary tags with reasons');
  assert.equal(new Set(tagged.map((t) => t.tag.id)).size, tagged.length);

  console.log('all tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
