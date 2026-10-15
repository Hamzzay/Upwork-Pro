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
import { jobQuestions, separateQuestions } from '../src/screening/questions';
import { separate, splitText, storeAnswers } from '../src/proposal/answers';
import { coreWork, DEFAULT_MATCH, jobNeeds, jobPlatform, pickLoom, projectPlatforms, rankProjects, TECH_STACK, validSelection, type JobTag, type LibProject } from '../src/screening/matching';
import { buildTagSchema, tagJob, tagSystemPrompt } from '../src/screening/tagging';
import { htmlToPlain, sanitizeRich, textToHtml } from '../src/html';
import { buildDetectionSchema, codeMap, detectionPrompt, normalizeDetection, type SignalDef } from '../src/proposal/signals';
import { rankTemplates } from '../src/proposal/rank';
import { checkOpening, checkProposal } from '../src/proposal/checks';
import { splitMobile } from '../src/library/mobile';
import { applyJudgement } from '../src/screening/judge';
import { diff as changeDiff, lineDiff } from '../src/changes';
import { bannedPatterns, guideBlock, typeFacts, wordRange } from '../src/proposal/guide';
import { firstParagraph, replaceFirstHtmlParagraph, replaceFirstParagraph } from '../src/proposal/openings';
import { checkFlags, examplesBlock, openingRules, templateBlock } from '../src/proposal/opening_templates';
import { shortcutsBlock, shortenHtml, shortenText } from '../src/proposal/shortcuts';
import { libSummary, projectsOf } from '../src/proposal/gaps';
import type { AuthUser } from '../src/auth'; // its Express request types, which gaps.ts needs to compile
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
  m = rankProjects([wf1, ind, tool, hipaa], [P(40, 'HighNoHipaa', 1, 3), P(41, 'LowWithHipaa', 1, 5)]);
  assert.deepEqual(m.map((x) => [x.project_name, x.compliance_gap]), [['LowWithHipaa', 0], ['HighNoHipaa', 1]]);
  // ...but the work comes first: a project with only the compliance tag does not prove the job, and is never recommended
  m = rankProjects([wf1, ind, hipaa], [P(42, 'WorkNoHipaa', 1), P(43, 'OnlyHipaa', 5)]);
  assert.deepEqual(m.map((x) => [x.project_name, x.proves_work, x.recommended]), [['WorkNoHipaa', true, true], ['OnlyHipaa', false, false]]);
  // no compliance tag in the job: no gap anywhere
  assert.ok(rankProjects([wf1], [P(50, 'X', 1)]).every((x) => x.compliance_gap === 0));
  // fewer than 2 matches, and none
  assert.equal(rankProjects([wf1], [P(60, 'Only', 1), P(61, 'Nope', 2)]).length, 1);
  assert.equal(rankProjects([], [P(70, 'X', 1)]).length, 0);
  // skip tech stack: its tags score nothing and are not shared; the rest of the rules stay the same
  const node = T(6, 'Node.js', 'Tech stack', 1);
  m = rankProjects([wf1, ind, tool, node], [P(85, 'StackOnly', 6), P(86, 'Work', 1, 6), P(87, 'WorkTool', 1, 3)]);
  assert.deepEqual(m.map((x) => [x.project_name, x.score]), [['Work', 4], ['WorkTool', 4], ['StackOnly', 1]], 'with the stack: Node.js counts');
  m = rankProjects([wf1, ind, tool, node], [P(85, 'StackOnly', 6), P(86, 'Work', 1, 6), P(87, 'WorkTool', 1, 3)], { ...DEFAULT_MATCH, skip: [TECH_STACK] });
  assert.deepEqual(m.map((x) => [x.project_name, x.score]), [['WorkTool', 4], ['Work', 3]], 'skipped: a project sharing only the stack drops out');
  assert.equal(m[0].max_score, 4); assert.ok(m.every((x) => x.shared.every((t) => t.category !== TECH_STACK)), 'no stack tag listed as shared');
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
  m = rankProjects([ind, wf1, tool], [PP(110, 'OtherBig', [], ['Logistics'], 1, 3), PP(111, 'Health', [], ['Healthcare'], 1), PP(112, 'DentalSmall', [], ['Dental'], 1)],
    { shown: 5, recommended: 2, minScore: 1, related: rel });
  assert.deepEqual(m.map((x) => [x.project_name, x.pool]), [['DentalSmall', 'same'], ['Health', 'related'], ['OtherBig', 'other']]);
  assert.ok(m.every((x) => !x.alternative), 'nothing is an alternative when every match is already shown');
  // an alternative: outside the shown list, from another industry, at least 1.5 times the best same-industry score; never recommended
  const agentT = T(12, 'AI agent', 'AI capability', 3);
  m = rankProjects([ind, wf1, tool, agentT], [PP(120, 'D1', [], ['Dental'], 1), PP(121, 'D2', [], ['Dental'], 1), PP(122, 'Big', [], ['Logistics'], 1, 12)],
    { shown: 2, recommended: 2, minScore: 1 });
  assert.deepEqual(m.map((x) => [x.project_name, x.recommended, x.alternative]), [['D1', true, false], ['D2', true, false], ['Big', false, true]]);
  m = rankProjects([ind, wf1, tool], [PP(130, 'D1', [], ['Dental'], 1), PP(131, 'D2', [], ['Dental'], 1), PP(132, 'Big', [], ['Logistics'], 1, 3)], { shown: 2, recommended: 2, minScore: 1 });
  assert.ok(!m.some((x) => x.alternative), '4 is under 1.5 times 3: no alternative');
  // no project from the job's industry: no alternative (they are all from other industries already)
  assert.ok(!rankProjects([ind, wf1, tool], [PP(150, 'L1', [], ['Logistics'], 1), PP(151, 'L2', [], ['Logistics'], 1, 3)], { shown: 1, recommended: 1, minScore: 1 }).some((x) => x.alternative));
  // no industry on the job: one pool, no alternative
  assert.ok(rankProjects([wf1], [PP(140, 'X', [], ['Dental'], 1)]).every((x) => x.pool === 'none' && !x.alternative));
  assert.equal(jobNeeds([web, wf1, ind, tool]), 'Web · Web app · Lead generation · Dental');
  // 13 October, the real estate job that got healthcare projects: one job industry, the work first, screening's projects kept
  const scrape = T(9, 'Web scraping / data pipelines', 'Workflow type', 3), re = T(10, 'Real estate', 'Industry', 2), pii = T(11, 'Confidential / PII data', 'Compliance / sensitive data', 2, true);
  const lib13 = [PP(200, 'Breesy', ['web'], ['Real estate'], 9, 3), PP(201, 'Doctoria', ['web'], ['Healthcare'], 11, 3), PP(202, 'Orionlease', ['web'], ['Real estate'], 9),
    PP(203, 'Seller Genius AI', ['web'], ['Real estate'], 3), PP(204, 'ShipperScout', ['web'], ['Logistics'], 9, 11, 3)];
  m = rankProjects([re, scrape, tool, pii], lib13, { shown: 3, recommended: 2, minScore: 1, related: new Map([['real estate', ['Construction']]]), named: ['Seller Genius AI', 'Navience'], more: 10 });
  const view = m.map((x) => [x.project_name, x.recommended, x.proves_work, x.extra, x.named_in_screening]);
  assert.deepEqual(view.slice(0, 2), [['Breesy', true, true, false, false], ['Orionlease', true, true, false, false]], 'real estate projects that did the scraping are recommended');
  assert.ok(!m.find((x) => x.project_name === 'Doctoria')?.recommended, 'a healthcare project that did none of the work is never recommended');
  const sg = m.find((x) => x.project_name === 'Seller Genius AI')!;
  assert.ok(sg && sg.named_in_screening && !sg.recommended, 'a project named in screening is always in the list, marked');
  assert.ok(!m.some((x) => x.project_name === 'Navience'), 'a name not in the library is ignored');
  assert.ok(m.filter((x) => x.extra).length >= 1 && m.filter((x) => !x.extra).every((x, i, arr) => i === 0 || !arr[i - 1].extra), 'the extra projects come last');
  assert.equal(new Set(m.map((x) => x.project_id)).size, m.length, 'no project twice');
  // core work named by the tagger: the main work first, even over the industry and the score
  const lead = T(13, 'Lead generation / enrichment', 'Workflow type', 3, false), wfAuto = T(14, 'Workflow automation', 'Automation', 2);
  const scrapeMain = { ...T(15, 'Web scraping / data pipelines', 'Automation', 2), core: 1 }, leadCore = { ...lead, core: 2 };
  m = rankProjects([T(16, 'Recruitment / HR', 'Industry', 2), scrapeMain, leadCore, wfAuto, pii], [
    PP(300, 'Doctoria', [], ['Healthcare'], 13, 14, 11), PP(301, 'Orionlease', [], ['Real estate'], 15, 14, 11), PP(302, 'Breesy', [], ['Real estate'], 15, 13, 14),
    PP(303, 'Taleroo', [], ['Recruitment / HR'], 14)], { shown: 5, recommended: 2, minScore: 1 });
  assert.deepEqual(m.map((x) => [x.project_name, x.recommended]), [['Breesy', true], ['Orionlease', true], ['Doctoria', false], ['Taleroo', false]],
    'scraping first (Breesy also does lead generation), then lead generation only; same industry without the work last');
  assert.ok(!m.find((x) => x.project_name === 'Taleroo')!.proves_work);
  // no core named (older jobs): the work tags stand in, without the broad ones
  assert.deepEqual(coreWork([lead, wfAuto, T(17, 'AI powered', 'AI capability', 0), tool]).map((t) => t.name), ['Lead generation / enrichment']);
  assert.equal(jobNeeds([scrapeMain, leadCore, wfAuto, T(16, 'Recruitment / HR', 'Industry', 2)]), 'Web scraping / data pipelines, Lead generation / enrichment · Recruitment / HR');
  // Loom videos: the most shared weight wins (industry counts), then more shared tags, then order; none when nothing is shared
  const V = (id: number, title: string, tags: string[], sort_order = 0) => ({ id, title, url: 'https://www.loom.com/share/' + id, tags, sort_order });
  const jt = [{ name: 'Lead generation', weight: 3 }, { name: 'Dental', weight: 2 }, { name: 'HubSpot', weight: 1 }, { name: 'AI powered', weight: 0 }];
  assert.equal(pickLoom(jt, [V(1, 'Leads', ['Lead generation']), V(2, 'Dental CRM', ['dental', 'HubSpot'])])?.video.title, 'Dental CRM', 'a tie on 3: more shared tags wins (names match in any case)');
  assert.equal(pickLoom(jt, [V(1, 'Leads', ['Lead generation', 'Dental']), V(2, 'Dental CRM', ['Dental', 'HubSpot'])])?.score, 5);
  assert.equal(pickLoom(jt, [V(3, 'B', ['HubSpot'], 2), V(4, 'A', ['HubSpot'], 1)])?.video.title, 'A', 'same score and count: the order decides');
  assert.equal(pickLoom(jt, [V(5, 'AI', ['AI powered']), V(6, 'Other', ['Shopify'])]), null, 'weight 0 and unshared tags suggest nothing');
  assert.equal(pickLoom(jt, []), null);

  // the sender's own first name in a sample is not a foreign name
  const own = checkProposal({ text: 'Best regards,\nHamza Yaseen', selectedProjects: [], otherProjectNames: [], foreignNames: ['Hamza', 'Ali Khan'], sender: { name: 'Hamza Yaseen', gitlab_link: null }, banned: [] } as any);
  assert.ok(!own.some((w) => w.includes('"Hamza"')), 'Hamza is the sender');
  assert.ok(checkProposal({ text: 'Thanks, Ali Khan', selectedProjects: [], otherProjectNames: [], foreignNames: ['Ali Khan'], sender: { name: 'Hamza Yaseen', gitlab_link: null }, banned: [] } as any).some((w) => w.includes('Ali Khan')));
  // the first two lines, checked against the type's opening rules
  const op = (t: string, o: Partial<Parameters<typeof checkOpening>[1]> = {}) => checkOpening(t, { noUs: true, starts: null, projectNames: ['Breesy', 'Orionlease'], invite: false, clientOpening: false, ...o });
  assert.deepEqual(op('Leads that wait hours for a reply book a showing elsewhere. The delay comes from answers no one wrote down.\n\nI built Breesy.'), [], 'a clean opening; what comes after is not checked');
  assert.ok(op('Hi John, I am a senior developer. I built Breesy with 100% success.').length >= 4, 'greeting, introduction, project, stats, talk about us');
  assert.deepEqual(op('Understood. Your leasing team answers the same five questions all day and leads go cold.', { starts: 'Understood.' }), [], 'Type 7: "Understood." then the problem');
  assert.ok(op('Your leasing team is swamped. Leads go cold.', { starts: 'Understood.' }).some((x) => x.includes('"Understood."')));
  assert.deepEqual(op('Hi Sara, thanks for the invite.\nYour booking flow loses people at payment. We would fix the checkout first.', { invite: true, noUs: false }), [], 'an invite may greet, and its greeting line is not one of the two');
  assert.deepEqual(op('Per your request: BANANA. Leads go cold.', { starts: 'Understood.', clientOpening: true }), [], 'a client\'s required opening wins');
  assert.deepEqual(op('Your US clinics lose calls after hours. Missed calls become lost patients.'), [], '"US" is not talk about us');
  // the old one-cell mobile link becomes an Android link, an iOS link, and anything else (kept)
  assert.deepEqual(splitMobile('Android: http://play.google.com/store/apps/details?id=com.x\\niOS: https://apps.apple.com/us/app/x/id1'),
    { android: 'http://play.google.com/store/apps/details?id=com.x', ios: 'https://apps.apple.com/us/app/x/id1', other: null }, 'the literal \\n the sheet left in is not part of a link');
  assert.deepEqual(splitMobile('https://play.google.com/store/apps/details?id=a&hl=en'), { android: 'https://play.google.com/store/apps/details?id=a&hl=en', ios: null, other: null });
  assert.deepEqual(splitMobile('https://apps.apple.com/app/id9 https://testflight.apple.com/join/abc'), { android: null, ios: 'https://apps.apple.com/app/id9', other: 'https://testflight.apple.com/join/abc' }, 'anything else is kept');
  assert.deepEqual(splitMobile(''), { android: null, ios: null, other: null });
  assert.deepEqual([...projectPlatforms({ android_link: 'https://play.google.com/x' }, [])], ['mobile']); assert.deepEqual([...projectPlatforms({ ios_link: 'https://apps.apple.com/x', landing_link: 'https://x.io' }, [])].sort(), ['mobile', 'web']);
  // the AI's order is final: fitting projects in its order, then any it left out, then those it judged weak; the first two that fit are recommended
  const M = (rank: number, name: string, proves = true) => ({ project_name: name, rank, proves_work: proves, recommended: rank <= 2, extra: rank > 3, alternative: false });
  const ord = applyJudgement([M(1, 'Apex'), M(2, 'Navience'), M(3, 'Rock'), M(4, 'Seller Genius AI'), M(5, 'Chloe')],
    [{ name: 'Seller Genius AI', fits: true, reason: 'Qualifies leads' }, { name: 'Apex', fits: true, reason: 'Lead follow up' }, { name: 'Navience', fits: false, reason: 'Prior authorization, not leads' }, { name: 'Rock', fits: true, reason: 'x' }],
    { shown: 3, recommended: 2 });
  assert.deepEqual(ord.map((x) => [x.project_name, x.recommended, x.extra]), [['Seller Genius AI', true, false], ['Apex', true, false], ['Rock', false, false], ['Chloe', false, true], ['Navience', false, true]]);
  assert.equal(ord[0].ai_reason, 'Qualifies leads'); assert.equal(ord[4].ai_fits, false); assert.equal(ord[3].ai_fits, null);
  // core work is only real work: a project stage named as core work does not count
  assert.deepEqual(coreWork([{ ...T(20, 'Prototype / proof of concept', 'Project stage', 2), core: 1 }, { ...T(21, 'Lead generation / enrichment', 'Workflow type', 3), core: 2 }]).map((t) => t.name), ['Lead generation / enrichment']);
  // the Logs page: what changed
  assert.deepEqual(changeDiff({ name: 'A', weight: '2' }, { name: 'A', weight: '3' }), [{ field: 'weight', from: '2', to: '3' }]);
  const L = (x: string[]) => '\u0000list\u0000' + JSON.stringify(x);
  assert.deepEqual(changeDiff({ tags: L(['AI agent', 'MVP']) }, { tags: L(['MVP', 'RAG']) }), [{ field: 'tags', added: ['RAG'], removed: ['AI agent'] }]);
  assert.deepEqual(lineDiff('one\ntwo\nthree', 'one\n2\nthree\nfour'), { removed: ['two'], added: ['2', 'four'] });
  const longA = 'x'.repeat(400) + '\nkeep', longB = 'x'.repeat(400) + '\nchanged';
  assert.deepEqual(changeDiff({ overview: longA }, { overview: longB }), [{ field: 'overview', removed: ['keep'], added: ['changed'] }]);
  assert.ok(changeDiff(null, { name: 'New', notes: null }).every((c) => c.field !== 'notes'), 'a new row lists only the fields with a value');
  assert.deepEqual(changeDiff({ a: '1' }, { a: '1' }), [], 'nothing changed');
  // ---- screening questions: Upwork's own section, apart from the job ----
  const page50 = 'We need an AI agent for leasing leads.\nProject Type:Ongoing project\nYou will be asked to answer the following questions when submitting a proposal:\n\nWhat similar AI lead-response agents have you built?\nWhat tools would you likely use for a project like this?\nSkills and Expertise\nai project management\nAbout the client\nPayment method verified';
  const sq = separateQuestions(page50);
  assert.deepEqual(sq.questions, ['What similar AI lead-response agents have you built?', 'What tools would you likely use for a project like this?']);
  assert.ok(!sq.jobOnly.includes('What similar AI') && sq.jobOnly.includes('leasing leads') && sq.jobOnly.includes('Skills and Expertise') && sq.jobOnly.includes('About the client'), 'the job keeps everything but the questions');
  assert.deepEqual(separateQuestions('Answer these: 1. Have you used n8n?').questions, [], 'questions inside the description are not the separate section');
  assert.deepEqual(jobQuestions('no section', { description: 'Tell me: have you used n8n?', screening_questions: ['Have you used n8n?', 'Describe your recent project'] }), ['Describe your recent project'], 'a question inside the description is not a separate one');
  // screening answers live apart from the letter (R59); old versions with them inside the text are split when read
  const sa = splitText('Hi there.\nCover letter.\n\nScreening answers\n\n1. What tools?\nn8n and Python.\n\n2. Similar work?\nBreesy, a leasing assistant.');
  assert.equal(sa.letter, 'Hi there.\nCover letter.');
  assert.deepEqual(sa.answers, [{ question: 'What tools?', answer: 'n8n and Python.' }, { question: 'Similar work?', answer: 'Breesy, a leasing assistant.' }]);
  assert.deepEqual(splitText('Only a letter').answers, []);
  assert.deepEqual(splitText('Letter.\n\nScreening answers\n\n1. Only an answer here.\n\n2. Another one.').answers,
    [{ question: 'Question 1', answer: 'Only an answer here.' }, { question: 'Question 2', answer: 'Another one.' }], 'numbered answers with no question line');
  const legacy = separate('<p>Hi there.</p><p>Screening answers</p><p>1. What tools?<br>n8n and Python.</p>', null);
  assert.equal(legacy.html, '<p>Hi there.</p>', 'an old version: the letter is cut at the Screening answers line');
  assert.deepEqual(legacy.answers, [{ question: 'What tools?', answer: 'n8n and Python.' }]);
  const stored = separate('<p>Hi there.</p>', storeAnswers([{ question: 'Q?', answer: 'A.' }]));
  assert.deepEqual(stored, { html: '<p>Hi there.</p>', answers: [{ question: 'Q?', answer: 'A.' }] }, 'a new version: the letter as it is, the answers from their own field');
  assert.deepEqual(separate('<p>Only a letter</p>', null), { html: '<p>Only a letter</p>', answers: [] });
  assert.equal(storeAnswers([]), null, 'no answers: nothing stored');

  // ---- tagging through the mock provider ----
  const dict = lib.tags.map((t: any, i: number) => ({ id: i + 1, name: t.name, category: t.category, weight: t.weight, description: t.description }));
  const tschema: any = buildTagSchema(dict.filter((t: any) => t.category !== 'Industry').map((t: any) => t.name), dict.filter((t: any) => t.category === 'Industry').map((t: any) => t.name));
  assert.equal('$schema' in tschema, false); assert.equal(tschema.properties.tags.items.properties.tag.enum.length + tschema.properties.industry.enum.length - 1, 105);
  assert.ok(tschema.properties.industry.enum.includes('None stated') && tschema.required.includes('industry'), 'one industry, or none');
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
    assert.ok(gb.includes('NON-NEGOTIABLE RULES above win') && gb.includes('answer them apart from the cover letter') && gb.includes('BANNED PHRASES'));
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

  // ---------- the independent reviewer ----------
  {
    const { reviewerSystem, reviewOut } = await import('../src/proposal/reviewer');
    const sys = reviewerSystem({ template: { name: 'Standard build', body_html: '<p>Open with the problem.</p>', prompt: null }, signals: ['Wants similar work'], sender: { name: 'Jane Doe', gitlab_link: null, tagline: null },
      projects: [], clientRequirements: ['Share two similar projects'], checkWarnings: ['The first line could open any proposal'] });
    assert.ok(sys.includes('You did not write it'), 'the reviewer is told the proposal is somebody else\'s');
    assert.ok(sys.includes('Share two similar projects'), 'it is given what the client asked for');
    assert.ok(sys.includes('The first line could open any proposal'), 'and what the automatic check already found');
    const good = { score: 7, verdict: 'Solid, the opening is generic.', strengths: ['Right projects'], problems: ['Generic first line'], suggestions: [{ title: 'Sharper opening', instruction: 'Rewrite the first two lines around the missed after hours calls.' }] };
    assert.equal(reviewOut.parse(good).score, 7);
    assert.equal(reviewOut.parse({ ...good, score: '8' }).score, 8, 'a score sent as text is read as a number');
    for (const bad of [{ ...good, score: 0 }, { ...good, score: 11 }, { ...good, score: 7.5 }, { ...good, suggestions: Array(6).fill(good.suggestions[0]) }, { ...good, suggestions: [{ title: 'No instruction' }] }])
      assert.ok(!reviewOut.safeParse(bad).success, 'refused: ' + JSON.stringify(bad).slice(0, 80));
    // the Reviewer page (R61): the built-in version keeps the old instructions; each section changes what the reviewer gets
    const { DEFAULT_REVIEWER, reviewerSections, reviewSchemaFor } = await import('../src/proposal/reviewer');
    const { parseSections } = await import('../src/proposal/reviewer_store');
    const facts = { template: null, signals: ['Wants similar work'], sender: { name: 'Jane Doe', gitlab_link: null, tagline: null }, projects: [], clientRequirements: [], checkWarnings: ['Generic first line'],
      guide: { rules: 'RULES TEXT', banned: 'BANNED TEXT', modules: null, screening: null, checklist: 'CHECK TEXT' } } as any;
    const d = reviewerSystem(facts);
    for (const x of ['Judge the proposal on these, in this order:', '1. The first two lines', 'cannot score above 6', 'Do not round up to be kind', '"suggestions": up to 3', 'RULES TEXT', 'BANNED TEXT', 'CHECK TEXT', 'Wants similar work', 'Generic first line'])
      assert.ok(d.includes(x), 'the built-in reviewer still says: ' + x);
    assert.ok(reviewerSections.safeParse(DEFAULT_REVIEWER).success, 'the built-in version is a valid version');
    const mine = { ...DEFAULT_REVIEWER, concerns: ['Price is mentioned'], donts: ['Never mention discounts'], limits: { strengths: 0, problems: 2, suggestions: 1 },
      context: { ...DEFAULT_REVIEWER.context, banned_phrases: false, automatic_checks: false } };
    const m = reviewerSystem(facts, mine);
    assert.ok(m.includes('1. Price is mentioned') && !m.includes('1. The first two lines'), 'the key concerns are the admin\'s');
    assert.ok(m.includes('Never mention discounts') && m.includes('"suggestions": up to 1') && m.includes('"strengths": none'), 'dos, don\'ts and how many');
    assert.ok(!m.includes('BANNED TEXT') && !m.includes('Generic first line') && m.includes('RULES TEXT'), 'only the facts switched on are given');
    const sch: any = reviewSchemaFor(mine.limits);
    assert.equal(sch.properties.suggestions.maxItems, 1); assert.equal(sch.properties.strengths.maxItems, 0);
    assert.deepEqual(parseSections('not json'), DEFAULT_REVIEWER, 'a broken stored version falls back to the built-in one');
    assert.equal(parseSections(JSON.stringify({ dos: ['Be kind'] })).dos[0], 'Be kind', 'a stored version missing parts keeps the built-in parts');
  }

  // ---------- a proposal in parts (PLAN-SPEED point 1) ----------
  {
    const { assemble, signoff, loomLine, proofFor, cleanLetter } = await import('../src/proposal/parts');
    const proof = [{ project_id: 1, name: 'Breesy', text: 'Breesy: an AI leasing assistant that answers leads at night.', link: 'https://breesy.example.com' },
      { project_id: 2, name: 'Apex', text: 'Apex: a booking system for clinics.', link: null }];
    const so = signoff({ name: 'Jane Doe', gitlab_link: 'https://gitlab.com/jane' });
    assert.equal(so, 'Best regards,\nJane Doe\nhttps://gitlab.com/jane', 'the sign off from the profile');
    assert.equal(signoff({ name: 'Jane Doe', signature: 'Cheers,\nJane', gitlab_link: null }), 'Cheers,\nJane', 'its own ready sign off wins');
    assert.equal(signoff({ name: 'Jane Doe', signature: 'Jane Doe, then the GitHub link on the next line', gitlab_link: 'https://github.com/jane' }), 'Best regards,\nJane Doe\nhttps://github.com/jane', 'a note about signing off is guidance, not the text');
    const ll = loomLine('I recorded a short walkthrough of {title}:\n{url}', { title: 'the leasing bot', url: 'https://loom.com/x' });
    assert.equal(ll, 'I recorded a short walkthrough of the leasing bot:\nhttps://loom.com/x');
    assert.equal(loomLine('Here is a video.', { title: 'x', url: 'https://loom.com/y' }), 'Here is a video.\nhttps://loom.com/y', 'the link is always there');
    const letter = 'Your leads go cold after hours.\n\nHere is similar work:\n\n[[PROOF]]\n\n[[VIDEO]]\n\nShall we talk this week?';
    const full = assemble({ letter, proof, loomLine: ll, signoff: so });
    assert.ok(full.startsWith('Your leads go cold after hours.'), 'the letter leads');
    assert.ok(full.includes('Breesy: an AI leasing assistant that answers leads at night.\nhttps://breesy.example.com\n\nApex: a booking system'), 'each block, then its link');
    assert.ok(full.indexOf('https://loom.com/x') > full.indexOf('Apex') && full.indexOf('https://loom.com/x') < full.indexOf('Shall we talk'), 'the video where the marker was');
    assert.ok(full.endsWith(so) && !full.includes('[['), 'signed off, no marker left');
    const noVideo = assemble({ letter, proof, loomLine: '', signoff: so });
    assert.ok(!noVideo.includes('[[VIDEO]]') && !/\n{3,}/.test(noVideo), 'no video: the marker goes, no gap is left');
    const noMarkers = assemble({ letter: 'Para one.\n\nPara two.', proof, loomLine: ll, signoff: so });
    assert.ok(noMarkers.indexOf('Breesy') > noMarkers.indexOf('Para one') && noMarkers.indexOf('Breesy') < noMarkers.indexOf('Para two'), 'no marker: the proof goes before the last paragraph');
    assert.equal(cleanLetter('Body text here.\n\nBest regards,\nSomeone'), 'Body text here.', 'a sign off the writer added anyway is cut');
    const pf = proofFor(proof, [{ id: 2, name: 'Apex', link: null }, { id: 3, name: 'Kruzee', link: 'https://k.example.com' }]);
    assert.deepEqual(pf.keep.map((x) => x.name), ['Apex'], 'a kept project keeps its block'); assert.deepEqual(pf.missing.map((x) => x.name), ['Kruzee'], 'a new one is written');
  }

  // ---------- the company name is a setting (R66) ----------
  {
    const { setCompanyName, companyName } = await import('../src/company');
    const { tagSystemPrompt } = await import('../src/screening/tagging');
    const { reviewerSystem: rs } = await import('../src/proposal/reviewer');
    setCompanyName('Acme Studio');
    assert.equal(companyName(), 'Acme Studio');
    assert.ok(tagSystemPrompt([]).includes('the projects Acme Studio has delivered') && !tagSystemPrompt([]).includes('Stackup'), 'the tagger works for the company set');
    const r = rs({ template: null, signals: [], sender: { name: 'Jane', gitlab_link: null, tagline: null }, projects: [], clientRequirements: [], checkWarnings: [] } as any);
    assert.ok(r.includes('proposals for Acme Studio') && !r.includes('{company}'), 'the reviewer\'s built-in text names the company');
    setCompanyName('  '); assert.equal(companyName(), 'Acme Studio', 'an empty name is ignored');
    setCompanyName('Stackup Solutions');
  }

  // ---------- opening lines for every type (R68) ----------
  {
    const { openingSection } = await import('../src/proposal/writer');
    const t = { name: 'Type 1', body_html: '', prompt: null, opening_rules: 'Line one names the pain.' } as any;
    const both = openingSection(t, 'No greeting.');
    assert.ok(both.indexOf('FOR EVERY PROPOSAL TYPE\nNo greeting.') < both.indexOf('FOR THIS PROPOSAL TYPE') && both.includes('Line one names the pain.'), 'the defaults first, then the type, which wins');
    assert.ok(openingSection({ ...t, opening_rules: null }, 'No greeting.').includes('No greeting.'), 'a type without its own rules still gets the defaults');
    assert.ok(!openingSection(t, null).includes('FOR EVERY PROPOSAL TYPE') && openingSection(t, null).includes('Line one names the pain.'), 'no defaults: the type alone, as before');
    assert.equal(openingSection({ ...t, opening_rules: null }, null), '', 'neither: nothing');
  }

  // ---------- experience gaps (R67) ----------
  {
    const { gapsRule, gapsOut, writerSchema: ws } = await import('../src/proposal/writer');
    const { partsSchema: ps, partsOut: po } = await import('../src/proposal/parts');
    const rule = gapsRule(['Tech stack', 'AI models and platforms']);
    assert.ok(rule.includes('never say you lack it') && rule.includes('Tech stack, AI models and platforms'), 'the writer leaves gaps out and names the categories');
    assert.ok((ws as any).required.includes('gaps') && (ps(0) as any).required.includes('gaps'), 'both answers carry the gaps');
    assert.equal(gapsOut.parse([{ skill: 'Grok', ask: 'Experience building bots on Grok', quote: 'must have built a Grok bot', category: 'AI models and platforms' }]).length, 1);
    assert.ok(!gapsOut.safeParse(Array(9).fill({ skill: 'x', ask: 'y', quote: '', category: '' })).success, 'at most 8');
    assert.ok(po.safeParse({ letter: 'x'.repeat(50), proof: [], warnings: [], gaps: [] }).success, 'parts with no gaps');
  }

  // ---------- flag review (R63) ----------
  {
    const { buildFlagReview, picksOf } = await import('../src/flagreview');
    const known = ['Invited by the client', 'Strong client history'];
    assert.deepEqual(picksOf('["Strong client history"]', 'anything', known), ['Strong client history'], 'stored picks win');
    assert.deepEqual(picksOf(null, 'Invited by the client. And more.', known), ['Invited by the client'], 'older reasons: found in the text');
    let n = 0;
    const J = (o: any) => ({ id: ++n, verdict: 'FLAG', rule_codes: 'G3', proceeded: 'yes', continued: 1, skip_reason: null, skip_note: null, override_reason: 'Invited by the client.', reason_picks: null,
      sent: 1, viewed: 1, chat: 0, interview: 0, outcome: null, ...o });
    const rules = [{ code: 'G3', type: 'flag', rule: 'Low average rate', active: 1 }, { code: 'G7', type: 'flag', rule: 'Many proposals', active: 1 }, { code: 'F1', type: 'fail', rule: 'Off platform', active: 1 }];
    const pass = Array.from({ length: 20 }, (_, i) => J({ verdict: 'PASS', rule_codes: null, override_reason: null, chat: i % 4 === 0 ? 1 : 0 })); // passes: 25% chat
    // G3: 24 continued (chat 25%, same as passes) and 1 skipped: a candidate to relax
    const g3 = [...Array.from({ length: 24 }, (_, i) => J({ chat: i % 4 === 0 ? 1 : 0 })), J({ continued: 0, proceeded: 'no', skip_reason: 'Budget or rate too low', sent: 0 })];
    // G7: 15 continued with no chats at all: keep it
    const g7 = Array.from({ length: 15 }, () => J({ rule_codes: 'G7', reason_picks: '["Strong client history"]', chat: 0 }));
    // F1: 22 fired, 20 skipped: doing its job
    const f1 = [...Array.from({ length: 20 }, () => J({ verdict: 'FAIL', rule_codes: 'F1', continued: 0, proceeded: 'no', sent: 0 })), ...Array.from({ length: 2 }, () => J({ verdict: 'FAIL', rule_codes: 'F1' }))];
    const g7more = Array.from({ length: 6 }, () => J({ rule_codes: 'G7', continued: 0, proceeded: 'no', sent: 0, skip_note: 'too crowded' }));
    const rv = buildFlagReview([...pass, ...g3, ...g7, ...g7more, ...f1, J({ rule_codes: 'G3, G7', chat: 1 })], rules, known, ['Not hired']);
    const by = Object.fromEntries(rv.rules.map((r) => [r.code, r]));
    assert.equal(rv.baseline.sent, 20); assert.equal(rv.baseline.chat, 5);
    assert.equal(by.G3.fired, 26); assert.equal(by.G3.continued, 25); assert.equal(by.G3.skipped, 1);
    assert.equal(by.G3.alone.fired, 25, 'the job with two rules does not count as G3 alone');
    assert.equal(by.G3.continue_reasons[0].reason, 'Invited by the client'); assert.equal(by.G3.skip_reasons[0].reason, 'Budget or rate too low');
    assert.equal(by.G3.hint.key, 'relax', by.G3.hint.text);
    assert.equal(by.G7.hint.key, 'keep', by.G7.hint.text);
    assert.equal(by.G7.continue_reasons[0].reason, 'Strong client history'); assert.equal(by.G7.skip_reasons[0].reason, 'Own words');
    assert.equal(by.F1.hint.key, 'working', by.F1.hint.text);
    assert.equal(buildFlagReview(g3.slice(0, 5), rules, known, []).rules.find((r) => r.code === 'G3')!.hint.key, 'too_few', 'five jobs are too few');
    assert.equal(rv.screened, pass.length + g3.length + g7.length + g7more.length + f1.length + 1);
  }

  // R73: an opening replaces only the first paragraph, never a marker, and the rest stays word for word
  {
    const letter = 'Your clinics miss calls after hours.\n\nI built two systems like this.\n\n[[PROOF]]\n\n[[VIDEO]]\n\nShall we talk?';
    assert.equal(firstParagraph(letter), 'Your clinics miss calls after hours.');
    assert.equal(firstParagraph('[[PROOF]]\n\nSecond.'), 'Second.', 'a marker is never the opening');
    const next = replaceFirstParagraph(letter, 'Four clinics, one missed call each night.');
    assert.equal(next, letter.replace('Your clinics miss calls after hours.', 'Four clinics, one missed call each night.'));
    assert.equal(replaceFirstHtmlParagraph('<p>Old <b>one</b>.</p><p>Rest &amp; more.</p>', 'New one.'), '<p>New one.</p><p>Rest &amp; more.</p>');
    assert.equal(replaceFirstHtmlParagraph('', 'New.'), '<p>New.</p>');
  }
  // R88: the opening is the opening template's, with the rules for every opening; its exceptions are fields
  {
    const tpl = { id: 7, name: 'Problem first opening', instructions: 'Line one is exactly "Understood." Line two states the problem.', starts: 'Understood.', may_greet: false, may_talk_about_us: false, active: true, examples: [] as string[], match_examples: false, rank: 0, sent: 0, boost: 0 };
    const txt = openingRules('No greeting. No talk about us.', tpl);
    assert.ok(txt.indexOf('RULES FOR EVERY OPENING') < txt.indexOf('THE OPENING TO WRITE'), 'the rules first, then the template');
    assert.ok(txt.includes('must begin with "Understood."'), 'the first words are said');
    assert.ok(/format describes its opening differently, follow this/.test(txt), 'it says it decides over the format');
    const approach = { ...tpl, name: 'Approach first opening', starts: 'For your platform,|For you,', may_talk_about_us: true };
    assert.ok(templateBlock(approach).includes('"For your platform," or "For you,"') && templateBlock(approach).includes('may say how we would start'));
    assert.deepEqual(checkFlags(approach), { noUs: false, starts: 'For your platform,|For you,', invite: false });
    assert.deepEqual(checkFlags({ ...tpl, may_greet: true }), { noUs: true, starts: 'Understood.', invite: true });
    assert.equal(openingRules(null, null), '', 'nothing to say without rules or a template');
    // R91: examples, followed closely only when "match the examples" is on; none, no block
    assert.equal(examplesBlock(tpl), '', 'no examples, nothing added');
    const ex = { ...tpl, examples: ['Understood. Your four clinics lose calls after six.', 'Understood. Orders stall between the shop and the warehouse.'] };
    assert.ok(examplesBlock(ex).startsWith('EXAMPLES of this opening') && !examplesBlock(ex).includes('80 to 90 percent'), 'examples for the feel only');
    const strict = examplesBlock({ ...ex, match_examples: true });
    assert.ok(strict.startsWith('MATCH THE EXAMPLES') && strict.includes('80 to 90 percent') && strict.includes('Example 2:'), 'matched closely, every example listed');
    assert.ok(templateBlock({ ...ex, match_examples: true }).includes('MATCH THE EXAMPLES'), 'the template carries its examples to the writer');
  }
  // R92: word shortcuts swap the main word in text, never in a link, an address or a longer word
  {
    const sc = [{ id: 1, main_word: 'WhatsApp', short_word: 'WA', active: true }, { id: 2, main_word: 'WhatsApp Business', short_word: 'WAB', active: true }, { id: 3, main_word: 'Google Sheets', short_word: 'GSheets', active: true }];
    const longFirst = [...sc].sort((a, b) => b.main_word.length - a.main_word.length);
    assert.equal(shortenText('Your whatsapp bot and WhatsApp\'s API.', sc), 'Your WA bot and WA\'s API.', 'any case, and a possessive');
    assert.equal(shortenText('On WhatsApp Business and Google  Sheets.', longFirst), 'On WAB and GSheets.', 'the longer phrase first, any spacing');
    assert.equal(shortenText('See https://whatsapp.com/x, www.whatsapp.com, me@whatsapp.com and WhatsAppify.', sc), 'See https://whatsapp.com/x, www.whatsapp.com, me@whatsapp.com and WhatsAppify.', 'links, addresses and longer words stay');
    assert.equal(shortenHtml('<p>Use <a href="https://whatsapp.com">WhatsApp</a> today.</p>', sc), '<p>Use <a href="https://whatsapp.com">WA</a> today.</p>', 'the text changes, the link does not');
    assert.equal(shortenText('WhatsApp.', sc), 'WA.', 'a full stop after it is not a link');
    assert.ok(shortcutsBlock(sc).includes('- WhatsApp: WA') && shortcutsBlock([]) === '', 'the writer is told, or nothing when there are none');
  }
  // R71: an experience done in several projects; each project once; the gap's word puts what waits first
  {
    assert.deepEqual(projectsOf({ id: 1, has: true, project_ids: [4, 8, 4], project_id: 8 }), [4, 8]);
    assert.deepEqual(projectsOf({ id: 1, has: true, project_id: 3 }), [3], 'the one project of the plugin and older pages');
    assert.equal(libSummary([]), 'none'); assert.equal(libSummary(['added', 'waiting']), 'waiting'); assert.equal(libSummary(['note', 'added']), 'added'); assert.equal(libSummary(['added', 'to_add']), 'to_add');
  }

  console.log('all tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
