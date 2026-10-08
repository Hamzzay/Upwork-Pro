import { createHash, randomBytes } from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { audit, exec, pool, query } from './db';
import { requireRole } from './auth';

/**
 * Upwork Pro as an OAuth 2.1 authorization server for its MCP connector, the way the MCP spec describes it, so each person
 * connects Claude by signing in with their own Upwork Pro account instead of copying a token:
 *   1. Claude reads /.well-known/oauth-protected-resource (from the MCP's 401) and /.well-known/oauth-authorization-server.
 *   2. Claude registers itself (/oauth/register, dynamic client registration) and sends the person to /oauth/authorize (PKCE S256).
 *   3. The person signs in on /oauth.html, sees which app asks, and allows it. Claude gets a code and swaps it at /oauth/token.
 * The access token is a normal api_token of that person (1 hour, same limited reach as a personal token: imports, the plugin
 * endpoints and read-only lookups), so everything Claude does is recorded as them. The refresh token (60 days) is used once and
 * replaced each time; a reused one disconnects that connection. People see and disconnect their connections on Connect Claude.
 *
 * Settings (.env): PUBLIC_URL, the address people reach Upwork Pro at (default http://localhost:PORT), and MCP_URL, the
 * connector's address (default http://localhost:3100/mcp).
 */
export const oauth = Router();      // mounted at the site root: discovery, register, authorize, token
export const oauthApi = Router();   // mounted under /api: what the sign-in page and Connect Claude call

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const b64url = (b: Buffer) => b.toString('base64url');
const ACCESS_SECONDS = 3600, REFRESH_DAYS = 60, CODE_MINUTES = 5, REQUEST_MINUTES = 10;
export const publicUrl = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
export const mcpUrl = () => (process.env.MCP_URL || 'http://localhost:3100/mcp').replace(/\/+$/, '');

const cors = (_req: Request, res: Response, next: () => void) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); next();
};
const oauthError = (res: Response, status: number, error: string, description: string) => res.status(status).json({ error, error_description: description });

