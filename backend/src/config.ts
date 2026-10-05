import 'dotenv/config';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Folder holding package.json: the same from ts-node (src/) and from the build (dist/src/). */
function findAppRoot(): string {
  let d = __dirname;
  while (!existsSync(join(d, 'package.json'))) {
    const up = dirname(d);
    if (up === d) throw new Error('package.json not found');
    d = up;
  }
  return d;
}
export const appRoot = findAppRoot();

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : d;
};

export const config = {
  port: num(process.env.PORT, 3000),
  prod: process.env.NODE_ENV === 'production',
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    database: process.env.DB_NAME ?? 'upwork_gate',
    user: process.env.DB_USER ?? 'upwork_gate',
    password: process.env.DB_PASSWORD ?? '',
  },
  llm: {
    provider: process.env.LLM_PROVIDER === 'claude-cli' ? 'claude-cli' : 'mock',
    baseUrl: process.env.LLM_BASE_URL ?? '',
    apiKey: process.env.LLM_API_KEY ?? '',
    model: process.env.LLM_MODEL || 'glm-5.3-flash[1m]',
    concurrency: num(process.env.LLM_CONCURRENCY, 3),
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 300_000),
  },
} as const;
