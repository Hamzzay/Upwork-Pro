import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { Api } from './api';
import { registerTools } from './tools';

const BASE = process.env.UPWORK_PRO_URL || 'http://localhost:3000';
export const makeServer = (api: Api, importDir?: string) => {
  const s = new McpServer({ name: 'upwork-pro', version: '0.1.0' }, { instructions: 'Imports sheet data into Upwork Pro. Always preview, show the person, and get a yes before commit_import.' });
  registerTools(s, api, { importDir });
  return s;
};

async function main() {
  if (process.argv.includes('--http')) {
    // Remote mode: each request carries the person's own token, which is passed on to the API. Never reads local files.
    const port = Number(process.env.MCP_PORT) || 3100, host = process.env.MCP_HOST || '127.0.0.1';
    createServer(async (req, res) => {
      if (!req.url?.startsWith('/mcp')) { res.statusCode = 404; return void res.end(); }
      const token = /^Bearer (upw_[0-9a-f]{64})$/.exec(req.headers.authorization ?? '')?.[1];
      if (!token) { res.statusCode = 401; res.setHeader('WWW-Authenticate', 'Bearer'); return void res.end(JSON.stringify({ error: 'Send your Upwork Pro token as a Bearer token' })); }
      const server = makeServer(new Api(BASE, token));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless: nothing is kept between requests
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    }).listen(port, host, () => console.error(`Upwork Pro MCP (http) on http://${host}:${port}/mcp, API ${BASE}`));
    return;
  }
  const token = process.env.UPWORK_PRO_TOKEN;
  if (!token) { console.error('Set UPWORK_PRO_TOKEN (make one on the website: Connect Claude).'); process.exit(1); }
  await makeServer(new Api(BASE, token), process.env.IMPORT_DIR).connect(new StdioServerTransport());
  console.error(`Upwork Pro MCP (stdio) ready, API ${BASE}${process.env.IMPORT_DIR ? ', files from ' + process.env.IMPORT_DIR : ', file reading off'}`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
