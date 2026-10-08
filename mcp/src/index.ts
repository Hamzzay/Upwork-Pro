import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { Api } from './api';
import { registerTools } from './tools';

const BASE = process.env.UPWORK_PRO_URL || 'http://localhost:3000';
export const makeServer = (api: Api, importDir?: string) => {
  const s = new McpServer({ name: 'upwork-pro', version: '0.1.0' }, { instructions: 'Saves into Upwork Pro: the jobs, proposals and statuses from the Claude plugin (call plugin_options first, find_jobs before save_job), and sheet data (always preview, show the person, and get a yes before commit_import).' });
  registerTools(s, api, { importDir });
  return s;
};

async function main() {
  if (process.argv.includes('--http')) {
    // Remote mode, for several people: each one adds this connector's link in their own Claude and signs in with their own
    // Upwork Pro account (OAuth, see backend/src/oauth.ts). Every request carries that person's token, which is passed on to the API,
    // so all they save is recorded as them. A personal token from Connect Claude also works. Never reads local files.
    const port = Number(process.env.MCP_PORT) || 3100, host = process.env.MCP_HOST || '127.0.0.1';
    const mcpUrl = (process.env.MCP_URL || `http://localhost:${port}/mcp`).replace(/\/+$/, '');
    const publicUrl = (process.env.UPWORK_PRO_PUBLIC_URL || BASE).replace(/\/+$/, '');
    const prm = JSON.stringify({ resource: mcpUrl, authorization_servers: [publicUrl], scopes_supported: ['upwork-pro'], bearer_methods_supported: ['header'], resource_name: 'Upwork Pro' });
    const checked = new Map<string, number>(); // token -> valid until (a short cache, so each request does not cost a lookup)
    const valid = async (token: string) => {
      if ((checked.get(token) ?? 0) > Date.now()) return true;
      try { await new Api(BASE, token).call('GET', '/plugin/whoami'); checked.set(token, Date.now() + 60_000); return true; }
      catch { checked.delete(token); return false; }
    };
    createServer(async (req, res) => {
      const path = (req.url ?? '').split('?')[0];
      if (path.startsWith('/.well-known/oauth-protected-resource')) { res.setHeader('Content-Type', 'application/json'); res.setHeader('Access-Control-Allow-Origin', '*'); return void res.end(prm); }
      if (!path.startsWith('/mcp')) { res.statusCode = 404; return void res.end(); }
      const token = /^Bearer (upw_[0-9a-f]{64})$/.exec(req.headers.authorization ?? '')?.[1];
      if (!token || !(await valid(token))) {
        // tells Claude where to sign in; it opens the Upwork Pro sign-in page and comes back with a token
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', `Bearer realm="Upwork Pro", resource_metadata="${mcpUrl.replace(/\/mcp$/, '')}/.well-known/oauth-protected-resource"${token ? ', error="invalid_token"' : ''}`);
        res.setHeader('Content-Type', 'application/json');
        return void res.end(JSON.stringify({ error: token ? 'invalid_token' : 'Sign in to Upwork Pro: add this connector in Claude and follow the sign-in' }));
      }
      const server = makeServer(new Api(BASE, token));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless: nothing is kept between requests
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    }).listen(port, host, () => console.error(`Upwork Pro MCP (http) on ${mcpUrl}, API ${BASE}, sign-in at ${publicUrl}`));
    return;
  }
  const token = process.env.UPWORK_PRO_TOKEN;
  if (!token) { console.error('Set UPWORK_PRO_TOKEN (make one on the website: Connect Claude).'); process.exit(1); }
  await makeServer(new Api(BASE, token), process.env.IMPORT_DIR).connect(new StdioServerTransport());
  console.error(`Upwork Pro MCP (stdio) ready, API ${BASE}${process.env.IMPORT_DIR ? ', files from ' + process.env.IMPORT_DIR : ', file reading off'}`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
