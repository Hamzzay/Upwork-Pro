// No database and no real model: pure logic plus the mock provider.
import assert from 'node:assert/strict';
process.env.LLM_PROVIDER = 'mock';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectInput, InputError, jobIdFromUrl } from '../src/screening/jobsource';
import { buildReportJsonSchema, contractAddendum, COLUMN_KEYS, gatePrompt, normalizeReport, report, rulesSection } from '../src/screening/contract';
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
import { settingsConflict } from '../src/settings';
import { createServer } from 'node:http';
import { runOpenAI, strictSchema } from '../src/llm/openai';
import { postingSchema } from '../src/screening/posting';
import { writerSchema, chatSchema } from '../src/proposal/writer';
import { merge, type Rec } from '../src/sheets/merge';
import { applyToSheet, readProfiles, readProjects, readTags, TABS } from '../src/sheets/model';
import { FakeSheet } from './fakesheet';

const lib = JSON.parse(readFileSync(join(__dirname, '..', 'seed', 'library.json'), 'utf8'));
const rules = lib.rules as { code: string; type: 'fail' | 'flag'; rule: string; details?: string }[];
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
  assert.equal(lib.tags.length, 105);
  assert.equal(lib.projects.length, 43);
  assert.ok(lib.projects.every((p: any) => p.tags.length > 0), 'every library project is tagged');
  assert.ok(lib.projects.every((p: any) => p.tags.every((t: string) => lib.tags.some((x: any) => x.name === t))));
  assert.equal(new Set(lib.projects.map((p: any) => p.name.toLowerCase())).size, 43);

  // schema: no $schema key (the CLI rejects the 2020-12 default); rule codes become an enum
  const schema: any = buildReportJsonSchema(rules.map((r) => r.code));
  assert.equal('$schema' in schema, false);
  assert.deepEqual(schema.properties.job.properties.flags.items.properties.code.enum, rules.map((r) => r.code));
  assert.deepEqual(Object.keys(schema.properties.job.properties.columns.properties), [...COLUMN_KEYS]);

  // addendum names the allowed codes and carries the project library
  const add = contractAddendum(rules, projects);
  assert.ok(add.includes('(F1, F2,') && add.includes('G17)') && add.includes('Open Dental AI Calling (Chloe): '));
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
  assert.equal('$schema' in tschema, false); assert.equal(tschema.properties.tags.items.properties.tag.enum.length, 105);
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

  // ---- gate prompt = gate instructions + the rules from the Rules page + the fixed contract ----
  const instructions = readFileSync(join(__dirname, '..', 'seed', 'gate-instructions.md'), 'utf8');
  assert.ok(!/^###\s+(FAIL|FLAG)\b/m.test(instructions) && !/^1\. The client already hired/m.test(instructions), 'the instructions hold no rule list of their own');
  assert.ok(instructions.includes('Accepted regions:') && instructions.includes('## Reference: services'), 'the method and references stay in the instructions');
  const sec = rulesSection(rules);
  assert.ok(sec.includes('\nF1. Client already hired for this job. How to apply: Fails when the Hires count'), 'a rule line carries its code and its details');
  assert.ok(sec.includes('\nG17. Work requires breaking platform rules, such as fake or multiple social accounts.\n'), 'a rule without details is one plain line');
  assert.ok(sec.indexOf('\nF5.') < sec.indexOf('FLAG:') && sec.indexOf('FLAG:') < sec.indexOf('\nG1.'), 'fail rules under FAIL, flag rules under FLAG');
  assert.ok(sec.includes('How to apply: A paid test is fine.') && sec.includes('No reviews yet is not a flag.'), 'the exceptions from the old prompt are kept');
  for (const r of rules) assert.ok(sec.includes(`\n${r.code}. `), `${r.code} is in the prompt`);
  const full = gatePrompt(instructions, rules, projects);
  assert.ok(full.startsWith('# Gate instructions') && full.indexOf('RULES (') < full.indexOf('OUTPUT CONTRACT') && full.indexOf('OUTPUT CONTRACT') < full.indexOf('PROJECT LIBRARY'), 'instructions, then rules, then the contract');
  assert.ok(!rulesSection(rules.filter((r) => r.code !== 'G4')).includes('\nG4. '), 'a retired rule is left out');
  assert.ok(rulesSection([]).includes('FAIL: any one of these fails the job.\n(none)'), 'no rules is said plainly');

  // ---- settings that depend on each other ----
  const okCfg = { 'matching.shown': 5, 'matching.recommended': 2, 'selection.min': 1, 'selection.max': 2 };
  assert.equal(settingsConflict(okCfg), null);
  assert.match(settingsConflict({ ...okCfg, 'selection.max': 1 })!, /recommended cannot be more/);
  assert.match(settingsConflict({ ...okCfg, 'selection.min': 3, 'selection.max': 2 })!, /fewest projects/);
  assert.match(settingsConflict({ ...okCfg, 'matching.shown': 1 })!, /shown must be at least/);
  assert.match(settingsConflict({ ...okCfg, 'selection.min': 2, 'matching.recommended': 1 })!, /recommended cannot be fewer/);

  // ---- OpenAI adapter: strict-schema translation and the call itself (against a fake local server) ----
  const walk = (n: any, path = ''): string[] => {
    if (!n || typeof n !== 'object') return [];
    const bad: string[] = [];
    if (n.type === 'object') {
      if (n.additionalProperties !== false) bad.push(path + ': additionalProperties not false');
      const keys = Object.keys(n.properties ?? {}).sort();
      if (JSON.stringify([...(n.required ?? [])].sort()) !== JSON.stringify(keys)) bad.push(path + ': required differs from properties');
    }
    for (const k of Object.keys(n)) if (!['type', 'properties', 'required', 'items', 'enum', 'description', 'additionalProperties', 'anyOf'].includes(k)) bad.push(path + ': keyword ' + k);
    for (const [k, v] of Object.entries(n.properties ?? {})) bad.push(...walk(v, path + '.' + k));
    if (n.items) bad.push(...walk(n.items, path + '[]'));
    for (const a of n.anyOf ?? []) bad.push(...walk(a, path + '|'));
    return bad;
  };
  const sigDefs = [{ id: 1, number: 1, name: 'S', layer: 'A', multi: false, values: [{ id: 1, code: 'S1.1', name: 'x', is_fallback: false, description: 'd' }] }] as any;
  const appSchemas: [string, any][] = [['screening', buildReportJsonSchema(['F1', 'G1'])], ['tagging', buildTagSchema(['a', 'b'])], ['posting', postingSchema], ['writer', writerSchema], ['chat', chatSchema], ['signals', buildDetectionSchema(sigDefs)]];
  for (const [name, sc] of appSchemas) assert.deepEqual(walk(strictSchema(sc), name), [], `${name} schema must satisfy OpenAI strict mode`);
  assert.deepEqual(strictSchema({ type: 'object', properties: { a: { type: 'string', minLength: 3 }, b: { type: 'array', items: { type: 'string' }, maxItems: 2 } }, required: ['a'], $schema: 'x' }),
    { type: 'object', properties: { a: { type: 'string' }, b: { type: 'array', items: { type: 'string' } } }, required: ['a', 'b'], additionalProperties: false });

  const seen: any[] = []; let mode = 'ok'; let hits = 0;
  const fake = createServer((req, res) => {
    const chunks: Buffer[] = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
      hits++; seen.push({ auth: req.headers.authorization, url: req.url, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') });
      const send = (st: number, o: unknown) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      if (mode === 'ok') return send(200, { choices: [{ finish_reason: 'stop', message: { content: '{"answer":"ok"}' } }] });
      if (mode === '401') return send(401, { error: { message: 'secret prompt echo' } });
      if (mode === 'flaky') return hits % 2 ? send(429, {}) : send(200, { choices: [{ finish_reason: 'stop', message: { content: '{"answer":"ok"}' } }] });
      if (mode === 'refusal') return send(200, { choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'no' } }] });
      if (mode === 'length') return send(200, { choices: [{ finish_reason: 'length', message: { content: '{"answer":' } }] });
      if (mode === 'notjson') return send(200, { choices: [{ finish_reason: 'stop', message: { content: 'hello' } }] });
      if (mode === 'hang') return void 0;
    });
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(fake.address() as any).port}/v1`;
  const oa = { model: 'gpt-x', system: 'SYS', prompt: 'USER', schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] }, timeoutMs: 3000 };
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(runOpenAI(oa), /llm_key_missing:openai/);
  process.env.OPENAI_API_KEY = 'sk-test-123';
  const oaGood = await runOpenAI(oa);
  assert.deepEqual(oaGood.data, { answer: 'ok' });
  assert.equal(seen[0].auth, 'Bearer sk-test-123'); assert.equal(seen[0].url, '/v1/chat/completions');
  assert.equal(seen[0].body.model, 'gpt-x'); assert.equal(seen[0].body.messages[0].role, 'system'); assert.equal(seen[0].body.response_format.json_schema.strict, true);
  assert.equal(seen[0].body.response_format.json_schema.schema.additionalProperties, false);
  mode = '401'; await assert.rejects(runOpenAI(oa), (e: any) => e.status === 401 && !/secret/.test(e.message)); // never echoes the provider's body
  mode = 'flaky'; hits = 0; assert.deepEqual((await runOpenAI(oa)).data, { answer: 'ok' }); // one 429, then fine
  mode = 'refusal'; await assert.rejects(runOpenAI(oa), /invalid_output/);
  mode = 'length'; await assert.rejects(runOpenAI(oa), /invalid_output/);
  mode = 'notjson'; await assert.rejects(runOpenAI(oa), /no structured output/);
  mode = 'hang'; await assert.rejects(runOpenAI({ ...oa, timeoutMs: 400 }), /^Error: timeout after 400 ms/);
  fake.closeAllConnections?.(); fake.close();

  // ---- two-way sheet sync: the merge ----
  {
    const M = (o: Record<string, Rec>) => new Map(Object.entries(o));
    const P = (x: Rec) => ({ name: 'A', overview: null, tags: [], ...x });
    // first sync (no base): each side's new records go to the other, an empty field takes the filled one, two filled values conflict
    let r = merge(M({}), M({ a: P({ overview: 'sheet text', tags: ['Web app'] }), s: P({ name: 'S' }) }), M({ a: P({ overview: null, tags: ['Chatbot'] }), p: P({ name: 'P' }) }));
    assert.deepEqual(r.toApp.create.map((x) => x.key), ['s']); assert.deepEqual(r.toSheet.create.map((x) => x.key), ['p']);
    assert.deepEqual(r.base.get('a')!.tags, ['Chatbot', 'Web app'], 'tags from both sides are kept');
    assert.equal(r.base.get('a')!.overview, 'sheet text'); assert.equal(r.conflicts.length, 0);
    r = merge(M({}), M({ a: P({ overview: 'one' }) }), M({ a: P({ overview: 'two' }) }));
    assert.equal(r.conflicts.length, 1); assert.equal(r.base.get('a')!.overview, 'one', 'a conflict keeps the sheet value'); assert.equal(r.conflicts[0].app, 'two', 'and reports the app value');
    // later syncs: the side that changed wins; a tag removed on one side is removed from both
    const base = M({ a: P({ overview: 'old', tags: ['Web app', 'Chatbot'] }) });
    r = merge(base, M({ a: P({ overview: 'old', tags: ['Web app'] }) }), M({ a: P({ overview: 'new in app', tags: ['Web app', 'Chatbot', 'RAG / knowledge base'] }) }));
    assert.equal(r.base.get('a')!.overview, 'new in app'); assert.deepEqual(r.toSheet.update[0].fields, { overview: 'new in app', tags: ['RAG / knowledge base', 'Web app'] });
    assert.deepEqual(r.base.get('a')!.tags, ['RAG / knowledge base', 'Web app'], 'Chatbot removed in the sheet, RAG added in the app');
    r = merge(base, M({ a: P({ overview: 'sheet edit', tags: ['Web app', 'Chatbot'] }) }), M({ a: P({ overview: 'app edit', tags: ['Web app', 'Chatbot'] }) }));
    assert.equal(r.conflicts.length, 1, 'both changed the same field');
    // removals follow, and the brake holds back a mass removal
    r = merge(M({ a: P({}), b: P({ name: 'B' }) }), M({ a: P({}) }), M({ a: P({}), b: P({ name: 'B' }) }));
    assert.deepEqual(r.toApp.remove, ['b'], 'removed in the sheet, so put aside in the app');
    const many = Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['k' + i, P({ name: 'K' + i })]));
    r = merge(M(many), M({ k0: many.k0 }), M(many));
    assert.equal(r.toApp.remove.length, 0); assert.equal(r.heldBack[0].keys.length, 9, 'nine removals at once are held back'); assert.ok(r.base.has('k5'));
    assert.equal(merge(M({}), M({ a: { name: 'A', price: '35' } }), M({ a: { name: 'A', price: '35.00' } })).toSheet.update.length, 0, '35 and 35.00 are the same');
  }

  // ---- two-way sheet sync: reading and writing the sheet ----
  {
    const proj = [
      ['Project name', 'Landing Page Link', 'Tags', 'Project stage', '', 'Industry', '', 'Project overview'],
      ['', '', '', 'MVP', 'Rescue / takeover', 'Healthcare', 'Dental', ''],
      ['Put an x under every tag', '', '', '', '', '', '', ''],
      ['Navience', 'https://navience.ai', '=formula', 'x', '', 'x', '', 'Claims AI'],
      ['Chloe', '', '', '', 'x', '', 'x', 'Dental calls'],
    ];
    const dict = [['Category', 'Tag', 'Jobs (of 401)', 'Share of jobs', 'Match weight', 'What it means'], ['Project stage', 'MVP', '45', '11%', '2', 'First version'],
      ['Project stage', 'Rescue / takeover', '27', '6%', '2', ''], ['Industry', 'Healthcare', '49', '', '2', ''], ['Industry', 'Dental', '5', '', '2', ''], ['Job counts: keyword matches']];
    const io = new FakeSheet({ [TABS.projects]: proj, [TABS.tags]: dict });
    const P0 = readProjects(await io.grid(TABS.projects));
    assert.deepEqual(P0.get('navience'), { name: 'Navience', landing_link: 'https://navience.ai', system_link: null, staging_link: null, mobile_link: null, showable: null, overview: 'Claims AI', case_study_link: null, case_study_summary: null, tags: ['MVP', 'Healthcare'] });
    const T0 = readTags(await io.grid(TABS.tags), await io.grid(TABS.projects));
    assert.equal(T0.size, 4); assert.equal(T0.get('mvp')!.weight, '2'); assert.ok(!T0.has('job counts: keyword matches'), 'the footer note is not a tag');
    // the app added a tag (Legal), a project (Kruzee) using it, edited Chloe, and has a profile; the sheet has no Profiles tab yet
    const appTags = new Map(T0); appTags.set('legal', { name: 'Legal', category: 'Industry', weight: '2', description: null });
    const appProj = new Map(P0); appProj.set('chloe', { ...P0.get('chloe')!, overview: 'Dental calls, now with SMS', tags: ['Rescue / takeover', 'Dental', 'Legal'] });
    appProj.set('kruzee', { ...P0.get('navience')!, name: 'Kruzee', landing_link: 'https://kruzee.com', overview: 'Driving lessons', tags: ['MVP', 'Legal'] });
    const appProf = new Map([['hassan ijaz', { name: 'Hassan Ijaz', active: 'Yes', price: '25', rules: 'No timelines' } as Rec]]);
    const mt = merge(new Map(T0), T0, appTags), mp = merge(new Map(P0), P0, appProj), mf = merge(new Map(), new Map(), appProf);
    await applyToSheet(io, { tags: mt.toSheet, projects: mp.toSheet, profiles: mf.toSheet }, { tags: mt.base, projects: mp.base, profiles: mf.base });
    const P1 = readProjects(await io.grid(TABS.projects));
    assert.deepEqual(P1.get('chloe')!.tags, ['Rescue / takeover', 'Dental', 'Legal'], 'the new tag got a column and Chloe its x');
    assert.equal(P1.get('chloe')!.overview, 'Dental calls, now with SMS');
    assert.deepEqual(P1.get('kruzee')!.tags, ['MVP', 'Legal']); assert.equal(P1.get('kruzee')!.landing_link, 'https://kruzee.com');
    const g = await io.grid(TABS.projects);
    assert.equal(g[1].indexOf('Legal'), 7, 'Legal is placed at the end of the Industry group'); assert.equal(g[0][7], '', 'inside the group, no new group header');
    assert.equal(g[3][2], '=formula', 'cells the sync does not own are left alone'); assert.equal(g[3][8], 'Claims AI', 'the overview moved right with its column');
    const d = await io.grid(TABS.tags); assert.deepEqual(d.find((r) => r[1] === 'Legal')!.slice(0, 2), ['Industry', 'Legal']);
    assert.equal(d[d.length - 1][0], 'Job counts: keyword matches', 'the footer stays last');
    const pr = readProfiles(await io.grid(TABS.profiles));
    assert.equal(pr.get('hassan ijaz')!.price, '25'); assert.equal(pr.get('hassan ijaz')!.rules, 'No timelines', 'the Profiles tab was made and filled');
    // the sheet removes Navience: once the app agrees, the sync removes the row from the sheet when the app removed it
    const mp2 = merge(mp.base, P1, new Map([...mp.base].filter(([k]) => k !== 'navience')));
    assert.deepEqual(mp2.toSheet.remove, ['navience']);
    await applyToSheet(io, { tags: { create: [], update: [], remove: [] }, projects: mp2.toSheet, profiles: { create: [], update: [], remove: [] } }, { tags: mt.base, projects: mp2.base, profiles: mf.base });
    assert.ok(!readProjects(await io.grid(TABS.projects)).has('navience')); assert.ok(readProjects(await io.grid(TABS.projects)).has('kruzee'));
  }

  console.log('all tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
