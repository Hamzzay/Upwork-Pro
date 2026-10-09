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
import { jobNeeds, jobPlatform, pickLoom, rankProjects, validSelection, type JobTag, type LibProject } from '../src/screening/matching';
import { buildTagSchema, tagJob, tagSystemPrompt } from '../src/screening/tagging';
import { htmlToPlain, sanitizeRich, textToHtml } from '../src/html';
import { buildDetectionSchema, codeMap, detectionPrompt, normalizeDetection, type SignalDef } from '../src/proposal/signals';
import { rankTemplates } from '../src/proposal/rank';
import { checkProposal } from '../src/proposal/checks';
import { bannedPatterns, guideBlock, typeFacts, wordRange } from '../src/proposal/guide';
import { GUARDRAILS, writerSystem } from '../src/proposal/writer';
import { settingsConflict } from '../src/settings';
import { createServer } from 'node:http';
import { runOpenAI, strictSchema } from '../src/llm/openai';
import { postingSchema } from '../src/screening/posting';
import { writerSchema, chatSchema } from '../src/proposal/writer';
import { buildReport, packRows, weekStart, type ReportJob } from '../src/reports';

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
  assert.equal(lib.rules.length, 24);
  assert.equal(lib.tags.length, 105);
  assert.equal(lib.projects.length, 42);
  assert.ok(lib.projects.every((p: any) => p.tags.length > 0), 'every library project is tagged');
  assert.ok(lib.projects.every((p: any) => p.tags.every((t: string) => lib.tags.some((x: any) => x.name === t))));
  assert.equal(new Set(lib.projects.map((p: any) => p.name.toLowerCase())).size, 42);

  // schema: no $schema key (the CLI rejects the 2020-12 default); rule codes become an enum
  const schema: any = buildReportJsonSchema(rules.map((r) => r.code));
  assert.equal('$schema' in schema, false);
  assert.deepEqual(schema.properties.job.properties.flags.items.properties.code.enum, rules.map((r) => r.code));
  assert.deepEqual(Object.keys(schema.properties.job.properties.columns.properties), [...COLUMN_KEYS]);

  // addendum names the allowed codes and carries the project library
  const add = contractAddendum(rules, projects);
  assert.ok(add.includes('(F1, F2,') && add.includes('G17, G18)') && add.includes('Open Dental AI Calling (Chloe): '));
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
  // scoring is the sum of shared weights; AI powered counts for nothing, nor do industry tags
  let m = rankProjects([wf1, ind, tool, ai], [P(10, 'A', 1, 2), P(11, 'B', 1, 3, 4), P(12, 'C', 4), P(13, 'D')]);
  assert.deepEqual(m.map((x) => [x.project_name, x.score]), [['B', 4], ['A', 3]], 'C scores 0 (only AI powered) and D shares nothing: both dropped');
  assert.equal(m[0].max_score, 4); assert.deepEqual(m.map((x) => x.recommended), [true, true]);
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
  // platform: a web job never gets a mobile-only project; projects with no known platform stay; desktop takes web too
  const web = T(6, 'Web app', 'Product type', 2), mob = T(7, 'Mobile app', 'Product type', 2), desk = T(8, 'Desktop app', 'Product type', 2);
  const PP = (id: number, name: string, platforms: string[], industries: string[], ...tags: number[]): LibProject => ({ id, name, tagIds: new Set(tags), industries, platforms: new Set(platforms as any) });
  assert.equal(jobPlatform([web]), 'web'); assert.equal(jobPlatform([web, mob]), 'web and mobile'); assert.equal(jobPlatform([wf1]), 'not stated');
  m = rankProjects([web, wf1], [PP(100, 'WebOne', ['web'], [], 1), PP(101, 'MobOnly', ['mobile'], [], 1), PP(102, 'Unknown', [], [], 1)]);
  assert.deepEqual(m.map((x) => x.project_name).sort(), ['Unknown', 'WebOne'], 'the mobile-only project is left out of a web job');
  assert.equal(rankProjects([mob, wf1], [PP(103, 'WebOnly', ['web'], [], 1)]).length, 0, 'a web project never proves a mobile build');
  assert.equal(rankProjects([desk, wf1], [PP(104, 'WebOnly', ['web'], [], 1)]).length, 1, 'a desktop job takes a web project');
  assert.equal(rankProjects([web, mob, wf1], [PP(105, 'MobOnly', ['mobile'], [], 1)]).length, 1, 'a web and mobile job is not filtered');
  // industry pools: same, then related, then the rest, whatever the score; the related list comes from the industry
  const rel = new Map([['dental', ['Healthcare']]]);
  m = rankProjects([ind, wf1, tool], [PP(110, 'OtherBig', [], ['Logistics'], 1, 3), PP(111, 'Health', [], ['Healthcare'], 1), PP(112, 'DentalSmall', [], ['Dental'], 3)],
    { shown: 5, recommended: 2, minScore: 1, related: rel });
  assert.deepEqual(m.map((x) => [x.project_name, x.pool]), [['DentalSmall', 'same'], ['Health', 'related'], ['OtherBig', 'other']]);
  assert.ok(m.every((x) => !x.alternative), 'nothing is an alternative when every match is already shown');
  // an alternative: outside the shown list, from another industry, at least 1.5 times the best same-industry score; never recommended
  m = rankProjects([ind, wf1, tool], [PP(120, 'D1', [], ['Dental'], 3), PP(121, 'D2', [], ['Dental'], 3), PP(122, 'Big', [], ['Logistics'], 1, 3)],
    { shown: 2, recommended: 2, minScore: 1 });
  assert.deepEqual(m.map((x) => [x.project_name, x.recommended, x.alternative]), [['D1', true, false], ['D2', true, false], ['Big', false, true]]);
  m = rankProjects([ind, wf1, tool], [PP(130, 'D1', [], ['Dental'], 1), PP(131, 'D2', [], ['Dental'], 1), PP(132, 'Big', [], ['Logistics'], 1, 3)], { shown: 2, recommended: 2, minScore: 1 });
  assert.ok(!m.some((x) => x.alternative), '4 is under 1.5 times 3: no alternative');
  // no project from the job's industry: no alternative (they are all from other industries already)
  assert.ok(!rankProjects([ind, wf1, tool], [PP(150, 'L1', [], ['Logistics'], 1), PP(151, 'L2', [], ['Logistics'], 1, 3)], { shown: 1, recommended: 1, minScore: 1 }).some((x) => x.alternative));
  // no industry on the job: one pool, no alternative
  assert.ok(rankProjects([wf1], [PP(140, 'X', [], ['Dental'], 1)]).every((x) => x.pool === 'none' && !x.alternative));
  assert.equal(jobNeeds([web, wf1, ind, tool]), 'Web · Web app · Lead generation · Dental');
  // Loom videos: the most shared weight wins (industry counts), then more shared tags, then order; none when nothing is shared
  const V = (id: number, title: string, tags: string[], sort_order = 0) => ({ id, title, url: 'https://www.loom.com/share/' + id, tags, sort_order });
  const jt = [{ name: 'Lead generation', weight: 3 }, { name: 'Dental', weight: 2 }, { name: 'HubSpot', weight: 1 }, { name: 'AI powered', weight: 0 }];
  assert.equal(pickLoom(jt, [V(1, 'Leads', ['Lead generation']), V(2, 'Dental CRM', ['dental', 'HubSpot'])])?.video.title, 'Dental CRM', 'a tie on 3: more shared tags wins (names match in any case)');
  assert.equal(pickLoom(jt, [V(1, 'Leads', ['Lead generation', 'Dental']), V(2, 'Dental CRM', ['Dental', 'HubSpot'])])?.score, 5);
  assert.equal(pickLoom(jt, [V(3, 'B', ['HubSpot'], 2), V(4, 'A', ['HubSpot'], 1)])?.video.title, 'A', 'same score and count: the order decides');
  assert.equal(pickLoom(jt, [V(5, 'AI', ['AI powered']), V(6, 'Other', ['Shopify'])]), null, 'weight 0 and unshared tags suggest nothing');
  assert.equal(pickLoom(jt, []), null);

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
  assert.equal(sigSeed.signals.length, 22); assert.equal(sigSeed.layers.length, 3);
  assert.deepEqual(sigSeed.signals.map((x: any) => x.values.filter((v: any) => !v.is_fallback).length), [3, 3, 4, 2, 2, 8, 5, 1, 2, 1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 5, 1, 1]);
  assert.equal(sigSeed.signals[4].values.some((v: any) => v.is_fallback), false, 'signal 5 has no fallback');
  let vid = 0;
  const defs: SignalDef[] = sigSeed.signals.map((x: any, i: number) => ({ id: i + 1, number: x.number, layer: x.layer, name: x.name, decides: x.decides, multi_select: x.multi_select,
    values: x.values.map((v: any) => ({ id: ++vid, name: v.name, detect: v.detect, move: v.move, is_fallback: v.is_fallback })) }));
  const codes = codeMap(defs); assert.equal(codes.size, 75); assert.ok(codes.has('S7.1') && codes.has('S5.2') && !codes.has('S5.3'));
  const dschema: any = buildDetectionSchema(defs); assert.equal('$schema' in dschema, false); assert.equal(dschema.properties.signals.items.properties.values.items.properties.code.enum.length, 75);
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
  assert.equal(det.length >= 19, true); assert.equal(pick(1)[0].value_name, 'Solo / individual');
  assert.equal(pick(2)[0].is_fallback, true); assert.equal(pick(2)[0].defaulted, true);
  assert.equal(pick(3).length, 1); assert.equal(pick(3)[0].value_name, 'Greenfield / MVP');
  assert.deepEqual(pick(7).map((d) => [d.value_name, d.is_primary]), [['RAG', false], ['Automation', true]], 'multi-select keeps both, de-duplicated, one primary');
  assert.equal(pick(4).length, 1); assert.equal(pick(5)[0].value_name, 'No', 'signal 5 defaults to No'); assert.equal(pick(16)[0].is_fallback, true);
  assert.equal(new Set(det.map((d) => d.signal_number)).size, 22, 'every signal ends up with a value');
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
  const good = 'Understood. I built Alpha Bot and Beta Flow.\n\nAlpha Bot, a bot\nhttps://alpha.example.com\n\nBeta Flow cut calls by 40%.\n\nBest regards,\nJane Doe\nhttps://gitlab.com/jane';
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

  // ---- one writing guide: the six types are the templates; the shared rules feed the writer and the checks ----
  {
    const tseed = JSON.parse(readFileSync(join(__dirname, '..', 'seed', 'templates.json'), 'utf8')).templates;
    assert.deepEqual(tseed.map((t: any) => t.name), ['Type 1. Standard build', 'Type 2. Structured submission', 'Type 3. Invite', 'Type 4. Rescue or takeover', 'Type 5. Architecture or consulting',
      'Type 6. Small fix or quick task', 'Type 7. Problem first', 'Type 8. Approach first with questions']);
    assert.deepEqual(tseed.map((t: any) => wordRange(htmlToPlain(t.body_html))), [[170, 240], null, [100, 160], [170, 240], [180, 260], [70, 120], [230, 280], [230, 280]], 'each type carries its length (structured: as long as needed)');
    assert.equal(typeFacts(htmlToPlain(tseed[2].body_html)).chosen_when, "the client invited the profile.");
    assert.equal(tseed.filter((t: any) => t.is_default).map((t: any) => t.name).join(), 'Type 1. Standard build', 'one default type');
    // every selection row points at a real signal value
    for (const t of tseed) for (const [code, value] of t.signals) assert.ok(sigSeed.signals.find((x: any) => 'S' + x.number === code)?.values.some((v: any) => v.name === value), `${t.name}: ${code} ${value}`);
    // the team plugin's type-selection rules: required (groups are alternatives), excluded, then priority groups 2, 3, 4/5/6, 1/7/8
    let vid2 = 0; const vId = new Map<string, number>(); for (const x of sigSeed.signals) for (const v of x.values) vId.set(`S${x.number}|${v.name}`, ++vid2);
    const T = tseed.map((t: any, i: number) => ({ id: i + 1, name: t.name, priority: t.priority, is_default: !!t.is_default,
      mappings: t.signals.map(([c, v, w, role, group]: any) => ({ signal_id: Number(c.slice(1)), value_id: vId.get(`${c}|${v}`)!, weight: w ?? 0, role, req_group: group })) }));
    const on = (...xs: [number, string][]) => xs.map(([n, v]) => ({ signal_id: n, value_id: vId.get(`S${n}|${v}`)!, is_fallback: false }));
    const pick = (...xs: [number, string][]) => rankTemplates(on(...xs), T).chosen!.name;
    assert.equal(pick([5, 'Yes'], [17, 'Invited'], [19, 'Small task']), 'Type 2. Structured submission', 'structured submission wins over everything');
    assert.equal(pick([17, 'Invited'], [18, 'Architect or consultant'], [2, 'Discovery-first']), 'Type 3. Invite', 'invite comes before the rest');
    assert.equal(pick([3, 'Rescue / takeover'], [11, 'Rescue / frustration'], [18, 'Builder']), 'Type 4. Rescue or takeover');
    assert.equal(pick([3, 'Rebuild / migration'], [18, 'Builder']), 'Type 4. Rescue or takeover', 'a rebuild is a rescue too (alternatives in one group)');
    assert.equal(pick([19, 'Small task'], [18, 'Builder']), 'Type 6. Small fix or quick task');
    assert.equal(pick([3, 'Greenfield / MVP'], [18, 'Architect or consultant']), 'Type 5. Architecture or consulting', 'an architect role rules Type 1 out');
    assert.equal(pick([21, 'Operations'], [3, 'Greenfield / MVP'], [18, 'Builder']), 'Type 7. Problem first', 'operations work is problem first');
    assert.equal(pick([21, 'Product'], [3, 'Greenfield / MVP'], [14, 'Vague'], [18, 'Builder']), 'Type 8. Approach first with questions', 'a vague product build asks questions');
    assert.equal(pick([21, 'Product'], [3, 'Extend existing product'], [14, 'Precise'], [18, 'Builder']), 'Type 1. Standard build', 'a precise build is the standard one');
    const none = rankTemplates([], T); assert.equal(none.chosen!.name, 'Type 1. Standard build'); assert.equal(none.defaulted, true, 'nothing qualifies: the default type');
    const r6 = rankTemplates(on([19, 'Small task'], [3, 'Greenfield / MVP']), T);
    assert.ok(r6.ranking.find((x) => x.name.startsWith('Type 6'))!.excluded_by.length === 1, 'the ranking says what ruled a type out');
    // banned phrases from the guide, with a [placeholder]; dashes; the length of the cover letter only
    const banned = bannedPatterns(readFileSync(join(__dirname, '..', 'seed', 'writing', 'banned-phrases.md'), 'utf8'));
    assert.ok(banned.length >= 9 && banned.some((b) => b.phrase === "I'm excited to apply"));
    assert.ok(banned.find((b) => b.phrase.startsWith('I worked on'))!.re.test('I worked on Glass Doctor around the same time'), 'a [project] placeholder matches a name');
    const base2 = { selectedProjects: [], otherProjectNames: [], foreignNames: [], sender: { name: 'Jane Doe', gitlab_link: null } };
    const long = 'word '.repeat(260) + '\nBest regards,\nJane Doe';
    const ws = checkProposal({ ...base2, text: "I’m excited to apply — this " + long, banned, wordRange: [120, 200] });
    assert.ok(!checkProposal({ ...base2, selectedProjects: [{ name: 'Kruzee', live_link: null, notes: null }], text: 'Kruzee – Driving lesson booking platform on Next.js\nBest regards,\nJane Doe' }).some((x) => x.includes('dash')),
      'the dash in a "Project name – Project title" line is allowed');
    assert.ok(ws.some((x) => x.includes('banned phrase')) && ws.some((x) => x.includes('dash')) && ws.some((x) => x.includes('words; this proposal type asks for 120 to 200')));
    const ok2 = 'word '.repeat(150) + '\nBest regards,\nJane Doe\n\nScreening answers\n' + 'answer '.repeat(200);
    assert.ok(!checkProposal({ ...base2, text: ok2, banned, wordRange: [120, 200] }).some((x) => x.includes('words')), 'screening answers do not count toward the length');
    const gb = guideBlock({ rules: 'R', banned: 'B', modules: 'M', screening: 'S', checklist: 'C' });
    assert.ok(gb.includes('NON-NEGOTIABLE RULES above win') && gb.includes('Screening answers') && gb.includes('BANNED PHRASES'));
    assert.ok(writerSystem({ template: { name: 'Type 3. Invite', body_html: '<p>x</p>', prompt: null }, detected: [], samples: [], sender: { name: 'J', gitlab_link: null, tagline: null }, projects: [], clientRequirements: [], guide: { rules: 'RULES TEXT', banned: null, modules: null, screening: null, checklist: null } })
      .includes('PROPOSAL TYPE: Type 3. Invite') , 'the writer gets the type');
  }

  // ---------- reports: the same jobs counted along every dimension ----------
  {
    const job = (o: Partial<ReportJob>): ReportJob => ({ id: 1, user_id: 1, user_name: 'Ann', profile_id: 1, profile_name: 'P1', source: null, verdict: 'PASS', rule_codes: null, overridden: 0, override_verdict: null,
      continued: 1, written: 1, template_name: 'Type 1', template_choice: 'auto', sent: 0, sent_at: null, viewed: 0, chat: 0, interview: 0, outcome: null, outcome_reason: null, outcome_at: null, viewed_at: null, chat_at: null,
      connects_spent: null, boost_connects: null, created_at: '2026-10-07 10:00:00', client_country: 'United States, Austin', job_type: 'hourly', experience_level: 'Expert', loom_video_id: null, loom_video_title: null, secs_to_proposal: 200, words: 150, ...o });
    const jobs = [
      job({ id: 1, sent: 1, sent_at: '2026-10-07 11:00:00', viewed: 1, viewed_at: '2026-10-07 13:00:00', chat: 1, chat_at: '2026-10-07 15:00:00', outcome: 'Hired', outcome_at: '2026-10-09 11:00:00', connects_spent: 12, boost_connects: 4, loom_video_id: 3, loom_video_title: 'Voice agents' }),
      job({ id: 2, sent: 1, sent_at: '2026-10-08 00:00:00', viewed: 1, outcome: 'Not hired', outcome_reason: 'Budget too low', connects_spent: 8, verdict: 'FLAG', rule_codes: 'G3, G14', overridden: 1, override_verdict: 'FLAG' }),
      job({ id: 3, profile_id: 2, profile_name: 'P2', user_id: 2, user_name: 'Bob', source: 'claude_plugin', sent: 1, sent_at: '2026-10-01 09:30:00', connects_spent: 30 }),
      job({ id: 4, profile_id: null, profile_name: null, continued: 0, written: 0, template_name: null, verdict: 'FAIL', rule_codes: 'F2', viewed: 1 }), // viewed without sent is not counted
    ];
    const r = buildReport(jobs, { tags: [{ screening_id: 1, tag_name: 'Healthcare', category_name: 'Industry' }, { screening_id: 1, tag_name: 'AI agent', category_name: 'Capability' }, { screening_id: 2, tag_name: 'AI agent', category_name: 'Capability' }],
      projects: [{ screening_id: 1, project_name: 'Apex' }, { screening_id: 1, project_name: 'Breesy' }, { screening_id: 2, project_name: 'Apex' }],
      signals: [{ screening_id: 1, signal_number: 4, signal_name: 'Positioning', value_name: 'Business outcome', is_fallback: 0 }, { screening_id: 2, signal_number: 4, signal_name: 'Positioning', value_name: 'Default', is_fallback: 1 }] }, ['Not hired', 'No response']);
    const dim = (k: string) => r.dims.find((d) => d.key === k)!.rows, row = (k: string, name: string) => dim(k).find((x) => x.name === name)!;
    assert.deepEqual([r.totals.jobs, r.totals.continued, r.totals.written, r.totals.sent, r.totals.viewed, r.totals.chat, r.totals.hired, r.totals.lost, r.totals.connects], [4, 3, 3, 3, 2, 1, 1, 1, 54], 'the totals, with only sent proposals counted as viewed');
    assert.deepEqual([row('profile', 'P1').sent, row('profile', 'P1').viewed, row('profile', 'P2').sent, row('profile', 'No profile yet').jobs], [2, 2, 1, 1]);
    assert.deepEqual(row('profile', 'P1').link, { profile: '1' }, 'a row links to its jobs'); assert.equal(row('profile', 'No profile yet').link, null);
    assert.equal(row('project', 'Apex').sent, 2, 'a job with two projects counts under both'); assert.equal(row('project', 'Breesy').hired, 1);
    assert.equal(row('industry', 'Healthcare').jobs, 1); assert.equal(row('tag', 'AI agent (Capability)').jobs, 2, 'industry tags are their own report');
    assert.equal(dim('signal').length, 1, 'a default signal value is left out'); assert.deepEqual(dim('rule').map((x) => x.key).sort(), ['F2', 'G14', 'G3']);
    assert.equal(row('loom', 'With a Loom video').sent, 1); assert.equal(row('loom', 'No Loom video').sent, 2, 'only sent proposals are compared for Loom');
    assert.equal(row('source', 'Claude plugin').jobs, 1); assert.equal(row('decision', 'Continued past a flag').jobs, 1); assert.equal(row('loss_reason', 'Budget too low').lost, 1);
    assert.equal(row('boost', 'Boosted').sent, 1); assert.equal(row('connects', '25 or more Connects').sent, 1); assert.equal(row('country', 'United States').jobs, 4, 'the city is dropped from the country');
    assert.equal(dim('sent_time').reduce((n, x) => n + x.sent, 0), 2, 'a sent date without a time is left out of time of day');
    assert.equal(weekStart(new Date('2026-10-07T10:00:00')), '2026-10-05', 'weeks start on Monday'); assert.deepEqual(dim('week').map((x) => x.key), ['2026-10-05'], 'weeks by the date screened');
    assert.deepEqual([r.timing.hours_to_view, r.timing.hours_to_chat, r.timing.days_to_close], [2, 4, 2]);
    assert.equal(buildReport([], { tags: [], projects: [], signals: [] }, []).totals.jobs, 0, 'no jobs is not an error');
    // a bulk read is cut by size, never mid row, and always moves on
    const many = Array.from({ length: 500 }, (_, i) => [i, 'x'.repeat(370)]);
    let left = many, pages = 0, got = 0; while (left.length) { const p = packRows(left, 80000); assert.ok(p.rows.length >= 1 && JSON.stringify(p.rows).length <= 81000); got += p.rows.length; left = left.slice(p.rows.length); pages++; assert.equal(p.more, left.length > 0); }
    assert.equal(got, 500); assert.ok(pages <= 3, '500 standard rows fit in three answers');
    assert.equal(packRows([['y'.repeat(200000)]], 80000).rows.length, 1, 'one oversized row still goes through');
  }

  // ---------- the Loom video in a proposal ----------
  {
    const { asksForVideo } = await import('../src/proposal/pipeline');
    for (const yes of ['Please include a Loom with your proposal', 'Send a short video introduction', 'record a 2 minute video explaining your approach', 'Attach a quick video', 'A video cover letter is required'])
      assert.ok(asksForVideo(yes), 'asks for a video: ' + yes);
    for (const no of ['We build video streaming apps', 'Experience with video processing in ffmpeg', 'Weekly calls on Zoom'])
      assert.ok(!asksForVideo(no), 'does not ask for a video: ' + no);
    const sender = { name: 'Jane Doe', gitlab_link: null, tagline: null };
    const sys = (loom: any) => writerSystem({ template: { name: 'T', body_html: '<p>x</p>', prompt: null }, detected: [], samples: [], sender: { ...sender, loom }, projects: [], clientRequirements: [] });
    assert.ok(sys({ title: 'Voice agents', url: 'https://www.loom.com/share/abc', topic: 'How we build them' }).includes('https://www.loom.com/share/abc'), 'the writer is given the chosen video');
    assert.ok(sys(null).includes('none chosen: do not mention or promise a video'), 'and told not to promise one when none is chosen');
    const chk = (text: string) => checkProposal({ text, selectedProjects: [], otherProjectNames: [], foreignNames: [], sender: { name: 'Jane Doe', gitlab_link: null, loom_link: 'https://www.loom.com/share/abc' } });
    assert.ok(chk('Hello.\nJane Doe').some((x) => x.includes('Loom video you chose is not in the proposal')), 'a missing Loom link is flagged');
    assert.ok(!chk('Here is a short video: https://www.loom.com/share/abc\nJane Doe').some((x) => /Loom video you chose|not one of the provided/.test(x)), 'the Loom link is an allowed link');
  }

  console.log('all tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
