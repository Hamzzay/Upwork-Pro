// End to end: the MCP server, driven by the SDK's own client, against a running Upwork Pro API on a SCRATCH database (never the real one).
// Needs: the backend running (API_URL), a fresh database with `migrate` and `seed` done, and IMPORT_DIR pointing at the folder with the real workbooks.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Api } from '../src/api';
import { makeServer } from '../src/index';

const URL_ = process.env.API_URL || 'http://localhost:3055';
const DIR = process.env.IMPORT_DIR || '..';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL || 'admin@test.local', password: process.env.SEED_ADMIN_PASSWORD || 'testadminpass1' };
let passed = 0;
const t = async (name: string, fn: () => Promise<void>) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.error('  FAIL', name, '\n      ', (e as Error).message); process.exitCode = 1; } };

async function session(email: string, password: string) {
  const r = await fetch(URL_ + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(r.status, 200, 'login ' + email);
  return (r.headers.get('set-cookie') ?? '').split(';')[0];
}
const web = async (cookie: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(URL_ + '/api' + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  return { status: r.status, data: await r.json().catch(() => null) as any };
};
const makeToken = async (cookie: string, name = 't') => (await web(cookie, 'POST', '/tokens', { name, days: 30 })).data.token as string;

async function connect(token: string, importDir?: string) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await makeServer(new Api(URL_, token), importDir).connect(b);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(a);
  const call = async (name: string, args: any = {}) => {
    const r: any = await client.callTool({ name, arguments: args });
    const text = r.content?.[0]?.text ?? '';
    let json: any; try { json = JSON.parse(text); } catch { /* plain text */ }
    return { error: !!r.isError, text, json };
  };
  return { client, call };
}

(async () => {
  const adminCookie = await session(ADMIN.email, ADMIN.password);
  const pw = 'TestPass-12345';
  for (const [name, email, role] of [['Mgr', 'mgr@test.local', 'manager'], ['Emp', 'emp@test.local', 'employee']]) await web(adminCookie, 'POST', '/admin/users', { name, email, password: pw, role });
  const adminTok = await makeToken(adminCookie, 'admin'), mgrTok = await makeToken(await session('mgr@test.local', pw), 'mgr'), empTok = await makeToken(await session('emp@test.local', pw), 'emp');
  const admin = await connect(adminTok, DIR), mgr = await connect(mgrTok, DIR), emp = await connect(empTok, DIR), noFiles = await connect(adminTok);

  console.log('tools and safety');
  await t('lists its tools; file tools only when a folder is configured', async () => {
    const names = async (c: Client) => (await c.listTools()).tools.map((x) => x.name);
    assert.ok((await names(admin.client)).includes('import_xlsx_file'));
    assert.ok(!(await names(noFiles.client)).includes('import_xlsx_file'));
    const tools = (await admin.client.listTools()).tools;
    for (const n of ['commit_import', 'undo_import']) assert.equal(tools.find((x) => x.name === n)!.annotations?.destructiveHint, true);
  });
  await t('a token reaches imports and lookups, but not jobs, users or settings', async () => {
    for (const p of ['/screenings', '/admin/users', '/settings', '/dashboard']) assert.equal((await fetch(URL_ + '/api' + p, { headers: { Authorization: 'Bearer ' + adminTok } })).status, 401, p);
    assert.equal((await fetch(URL_ + '/api/me', { headers: { Authorization: 'Bearer ' + adminTok } }).then((x) => x.json())).user, null, 'a token is not a login');
    assert.equal((await fetch(URL_ + '/api/import/types', { headers: { Authorization: 'Bearer ' + adminTok } })).status, 200);
    assert.equal((await fetch(URL_ + '/api/tags', { headers: { Authorization: 'Bearer ' + adminTok } })).status, 200);
    assert.equal((await fetch(URL_ + '/api/projects', { method: 'POST', headers: { Authorization: 'Bearer ' + adminTok, 'Content-Type': 'application/json' }, body: '{}' })).status, 401); // lookups are read-only
  });
  await t('a token cannot make or list tokens; a made-up or revoked token is refused', async () => {
    assert.equal((await fetch(URL_ + '/api/tokens', { method: 'POST', headers: { Authorization: 'Bearer ' + adminTok, 'Content-Type': 'application/json' }, body: '{"name":"x"}' })).status, 401);
    assert.equal((await fetch(URL_ + '/api/import/types', { headers: { Authorization: 'Bearer upw_' + '0'.repeat(64) } })).status, 401);
    const tok = await makeToken(adminCookie, 'temp');
    const id = (await web(adminCookie, 'GET', '/tokens')).data.tokens.find((x: any) => x.name === 'temp').id;
    assert.equal((await fetch(URL_ + '/api/import/types', { headers: { Authorization: 'Bearer ' + tok } })).status, 200);
    assert.equal((await web(adminCookie, 'DELETE', '/tokens/' + id)).status, 200);
    assert.equal((await fetch(URL_ + '/api/import/types', { headers: { Authorization: 'Bearer ' + tok } })).status, 401);
  });
  await t('the token is never stored: only a hash is listed', async () => {
    const list = (await web(adminCookie, 'GET', '/tokens')).data.tokens[0];
    assert.deepEqual(Object.keys(list).sort(), ['created_at', 'expires_at', 'id', 'last_used_at', 'name', 'revoked_at']);
  });

  console.log('permissions by role');
  await t('employee: every type is refused; manager: projects only; admin: all', async () => {
    const allowed = async (c: typeof admin) => (await c.call('list_import_types')).json.types.filter((x: any) => x.allowed).map((x: any) => x.id).sort();
    assert.deepEqual(await allowed(emp), []);
    assert.deepEqual(await allowed(mgr), ['projects']);
    assert.deepEqual(await allowed(admin), ['profiles', 'projects', 'rules', 'tag_dictionary']);
    for (const type of ['rules', 'tag_dictionary', 'profiles', 'projects']) { const r = await emp.call('start_import', { type }); assert.ok(r.error && /cannot import/.test(r.text), type); }
    assert.ok((await mgr.call('start_import', { type: 'tag_dictionary' })).error);
    const m = await mgr.call('start_import', { type: 'projects' }); assert.ok(!m.error); await mgr.call('discard_import', { batch_id: m.json.id });
  });
  await t('one person cannot see or commit another person\'s import', async () => {
    const mine = (await admin.call('start_import', { type: 'rules' })).json.id;
    assert.ok((await mgr.call('get_preview', { batch_id: mine })).error);
    assert.ok((await mgr.call('add_rows', { batch_id: mine, headers: ['code'], rows: [['F9']] })).error);
    assert.ok((await mgr.call('discard_import', { batch_id: mine })).error);
    assert.ok(!(await admin.call('discard_import', { batch_id: mine })).error);
  });

  console.log('importing the real workbooks (empty database)');
  const rulesFile = 'Upwork Jobs History.xlsx', tagFile = 'Stackup Project Tag Library.xlsx';
  let rulesBatch = 0, tagBatch = 0, projBatch = 0;
  await t('Rule Codes: previews 22 new rules, saves nothing yet', async () => {
    const r = await admin.call('import_xlsx_file', { file: rulesFile, sheet: 'Rule Codes' });
    assert.ok(!r.error, r.text); assert.equal(r.json.counts.create, 22); assert.equal(r.json.counts.invalid, 0); rulesBatch = r.json.id;
    assert.equal((await admin.call('list_imports')).json.batches.find((b: any) => b.id === rulesBatch).status, 'open');
    assert.equal((await fetch(URL_ + '/api/rules', { headers: { Authorization: 'Bearer ' + adminTok } }).then((x) => x.json())).rules.length, 0);
  });
  await t('commit needs the preview checksum, and the right one', async () => {
    assert.ok((await admin.call('commit_import', { batch_id: rulesBatch, preview_checksum: 'nonsense-1234' })).error);
    const bad = await admin.call('commit_import', { batch_id: rulesBatch, preview_checksum: 'a'.repeat(16) });
    assert.ok(bad.error && /preview changed|not the one/.test(bad.text));
  });
  await t('commit saves the 22 rules; running it again changes nothing', async () => {
    const pv = (await admin.call('get_preview', { batch_id: rulesBatch })).json;
    const c = await admin.call('commit_import', { batch_id: rulesBatch, preview_checksum: pv.preview_checksum });
    assert.ok(!c.error, c.text); assert.equal(c.json.saved.created, 22);
    assert.equal((await fetch(URL_ + '/api/rules', { headers: { Authorization: 'Bearer ' + adminTok } }).then((x) => x.json())).rules.length, 22);
    const again = await admin.call('import_xlsx_file', { file: rulesFile, sheet: 'Rule Codes' });
    assert.equal(again.json.counts.unchanged, 22); assert.equal(again.json.can_commit, false);
    const refused = await admin.call('commit_import', { batch_id: again.json.id, preview_checksum: again.json.preview_checksum });
    assert.ok(refused.error && /Nothing to save/.test(refused.text));
    await admin.call('discard_import', { batch_id: again.json.id });
  });
  await t('a saved batch cannot be committed twice', async () => {
    const r = await admin.call('commit_import', { batch_id: rulesBatch, preview_checksum: 'x'.repeat(16) });
    assert.ok(r.error);
  });
  await t('Tag Dictionary: 10 categories, 102 tags', async () => {
    const r = await admin.call('import_xlsx_file', { file: tagFile, sheet: 'Tag Dictionary' });
    assert.ok(!r.error, r.text); assert.equal(r.json.counts.create, 102, JSON.stringify(r.json.counts)); assert.equal(r.json.counts.invalid, 0, JSON.stringify(r.json.invalid)); tagBatch = r.json.id;
    const c = await admin.call('commit_import', { batch_id: tagBatch, preview_checksum: r.json.preview_checksum }); assert.ok(!c.error, c.text);
    const cats = (await admin.call('list_tags')).json.categories;
    assert.equal(cats.length, 10); assert.equal(cats.reduce((n: number, c: any) => n + c.tags.length, 0), 102);
  });
  await t('Project Tagging (X-mark grid): 31 projects with their tags', async () => {
    const r = await admin.call('import_xlsx_file', { file: tagFile, sheet: 'Project Tagging' });
    assert.ok(!r.error, r.text); assert.equal(r.json.counts.create, 31, JSON.stringify(r.json.counts)); assert.equal(r.json.counts.invalid, 0, JSON.stringify(r.json.invalid));
    projBatch = r.json.id;
    const c = await admin.call('commit_import', { batch_id: projBatch, preview_checksum: r.json.preview_checksum }); assert.ok(!c.error, c.text);
    const n = (await admin.call('list_projects')).json.projects.reduce((a: number, p: any) => a + p.tag_count, 0);
    assert.equal(n, 981, 'same 981 project-tag links as the seed file');
  });
  await t('importing the same sheets again leaves everything unchanged', async () => {
    for (const [f, s, c] of [[tagFile, 'Tag Dictionary', 102], [tagFile, 'Project Tagging', 31], [rulesFile, 'Rule Codes', 22]] as const) {
      const r = await admin.call('import_xlsx_file', { file: f, sheet: s }); assert.equal(r.json.counts.unchanged, c, s); assert.equal(r.json.counts.create + r.json.counts.update, 0, s);
      assert.ok(!(await admin.call('discard_import', { batch_id: r.json.id })).error);
    }
  });

  console.log('changes, blocks and undo');
  const hdr = ['Category', 'Tag', 'Match weight', 'What it means'];
  const firstTag = async () => { const r = await admin.call('import_xlsx_file', { file: tagFile, sheet: 'Tag Dictionary' }); await admin.call('discard_import', { batch_id: r.json.id }); };
  await t('an existing tag with a different weight is BLOCKED by default, and shown', async () => {
    const c0 = (await admin.call('list_tags')).json.categories[0]; const cat = c0.name, name = [0, c0.tags[0].name, String(c0.tags[0].weight)];
    const { json: b } = await admin.call('start_import', { type: 'tag_dictionary' });
    const r = await admin.call('add_rows', { batch_id: b.id, headers: hdr, rows: [[cat, name[1], Number(name[2]) + 1, 'changed']] });
    assert.equal(r.json.counts.blocked, 1, r.text); assert.match(r.json.problems[0].messages[0], /differs/);
    assert.ok((await admin.call('commit_import', { batch_id: b.id, preview_checksum: (await admin.call('get_preview', { batch_id: b.id })).json.preview_checksum })).error, 'nothing to save');
    await admin.call('discard_import', { batch_id: b.id });
  });
  await t('with allow_changes the update is previewed, saved, and undone exactly', async () => {
    const before = JSON.stringify((await admin.call('list_tags')).json);
    const c0 = (await admin.call('list_tags')).json.categories[0]; const cat = c0.name, m = [0, c0.tags[0].name, String(c0.tags[0].weight)];
    const { json: b } = await admin.call('start_import', { type: 'tag_dictionary', allow_changes: true });
    await admin.call('add_rows', { batch_id: b.id, headers: hdr, rows: [[cat, m[1], Number(m[2]) + 1, 'a new meaning']] });
    const pv = (await admin.call('get_preview', { batch_id: b.id })).json; assert.equal(pv.counts.update, 1); assert.match(pv.will_update[0].notes[0], /weight/);
    assert.ok(!(await admin.call('commit_import', { batch_id: b.id, preview_checksum: pv.preview_checksum })).error);
    assert.notEqual(JSON.stringify((await admin.call('list_tags')).json), before);
    assert.ok(!(await admin.call('undo_import', { batch_id: b.id })).error);
    assert.equal(JSON.stringify((await admin.call('list_tags')).json), before, 'back to exactly what it was');
    assert.ok((await admin.call('undo_import', { batch_id: b.id })).error, 'cannot undo twice');
  });
  await t('a rule that exists with other wording is never reworded by import', async () => {
    const { json: b } = await admin.call('start_import', { type: 'rules', allow_changes: true });
    const r = await admin.call('add_rows', { batch_id: b.id, headers: ['Code', 'Type', 'Rule'], rows: [['F1', 'fail', 'Something completely different now'], ['F2', 'flag', 'wrong letter for type'], ['G99', 'flag', 'A brand new flag rule for testing']] });
    assert.equal(r.json.counts.blocked, 1); assert.equal(r.json.counts.invalid, 1); assert.equal(r.json.counts.create, 1);
    await admin.call('discard_import', { batch_id: b.id });
  });
  await t('bad rows are reported with reasons and block the commit unless skipped', async () => {
    const real = (await admin.call('list_tags')).json.categories[0].tags.map((x: any) => x.name) as string[];
    const [t1, t2] = real;
    const { json: b } = await admin.call('start_import', { type: 'projects' });
    const r = await admin.call('add_rows', { batch_id: b.id, headers: ['Project name', 'Live link', 'Tags'], rows: [
      ['Good New Project', 'https://example.com', `${t1}; ${t2}`], ['No Such Tag Project', '', `${t1}; Nonexistent Tag`], ['Count Project', '', '22'],
      ['Bad Link Project', 'javascript:alert(1)', t1], ['Good New Project', '', t1], ['', '', t1], ['No Tags Project', '', '']] });
    assert.ok(!r.error, r.text);
    assert.equal(r.json.counts.create, 1, r.text); assert.equal(r.json.counts.invalid, 6, r.text);
    const pv = (await admin.call('get_preview', { batch_id: b.id })).json;
    assert.ok(pv.invalid.some((x: any) => /Not in the tag dictionary/.test(x.notes.join())));
    assert.ok(pv.invalid.some((x: any) => /count/.test(x.notes.join())));
    assert.ok(pv.invalid.some((x: any) => /https/.test(x.notes.join())));
    assert.ok(pv.invalid.some((x: any) => /already in this import/.test(x.notes.join())));
    const refused = await admin.call('commit_import', { batch_id: b.id, preview_checksum: pv.preview_checksum });
    assert.ok(refused.error && /invalid/.test(refused.text), refused.text);
    const skipped = await admin.call('commit_import', { batch_id: b.id, preview_checksum: pv.preview_checksum, skip_invalid: true });
    assert.ok(!skipped.error && skipped.json.saved.created === 1 && skipped.json.left_out.invalid === 6, skipped.text);
    const made = (await admin.call('list_projects', { with_tags: true })).json.projects.find((p: any) => p.name === 'Good New Project');
    assert.deepEqual(made.tags.sort(), [t1, t2].sort()); assert.equal(made.live_link, 'https://example.com');
    assert.ok(!(await admin.call('undo_import', { batch_id: b.id })).error);
    assert.equal((await admin.call('list_projects')).json.projects.some((p: any) => p.name === 'Good New Project'), false);
    return;
    assert.ok(!(await admin.call('discard_import', { batch_id: b.id })).error);
  });
  await t('more than 50 rows per call is refused by the tool; more than 100 by the API', async () => {
    const { json: b } = await admin.call('start_import', { type: 'rules' });
    const rows = Array.from({ length: 101 }, (_, i) => [`G${200 + i}`, 'flag', `Test rule number ${i}`]);
    const tooMany: any = await admin.client.callTool({ name: 'add_rows', arguments: { batch_id: b.id, headers: ['Code', 'Type', 'Rule'], rows: rows.slice(0, 51) } });
    assert.ok(tooMany.isError, 'the tool itself refuses 51 rows');
    const direct = await fetch(URL_ + '/api/import/batches/' + b.id + '/rows', { method: 'POST', headers: { Authorization: 'Bearer ' + adminTok, 'Content-Type': 'application/json' }, body: JSON.stringify({ headers: ['Code', 'Type', 'Rule'], rows }) });
    assert.equal(direct.status, 413);
    await admin.call('discard_import', { batch_id: b.id });
  });
  await t('unknown columns are ignored and reported; unknown type refused', async () => {
    const { json: b } = await admin.call('start_import', { type: 'rules' });
    const r = await admin.call('add_rows', { batch_id: b.id, headers: ['Code', 'Type', 'Rule', 'Secret column'], rows: [['G98', 'flag', 'Another test flag rule here', 'x']] });
    assert.deepEqual(r.json.ignored_columns, ['Secret column']); await admin.call('discard_import', { batch_id: b.id });
    assert.ok((await admin.call('start_import', { type: 'users' })).error);
  });
  await t('someone else changing the data between preview and commit stops the commit', async () => {
    const mk = async () => { const { json: b } = await admin.call('start_import', { type: 'rules' }); await admin.call('add_rows', { batch_id: b.id, headers: ['Code', 'Type', 'Rule'], rows: [['G97', 'flag', 'A rule two people try to add']] }); return b.id as number; };
    const a = await mk(), b = await mk();
    const pa = (await admin.call('get_preview', { batch_id: a })).json, pb = (await admin.call('get_preview', { batch_id: b })).json;
    assert.ok(!(await admin.call('commit_import', { batch_id: a, preview_checksum: pa.preview_checksum })).error);
    const late = await admin.call('commit_import', { batch_id: b, preview_checksum: pb.preview_checksum });
    assert.ok(late.error && /changed since the preview/.test(late.text), late.text);
    await admin.call('undo_import', { batch_id: a }); await admin.call('discard_import', { batch_id: b });
  });
  await t('undo refuses while something depends on it, then works in the right order', async () => {
    const u1 = await admin.call('undo_import', { batch_id: tagBatch });
    assert.ok(u1.error && /project now uses/i.test(u1.text), u1.text);
    assert.ok(!(await admin.call('undo_import', { batch_id: projBatch })).error);
    assert.equal((await admin.call('list_projects')).json.projects.length, 0);
    assert.ok(!(await admin.call('undo_import', { batch_id: tagBatch })).error);
    assert.ok(!(await admin.call('undo_import', { batch_id: rulesBatch })).error);
    assert.equal((await fetch(URL_ + '/api/rules', { headers: { Authorization: 'Bearer ' + adminTok } }).then((x) => x.json())).rules.length, 0, 'empty again');
  });

  console.log('profiles and files');
  await t('profiles: create, then a changed tagline is blocked without allow_changes', async () => {
    const h = ['Profile', 'Tagline', 'Price', 'GitLab', 'Notes'];
    const { json: a } = await admin.call('start_import', { type: 'profiles' });
    const r = await admin.call('add_rows', { batch_id: a.id, headers: h, rows: [['Test Person', 'AI engineer', '$45', 'https://gitlab.com/test-person', ''], ['Bad Price', '', 'lots', '', '']] });
    assert.equal(r.json.counts.create, 1); assert.equal(r.json.counts.invalid, 1);
    const pv = (await admin.call('get_preview', { batch_id: a.id })).json;
    assert.ok(!(await admin.call('commit_import', { batch_id: a.id, preview_checksum: pv.preview_checksum, skip_invalid: true })).error);
    const { json: b } = await admin.call('start_import', { type: 'profiles' });
    const r2 = await admin.call('add_rows', { batch_id: b.id, headers: h, rows: [['test person', 'Senior AI engineer', '45', 'https://gitlab.com/test-person', '']] });
    assert.equal(r2.json.counts.blocked, 1, 'name matches regardless of case'); await admin.call('discard_import', { batch_id: b.id });
    await admin.call('undo_import', { batch_id: a.id });
  });
  await t('file reading stays inside the import folder and only reads .xlsx', async () => {
    for (const f of ['../../../../etc/passwd', '/etc/passwd', 'README.md', 'nope.xlsx']) assert.ok((await admin.call('import_xlsx_file', { file: f, sheet: 'x' })).error, f);
    assert.ok((await admin.call('import_xlsx_file', { file: rulesFile, sheet: 'No Such Sheet' })).error);
    assert.ok((await admin.call('import_xlsx_file', { file: rulesFile, sheet: 'Job Log' })).error, 'Job Log is not importable yet and says so');
  });
  await t('the remote (http) mode needs a token and never offers file tools', async () => {
    const { spawn } = await import('node:child_process');
    const child = spawn('npx', ['ts-node', 'src/index.ts', '--http'], { env: { ...process.env, MCP_PORT: '3199', UPWORK_PRO_URL: URL_ }, stdio: 'ignore' });
    try {
      let up = false; for (let i = 0; i < 40 && !up; i++) { await new Promise((r) => setTimeout(r, 500)); up = await fetch('http://127.0.0.1:3199/mcp', { method: 'POST' }).then(() => true, () => false); }
      assert.ok(up, 'http server started');
      assert.equal((await fetch('http://127.0.0.1:3199/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const c = new Client({ name: 't', version: '0' });
      await c.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3199/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + adminTok } } }));
      const tools = (await c.listTools()).tools.map((x) => x.name);
      assert.ok(tools.includes('start_import') && !tools.includes('import_xlsx_file'));
      const r: any = await c.callTool({ name: 'list_import_types', arguments: {} });
      assert.equal(JSON.parse(r.content[0].text).types.length, 4);
      await c.close();
    } finally { child.kill(); }
  });

  console.log(`\n${passed} passed` + (process.exitCode ? ', SOME FAILED' : ''));
  process.exit(process.exitCode ?? 0);
})().catch((e) => { console.error(e); process.exit(1); });
