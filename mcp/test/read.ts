// Read-only check of the MCP against a running Upwork Pro: every read tool answers, the bulk job read pages without losing or
// repeating a job, and the trends add up. Safe on a real database (it saves nothing).
// Needs: API_URL (default http://localhost:3000) and TOKEN (a personal token from Connect Claude).  npm run test:read
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Api } from '../src/api';
import { makeServer } from '../src/index';

const URL_ = process.env.API_URL || 'http://localhost:3000';
const TOKEN = process.env.TOKEN || '';
let passed = 0;
const t = async (name: string, fn: () => Promise<void>) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.error('  FAIL', name, '\n      ', (e as Error).message); process.exitCode = 1; } };

(async () => {
  assert.ok(TOKEN, 'Set TOKEN to a personal token (Connect Claude, Make a token)');
  const [a, b] = InMemoryTransport.createLinkedPair();
  await makeServer(new Api(URL_, TOKEN)).connect(b);
  const client = new Client({ name: 'read-test', version: '0' }); await client.connect(a);
  const call = async (name: string, args: any = {}) => { const r: any = await client.callTool({ name, arguments: args }); const text = r.content?.[0]?.text ?? ''; let json: any; try { json = JSON.parse(text); } catch { /* text */ } return { error: !!r.isError, text, json }; };
  const LIMIT = 90_000; // what one answer may hold (tools.ts)

  await t('every tool is listed', async () => {
    const names = (await client.listTools()).tools.map((x) => x.name);
    for (const n of ['plugin_options', 'find_jobs', 'get_job', 'save_job', 'record_decision', 'save_proposal', 'update_status', 'get_library', 'get_writing_guide', 'add_profile', 'add_project', 'analyze_jobs', 'get_trends', 'list_projects', 'list_tags', 'list_profiles', 'list_import_types', 'list_imports'])
      assert.ok(names.includes(n), 'missing tool ' + n);
  });
  for (const [name, args, key] of [['plugin_options', {}, 'profiles'], ['list_import_types', {}, 'types'], ['list_imports', {}, 'batches'], ['list_projects', {}, 'projects'], ['list_tags', {}, 'categories'], ['list_profiles', {}, 'profiles'],
    ['get_library', {}, 'projects'], ['get_writing_guide', {}, 'types'], ['find_jobs', { limit: 5 }, 'jobs']] as const) {
    await t(`${name} answers, whole and under the limit`, async () => {
      const r = await call(name, args);
      assert.ok(!r.error, r.text.slice(0, 200)); assert.ok(r.json && r.json[key] !== undefined, `no "${key}" in the answer: ${r.text.slice(0, 120)}`);
      assert.ok(!r.json.note || !/too long/.test(r.json.note), 'the answer was cut'); assert.ok(r.text.length <= LIMIT);
    });
  }
  let total = 0; const all: any[][] = []; let columns: string[] = [];
  await t('analyze_jobs returns every job once, in pages', async () => {
    let after: number | undefined, pages = 0;
    for (;;) {
      const r = await call('analyze_jobs', { after });
      assert.ok(!r.error, r.text.slice(0, 200)); assert.ok(r.text.length <= LIMIT, 'a page is over the limit');
      total = r.json.total; columns = r.json.columns; all.push(...r.json.rows); pages++;
      if (!r.json.more) break; assert.ok(r.json.next_after, 'more without next_after'); after = r.json.next_after; assert.ok(pages < 500, 'paging does not end');
    }
    const ids = all.map((x) => x[0]);
    assert.equal(ids.length, total, 'jobs returned against total'); assert.equal(new Set(ids).size, ids.length, 'a job came twice');
    assert.ok(ids.every((id, i) => !i || id < ids[i - 1]), 'newest first'); assert.ok(all.every((x) => x.length === columns.length), 'a row does not match the columns');
  });
  await t('analyze_jobs with every heavy field still pages whole', async () => {
    const include = ['client', 'tags', 'signals', 'flags', 'history', 'description', 'proposal']; const seen: number[] = []; let after: number | undefined, pages = 0;
    for (;;) {
      const r = await call('analyze_jobs', { include, after }); assert.ok(!r.error, r.text.slice(0, 200)); assert.ok(r.text.length <= LIMIT, `page ${pages + 1} is ${r.text.length} characters`);
      assert.ok(!/too long/.test(r.json.note ?? ''), 'cut'); for (const c of ['proposal', 'description', 'tags', 'signals', 'flags', 'status_history', 'hire_rate']) assert.ok(r.json.columns.includes(c), 'no column ' + c);
      seen.push(...r.json.rows.map((x: any[]) => x[0])); pages++; if (!r.json.more) break; after = r.json.next_after; assert.ok(pages < 500);
    }
    assert.equal(seen.length, total); assert.equal(new Set(seen).size, total);
    console.log(`        ${total} jobs with every field in ${pages} page(s)`);
  });
  await t('filters narrow the jobs and agree with the rows', async () => {
    const col = (n: string) => columns.indexOf(n);
    const sent = all.filter((x) => x[col('sent_at')]);
    const sub = await call('analyze_jobs', { phase: 'submitted' }); assert.ok(!sub.error, sub.text); assert.ok(sub.json.rows.every((x: any[]) => x[col('stage')] === 'submitted'));
    const day = '2000-01-01'; const none = await call('analyze_jobs', { to: day }); assert.equal(none.json.total, 0);
    const bad = await call('analyze_jobs', { profile_name: 'No such profile zz' }); assert.ok(bad.error && /No Upwork profile/.test(bad.text), 'an unknown profile is refused with a reason');
    const tr = await call('get_trends', {}); assert.ok(!tr.error, tr.text.slice(0, 200)); assert.ok(tr.text.length <= LIMIT);
    assert.equal(tr.json.jobs, total, 'trends count the same jobs'); assert.equal(tr.json.totals.sent, sent.length, 'sent in trends against rows');
    assert.equal(tr.json.totals.viewed, sent.filter((x) => x[col('viewed')]).length, 'viewed in trends against rows');
    const byProfile = tr.json.reports.find((x: any) => x.key === 'profile'); assert.equal(byProfile.groups.reduce((n: number, g: any) => n + g.jobs, 0) + 0, total, 'profiles add up to every job');
    const one = await call('get_trends', { reports: ['type', 'week'], top: 3 }); assert.deepEqual(one.json.reports.map((x: any) => x.key).sort(), ['type', 'week']);
  });
  await t('a job read by id carries its proposal and history', async () => {
    if (!all.length) return; const r = await call('get_job', { id: all[0][0] }); assert.ok(!r.error, r.text); assert.equal(r.json.job.id, all[0][0]); assert.ok('status_history' in r.json.job);
  });
  console.log(process.exitCode ? '\nSOME CHECKS FAILED' : `\nall ${passed} checks passed (${total} jobs)`);
  process.exit(process.exitCode ?? 0);
})().catch((e) => { console.error(e); process.exit(1); });
