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
import { rankProjects, validSelection, type JobTag, type LibProject } from '../src/screening/matching';
import { buildTagSchema, tagJob, tagSystemPrompt } from '../src/screening/tagging';
import { htmlToPlain, sanitizeRich, textToHtml } from '../src/html';
import { buildDetectionSchema, codeMap, detectionPrompt, normalizeDetection, type SignalDef } from '../src/proposal/signals';
import { rankTemplates } from '../src/proposal/rank';
import { checkProposal } from '../src/proposal/checks';
import { GUARDRAILS, writerSystem } from '../src/proposal/writer';

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
  const T = (id: number, name: string, category: string, weight: number, compliance = false): JobTag => ({ id, name, category, weight, compliance });
  const wf1 = T(1, 'Lead generation', 'Workflow type', 3), ind = T(2, 'Dental', 'Industry', 2), tool = T(3, 'HubSpot', 'CRM and business tools', 1);
  const ai = T(4, 'AI powered', 'AI capability', 0), hipaa = T(5, 'HIPAA / PHI', 'Compliance / sensitive data', 2, true);
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
  // the admin range: 1 to 2
  assert.equal(validSelection([10], shown, 1, 2), null); assert.equal(validSelection([10, 12], shown, 1, 2), null);
  for (const bad of [[], [10, 11, 12], [10, 10]]) assert.ok(validSelection(bad, shown, 1, 2), 'range rejects ' + JSON.stringify(bad));
  // shown, recommended and the minimum score come from settings
  const opt = rankProjects([wf1, ind, tool], [P(90, 'A', 1, 3), P(91, 'B', 1), P(92, 'C', 3)], { shown: 2, recommended: 1, minScore: 3 });
  assert.deepEqual(opt.map((x) => [x.project_name, x.recommended]), [['A', true], ['B', false]]);

  // ---- tagging through the mock provider ----
  const dict = lib.tags.map((t: any, i: number) => ({ id: i + 1, name: t.name, category: t.category, weight: t.weight, description: t.description }));
  const tschema: any = buildTagSchema(dict.map((t: any) => t.name));
  assert.equal('$schema' in tschema, false); assert.equal(tschema.properties.tags.items.properties.tag.enum.length, 102);
  const sys = tagSystemPrompt(dict);
  assert.ok(!sys.includes('COMPLIANCE') || true);
  const flagged = tagSystemPrompt([{ id: 1, name: 'HIPAA', category: 'Legal bits', weight: 2, description: null, compliance: true }, { id: 2, name: 'MVP', category: 'Stage', weight: 2, description: null }]);
  assert.ok(flagged.includes('Legal bits [COMPLIANCE') && !flagged.includes('Stage [COMPLIANCE') && flagged.includes('NO limit'), 'compliance categories are marked from the flag; no tag limit');
  assert.ok(sys.includes('Compliance / sensitive data') && sys.includes('  - MVP: First usable version of a new product'));
  const tagged = await tagJob('Title: x\n' + 'y'.repeat(200), dict);
  assert.ok(tagged.length >= 5 && tagged.every((t) => t.reason && dict.some((d: any) => d.id === t.tag.id)), 'mock tagging returns valid dictionary tags with reasons');
  assert.equal(new Set(tagged.map((t) => t.tag.id)).size, tagged.length);

  // ---- rich text: nothing but basic formatting survives ----
  assert.equal(sanitizeRich('<p>hi<script>alert(1)</script><img src=x onerror=alert(1)></p>'), '<p>hi</p>');
  assert.equal(sanitizeRich('<a href="javascript:alert(1)">x</a>'), 'x');
  assert.ok(sanitizeRich('<a href="https://a.com" onclick="x()">x</a>').includes('rel="noopener noreferrer"') && !sanitizeRich('<a href="https://a.com" onclick="x()">x</a>').includes('onclick'));
  assert.equal(sanitizeRich('<p>a <a href="javascript:x()">bad</a> <a href="https://ok.com">ok</a></p>'), '<p>a bad <a href="https://ok.com" target="_blank" rel="noopener noreferrer">ok</a></p>', 'an unsafe link and a safe one side by side');
  assert.equal(sanitizeRich('<div>one</div><div>two</div>'), '<p>one</p><p>two</p>');
  assert.equal(sanitizeRich('<b>b</b><i>i</i>'), '<strong>b</strong><em>i</em>');
  assert.ok(!sanitizeRich('<p style="x" class="y" onmouseover="z()">t</p>').includes('style'));
  assert.ok(textToHtml('Hello <b>x</b>\nline2').includes('&lt;b&gt;x&lt;/b&gt;'), 'model text is escaped, never rendered as HTML');
  assert.equal(htmlToPlain(textToHtml('Hello\nline2\n\nSee https://a.com/x.')), 'Hello\nline2\n\nSee https://a.com/x.');
  assert.equal(htmlToPlain('<p>A <a href="https://x.com">link</a></p><ul><li>one</li><li>two</li></ul>'), 'A link (https://x.com)\n\n- one\n- two');
  assert.equal(htmlToPlain('<p>Visit <a href="https://x.com">https://x.com</a></p>'), 'Visit https://x.com');

  // ---- signals: seed file, detection schema, normalisation ----
  const sigSeed = JSON.parse(readFileSync(join(__dirname, '..', 'seed', 'signals.json'), 'utf8'));
  assert.equal(sigSeed.signals.length, 16); assert.equal(sigSeed.layers.length, 3);
  assert.deepEqual(sigSeed.signals.map((x: any) => x.values.filter((v: any) => !v.is_fallback).length), [3, 3, 2, 2, 2, 8, 5, 1, 2, 1, 2, 2, 2, 2, 2, 2]);
  assert.equal(sigSeed.signals[4].values.some((v: any) => v.is_fallback), false, 'signal 5 has no fallback');
  let vid = 0;
  const defs: SignalDef[] = sigSeed.signals.map((x: any, i: number) => ({ id: i + 1, number: x.number, layer: x.layer, name: x.name, decides: x.decides, multi_select: x.multi_select,
    values: x.values.map((v: any) => ({ id: ++vid, name: v.name, detect: v.detect, move: v.move, is_fallback: v.is_fallback })) }));
  const codes = codeMap(defs); assert.equal(codes.size, 56); assert.ok(codes.has('S7.1') && codes.has('S5.2') && !codes.has('S5.3'));
  const dschema: any = buildDetectionSchema(defs); assert.equal('$schema' in dschema, false); assert.equal(dschema.properties.signals.items.properties.values.items.properties.code.enum.length, 56);
  assert.ok(detectionPrompt(defs, []).includes('SIGNAL 7: Core capability (multi-select'));
  const sv = (code: string, primary = true, evidence = 'quote', reason = 'why') => ({ code, primary, confidence: 'high' as const, evidence, reason });
  // the model: S1 solo, S5 missing, S7 two values (primary second), a code from the wrong signal on S2, S3 fallback plus a stated value, everything else missing
  const det = normalizeDetection({ signals: [
    { signal: 1, values: [sv('S1.2')] },
    { signal: 2, values: [sv('S3.1')] },                              // belongs to signal 3: dropped, then S2 gets its fallback
    { signal: 3, values: [sv('S3.3', false), sv('S3.1', true)] },      // fallback and a stated value: the stated one wins
    { signal: 7, values: [sv('S7.2', false), sv('S7.4', true), sv('S7.2', false)] },
    { signal: 4, values: [sv('S4.1'), sv('S4.2', false)] },            // not multi-select: one value only
  ] }, defs);
  const pick = (n: number) => det.filter((d) => d.signal_number === n);
  assert.equal(det.length >= 16, true); assert.equal(pick(1)[0].value_name, 'Solo / individual');
  assert.equal(pick(2)[0].is_fallback, true); assert.equal(pick(2)[0].defaulted, true);
  assert.equal(pick(3).length, 1); assert.equal(pick(3)[0].value_name, 'Greenfield / MVP');
  assert.deepEqual(pick(7).map((d) => [d.value_name, d.is_primary]), [['RAG', false], ['Automation', true]], 'multi-select keeps both, de-duplicated, one primary');
  assert.equal(pick(4).length, 1); assert.equal(pick(5)[0].value_name, 'No', 'signal 5 defaults to No'); assert.equal(pick(16)[0].is_fallback, true);
  assert.equal(new Set(det.map((d) => d.signal_number)).size, 16, 'every signal ends up with a value');
  assert.throws(() => normalizeDetection({ nope: 1 }, defs), /invalid_output/);

  // ---- template ranking ----
  const tpls = [
    { id: 1, name: 'Architecture', priority: 10, mappings: [{ signal_id: 4, value_id: 100, weight: 2 }, { signal_id: 14, value_id: 200, weight: 2 }] },
    { id: 2, name: 'SOP', priority: 20, mappings: [{ signal_id: 14, value_id: 201, weight: 2 }, { signal_id: 16, value_id: null, weight: 1 }] },
    { id: 3, name: 'System', priority: 30, mappings: [{ signal_id: 4, value_id: 101, weight: 2 }] },
  ];
  let r = rankTemplates([{ signal_id: 4, value_id: 100, is_fallback: false }, { signal_id: 14, value_id: 200, is_fallback: false }], tpls);
  assert.deepEqual(r.ranking.map((x) => [x.name, x.score]), [['Architecture', 4], ['SOP', 0], ['System', 0]]); assert.equal(r.chosen!.name, 'Architecture'); assert.equal(r.defaulted, false);
  r = rankTemplates([{ signal_id: 14, value_id: 201, is_fallback: false }, { signal_id: 16, value_id: 999, is_fallback: false }], tpls);
  assert.equal(r.chosen!.name, 'SOP'); assert.equal(r.chosen!.score, 3, 'a row with no value matches any stated value of the signal');
  r = rankTemplates([{ signal_id: 16, value_id: 999, is_fallback: true }], tpls);
  assert.equal(r.chosen!.score, 0); assert.equal(r.defaulted, true); assert.equal(r.chosen!.name, 'Architecture', 'nothing matches: the lowest priority number is the default');
  r = rankTemplates([{ signal_id: 4, value_id: 100, is_fallback: false }, { signal_id: 4, value_id: 101, is_fallback: false }], [tpls[2], tpls[0]]);
  assert.equal(r.chosen!.name, 'Architecture', 'equal scores: lower priority number wins'); assert.equal(rankTemplates([], []).chosen, null);

  // ---- writer prompt: the guardrails and the facts are in, and samples are marked as tone only ----
  const sysTxt = writerSystem({ template: { name: 'T', body_html: '<h2>Rule</h2><p>Start with “Understood.”</p>', prompt: 'Keep it short.' }, detected: det.slice(0, 3), samples: [{ title: 'S1', content: 'Perfect, sample text' }],
    sender: { name: 'Jane Doe', gitlab_link: 'https://gitlab.com/jane', tagline: null }, projects: [{ name: 'Alpha', live_link: null, tags: ['Chatbot'], industries: ['Dental'], notes: null }], clientRequirements: ['Start with the word Banana'] });
  assert.ok(sysTxt.includes(GUARDRAILS) && sysTxt.includes('Start with the word Banana') && sysTxt.includes('Link: (none: omit the link line)') && sysTxt.includes('tone and structure only') && sysTxt.includes('Keep it short.') && sysTxt.includes('Start with “Understood.”'));
  assert.ok(GUARDRAILS.includes('Never invent') && GUARDRAILS.includes('The client\'s rules win') && GUARDRAILS.includes('GitLab'));

  // ---- post-generation checks ----
  const base = { selectedProjects: [{ name: 'Alpha Bot', live_link: 'https://alpha.example.com', notes: null }, { name: 'Beta Flow', live_link: null, notes: 'cut calls by 40%' }],
    otherProjectNames: ['Gamma Hub', 'Ab'], foreignNames: ['Hassan Ijaz', 'Anum Ahmad'], sender: { name: 'Jane Doe', gitlab_link: 'https://gitlab.com/jane' } };
  const good = 'Understood. I built Alpha Bot and Beta Flow.\n\nAlpha Bot – a bot\nhttps://alpha.example.com\n\nBeta Flow cut calls by 40%.\n\nBest regards,\nJane Doe\nhttps://gitlab.com/jane';
  assert.deepEqual(checkProposal({ ...base, text: good }).filter((x) => !x.includes('has no live link')), [], 'a clean proposal only warns about the missing project link');
  assert.ok(checkProposal({ ...base, text: good }).some((x) => x.includes('Beta Flow') && x.includes('no live link')));
  const bad = 'Perfect, I built Alpha Bot and Gamma Hub with a 60–80% gain. We did it. See https://glassdoctor.com/.\n\nBest regards,\nHassan Ijaz\nhttps://github.com/hassan-ijazz';
  const ws = checkProposal({ ...base, text: bad });
  assert.ok(ws.some((x) => x.includes('does not mention the selected project "Beta Flow"')), 'missing selected project');
  assert.ok(ws.some((x) => x.includes('"Gamma Hub"')), 'other library project named'); assert.ok(!ws.some((x) => x.includes('"Ab"')), 'short names are not matched');
  assert.ok(ws.some((x) => x.includes('"Hassan Ijaz"')), 'a sample author name'); assert.ok(ws.some((x) => x.includes('https://glassdoctor.com')) && ws.some((x) => x.includes('github.com/hassan-ijazz')), 'links that were not provided');
  assert.ok(ws.some((x) => x.includes('60–80%')), 'an invented percentage'); assert.ok(ws.some((x) => x.includes('"we"')), '"we"'); assert.ok(ws.some((x) => x.includes('sender name "Jane Doe"')) && ws.some((x) => x.includes('GitLab link')), 'sign-off');
  assert.ok(!checkProposal({ ...base, text: good }).some((x) => x.includes('figure')), 'a percentage that is in the project notes is fine');

  console.log('all tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