// ---------- discovery ----------
const asMetadata = () => ({
  issuer: publicUrl(),
  authorization_endpoint: `${publicUrl()}/oauth/authorize`,
  token_endpoint: `${publicUrl()}/oauth/token`,
  registration_endpoint: `${publicUrl()}/oauth/register`,
  response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['upwork-pro'], service_documentation: `${publicUrl()}/#/connect`,
});
const prMetadata = () => ({ resource: mcpUrl(), authorization_servers: [publicUrl()], scopes_supported: ['upwork-pro'], bearer_methods_supported: ['header'], resource_name: 'Upwork Pro' });
oauth.options(/^\/(\.well-known|oauth)\//, cors, (_req, res) => void res.sendStatus(204));
for (const p of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/*rest', '/.well-known/openid-configuration']) oauth.get(p, cors, (_req, res) => void res.json(asMetadata()));
for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/*rest']) oauth.get(p, cors, (_req, res) => void res.json(prMetadata()));

// ---------- dynamic client registration (RFC 7591) ----------
// Claude's own callback, any https address, or a local one (Claude Code listens on localhost while you sign in).
const okRedirect = (u: string) => { try { const x = new URL(u); return x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname)); } catch { return false; } };
oauth.post('/oauth/register', cors, express.json({ limit: '20kb' }), async (req, res) => {
  const b = z.object({ redirect_uris: z.array(z.string().max(1000)).min(1).max(10), client_name: z.string().trim().max(200).optional(),
    token_endpoint_auth_method: z.string().optional(), grant_types: z.array(z.string()).optional(), response_types: z.array(z.string()).optional() }).passthrough().safeParse(req.body);
  if (!b.success) return void oauthError(res, 400, 'invalid_client_metadata', b.error.issues[0].message);
  if (!b.data.redirect_uris.every(okRedirect)) return void oauthError(res, 400, 'invalid_redirect_uri', 'Redirect addresses must be https, or http on localhost');
  if (b.data.token_endpoint_auth_method && b.data.token_endpoint_auth_method !== 'none') return void oauthError(res, 400, 'invalid_client_metadata', 'Only public clients (token_endpoint_auth_method "none") are supported');
  const clientId = 'upc_' + randomBytes(16).toString('hex');
  const name = b.data.client_name || 'An MCP client';
  await exec('INSERT INTO oauth_clients (client_id, client_name, redirect_uris) VALUES (?,?,?)', [clientId, name, JSON.stringify(b.data.redirect_uris)]);
  res.status(201).json({ client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: b.data.redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' });
});

// ---------- authorize: check the request, then the person signs in and allows it on /oauth.html ----------
const plainError = (res: Response, msg: string) => res.status(400).type('text/plain').send(`Upwork Pro could not start the sign-in: ${msg}`);
oauth.get('/oauth/authorize', async (req, res) => {
  const q = req.query as Record<string, string>;
  const client = (await query<any>('SELECT * FROM oauth_clients WHERE client_id=?', [String(q.client_id ?? '')]))[0];
  if (!client) return void plainError(res, 'unknown client. Remove the connector in Claude and add it again.');
  if (!q.redirect_uri || !JSON.parse(client.redirect_uris).includes(q.redirect_uri)) return void plainError(res, 'the return address is not the one this client registered.');
  // from here, problems go back to the client
  const back = (error: string, description: string) => { const u = new URL(q.redirect_uri); u.searchParams.set('error', error); u.searchParams.set('error_description', description); if (q.state) u.searchParams.set('state', q.state); res.redirect(u.toString()); };
  if (q.response_type !== 'code') return void back('unsupported_response_type', 'Only response_type=code is supported');
  if (!q.code_challenge || q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(q.code_challenge)) return void back('invalid_request', 'PKCE with S256 is required');
  if (q.resource && q.resource.replace(/\/+$/, '') !== mcpUrl()) return void back('invalid_target', `This server only issues tokens for ${mcpUrl()}`);
  const id = randomBytes(16).toString('hex');
  await exec(`INSERT INTO oauth_requests (id, client_id, redirect_uri, state, code_challenge, scope, resource, expires_at) VALUES (?,?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [id, client.client_id, q.redirect_uri, q.state ?? null, q.code_challenge, q.scope ?? null, q.resource ?? null, REQUEST_MINUTES]);
  res.redirect(`/oauth.html?r=${id}`);
});

const pending = async (id: string) => (await query<any>(`SELECT r.*, c.client_name FROM oauth_requests r JOIN oauth_clients c ON c.client_id=r.client_id
  WHERE r.id=? AND r.done_at IS NULL AND r.expires_at > NOW()`, [id]))[0];
const sessionOnly = (req: Request, res: Response, next: () => void) => (req.viaToken ? res.status(403).json({ error: 'Sign in on the website' }) : next());

/** What the sign-in page shows: which app asks, and as whom it will act. */
oauthApi.get('/oauth/request/:id', requireRole(), sessionOnly, async (req, res) => {
  const r = await pending(String(req.params.id));
  if (!r) return void res.status(404).json({ error: 'This sign-in link has expired. Start again from Claude.' });
  res.json({ client_name: r.client_name, returns_to: new URL(r.redirect_uri).host, user: { name: req.user!.name, email: req.user!.email, role: req.user!.role } });
});
oauthApi.post('/oauth/request/:id', requireRole(), sessionOnly, async (req, res) => {
  const b = z.object({ allow: z.boolean() }).safeParse(req.body);
  if (!b.success) return void res.status(400).json({ error: 'Allow or deny' });
  const r = await pending(String(req.params.id));
  if (!r) return void res.status(404).json({ error: 'This sign-in link has expired. Start again from Claude.' });
  await exec('UPDATE oauth_requests SET done_at=NOW() WHERE id=?', [r.id]);
  const u = new URL(r.redirect_uri);
  if (!b.data.allow) {
    u.searchParams.set('error', 'access_denied'); u.searchParams.set('error_description', 'The person did not allow it');
  } else {
    const code = b64url(randomBytes(32));
    await exec(`INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at) VALUES (?,?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [sha(code), r.client_id, req.user!.id, r.redirect_uri, r.code_challenge, r.scope, r.resource, CODE_MINUTES]);
    u.searchParams.set('code', code);
  }
  if (r.state) u.searchParams.set('state', r.state);
  await audit(req.user!.id, b.data.allow ? 'oauth_allow' : 'oauth_deny', `${r.client_name} (${r.client_id})`);
  res.json({ redirect: u.toString() });
});

// ---------- token ----------
async function issue(conn: any, clientId: string, userId: number, scope: string | null, resource: string | null, grantId: string) {
  const access = 'upw_' + randomBytes(32).toString('hex'), refresh = 'upr_' + randomBytes(32).toString('hex');
  const [[c]] = await conn.query('SELECT client_name FROM oauth_clients WHERE client_id=?', [clientId]);
  await conn.query(`INSERT INTO api_tokens (user_id, name, token_hash, expires_at, oauth_grant_id, oauth_client_id) VALUES (?,?,?, DATE_ADD(NOW(), INTERVAL ? SECOND),?,?)`,
    [userId, `Signed in: ${String(c?.client_name ?? 'MCP client').slice(0, 60)}`, sha(access), ACCESS_SECONDS, grantId, clientId]);
  await conn.query(`INSERT INTO oauth_refresh_tokens (token_hash, grant_id, client_id, user_id, scope, resource, expires_at) VALUES (?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [sha(refresh), grantId, clientId, userId, scope, resource, REFRESH_DAYS]);
  await conn.query('UPDATE oauth_clients SET last_used_at=NOW() WHERE client_id=?', [clientId]);
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: scope || 'upwork-pro' };
}
/** Disconnect a connection: its refresh tokens and every access token it got stop working. */
export async function revokeGrant(grantId: string) {
  await exec('UPDATE oauth_refresh_tokens SET revoked_at=NOW() WHERE grant_id=? AND revoked_at IS NULL', [grantId]);
  await exec('UPDATE api_tokens SET revoked_at=NOW() WHERE oauth_grant_id=? AND revoked_at IS NULL', [grantId]);
}

oauth.post('/oauth/token', cors, express.urlencoded({ extended: false, limit: '20kb' }), express.json({ limit: '20kb' }), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const p = req.body ?? {};
  const client = (await query<any>('SELECT * FROM oauth_clients WHERE client_id=?', [String(p.client_id ?? '')]))[0];
  if (!client) return void oauthError(res, 401, 'invalid_client', 'Unknown client');
  if (p.resource && String(p.resource).replace(/\/+$/, '') !== mcpUrl()) return void oauthError(res, 400, 'invalid_target', `This server only issues tokens for ${mcpUrl()}`);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (p.grant_type === 'authorization_code') {
      const [[c]]: any = await conn.query('SELECT * FROM oauth_codes WHERE code_hash=? FOR UPDATE', [sha(String(p.code ?? ''))]);
      const bad = !c || c.used_at || new Date(c.expires_at) < new Date() || c.client_id !== client.client_id || c.redirect_uri !== p.redirect_uri;
      if (bad) { await conn.rollback(); return void oauthError(res, 400, 'invalid_grant', 'The code is wrong, used or expired'); }
      if (!p.code_verifier || b64url(createHash('sha256').update(String(p.code_verifier)).digest()) !== c.code_challenge) { await conn.rollback(); return void oauthError(res, 400, 'invalid_grant', 'PKCE check failed'); }
      await conn.query('UPDATE oauth_codes SET used_at=NOW() WHERE code_hash=?', [c.code_hash]);
      const [[u]]: any = await conn.query('SELECT active FROM users WHERE id=?', [c.user_id]);
      if (!u || !u.active) { await conn.rollback(); return void oauthError(res, 400, 'invalid_grant', 'This account is disabled'); }
      const out = await issue(conn, client.client_id, c.user_id, c.scope, c.resource, randomBytes(16).toString('hex'));
      await conn.commit();
      await audit(c.user_id, 'oauth_connect', `${client.client_name} (${client.client_id})`);
      return void res.json(out);
    }
    if (p.grant_type === 'refresh_token') {
      const [[t]]: any = await conn.query('SELECT * FROM oauth_refresh_tokens WHERE token_hash=? FOR UPDATE', [sha(String(p.refresh_token ?? ''))]);
      if (!t || t.client_id !== client.client_id || t.revoked_at || new Date(t.expires_at) < new Date()) { await conn.rollback(); return void oauthError(res, 400, 'invalid_grant', 'The refresh token is not valid. Sign in again.'); }
      if (t.used_at) { // a refresh token used twice: someone else may hold a copy, so the whole connection is cut off
        await conn.rollback(); await revokeGrant(t.grant_id); await audit(t.user_id, 'oauth_reuse', `grant=${t.grant_id} disconnected`);
        return void oauthError(res, 400, 'invalid_grant', 'This refresh token was already used. The connection was disconnected; sign in again.');
      }
      const [[u]]: any = await conn.query('SELECT active FROM users WHERE id=?', [t.user_id]);
      if (!u || !u.active) { await conn.rollback(); return void oauthError(res, 400, 'invalid_grant', 'This account is disabled'); }
      await conn.query('UPDATE oauth_refresh_tokens SET used_at=NOW() WHERE id=?', [t.id]);
      const out = await issue(conn, client.client_id, t.user_id, t.scope, t.resource, t.grant_id);
      await conn.commit();
      return void res.json(out);
    }
    await conn.rollback();
    oauthError(res, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
  } catch (e) { await conn.rollback().catch(() => undefined); throw e; } finally { conn.release(); }
});

// ---------- Connect Claude: the person's connections ----------
oauthApi.get('/oauth/connections', requireRole(), sessionOnly, async (req, res) => {
  res.json({
    mcp_url: mcpUrl(),
    connections: await query(`SELECT r.grant_id, c.client_name, MIN(r.created_at) AS connected_at, MAX(r.created_at) AS last_refresh,
        (SELECT MAX(k.last_used_at) FROM api_tokens k WHERE k.oauth_grant_id=r.grant_id) AS last_used_at
      FROM oauth_refresh_tokens r JOIN oauth_clients c ON c.client_id=r.client_id
      WHERE r.user_id=? AND r.grant_id NOT IN (SELECT grant_id FROM oauth_refresh_tokens WHERE revoked_at IS NOT NULL)
        AND r.grant_id IN (SELECT grant_id FROM oauth_refresh_tokens WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW())
      GROUP BY r.grant_id, c.client_name ORDER BY connected_at DESC`, [req.user!.id]),
  });
});
oauthApi.delete('/oauth/connections/:grant', requireRole(), sessionOnly, async (req, res) => {
  const g = String(req.params.grant);
  if (!(await query('SELECT 1 FROM oauth_refresh_tokens WHERE grant_id=? AND user_id=?', [g, req.user!.id])).length) return void res.status(404).json({ error: 'Not found' });
  await revokeGrant(g);
  await audit(req.user!.id, 'oauth_disconnect', `grant=${g}`);
  res.json({ ok: true });
});
