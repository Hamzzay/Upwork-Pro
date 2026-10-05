import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface RunOptions {
  model: string;
  system: string; // rules for this call, written to a file
  prompt: string; // input for this call, sent on stdin
  schema?: object; // JSON Schema draft-07 for the answer
  timeoutMs?: number;
  maxTurns?: number;
}

export interface RunResult {
  text: string;
  data?: unknown;
  raw: any;
}

const live = new Set<ChildProcess>();
export function killAllChildren(): void {
  for (const c of live) {
    try { process.kill(-c.pid!, 'SIGKILL'); } catch { /* already gone */ }
  }
}
process.on('exit', killAllChildren);

/** /tmp is shared with other apps on the server: scratch folders start with this project's name. */
const SCRATCH_PREFIX = 'upworkgate-llm-';

/** Call once when the worker starts: removes folders a crashed worker left behind. */
export function sweepOldScratch(maxAgeMs = 3_600_000): void {
  try {
    for (const name of readdirSync(tmpdir())) {
      if (!name.startsWith(SCRATCH_PREFIX)) continue;
      const dir = join(tmpdir(), name);
      try {
        if (Date.now() - statSync(dir).mtimeMs > maxAgeMs) rmSync(dir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/** Carries the HTTP status so a caller can decide whether a retry makes sense. */
export class LlmCallError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'LlmCallError';
  }
}

/** The binary pinned in THIS project's node_modules. Never a global `claude`. */
function claudeBin(): string {
  const pkgJson = require.resolve('@anthropic-ai/claude-code/package.json');
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'));
  return join(dirname(pkgJson), typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.claude);
}

export async function runClaude(o: RunOptions): Promise<RunResult> {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('LLM_BASE_URL / LLM_API_KEY are not set');
  const timeoutMs = o.timeoutMs ?? 120_000;

  const root = mkdtempSync(join(tmpdir(), SCRATCH_PREFIX));
  try {
    const cwd = join(root, 'cwd');
    const config = join(root, 'config');
    mkdirSync(cwd);
    mkdirSync(config);
    writeFileSync(join(root, 'system.txt'), o.system);

    const argv = [
      '-p', '--output-format', 'json',
      '--model', o.model,
      '--max-turns', String(o.maxTurns ?? 5),
      '--strict-mcp-config', '--no-session-persistence',
      '--tools', '', // no tools: pure text in, text out
      '--system-prompt-file', join(root, 'system.txt'),
      ...(o.schema ? ['--json-schema', JSON.stringify(o.schema)] : []),
      '--disable-slash-commands', // no skills are used by this app
    ];

    // The child gets ONLY this. Never hand it process.env: that holds the DB password.
    const env = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_API_KEY: apiKey,
      CLAUDE_CONFIG_DIR: config,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      API_TIMEOUT_MS: String(timeoutMs),
      CLAUDE_CODE_MAX_RETRIES: '2',
    };

    const { out, code: exitCode } = await new Promise<{ out: string; code: number | null }>((resolve, reject) => {
      const child = spawn(claudeBin(), argv, { cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
      live.add(child);
      const killGroup = () => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* gone */ } };
      let stdout = '', timedOut = false, tooBig = false;
      const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeoutMs);
      child.stdout!.setEncoding('utf8');
      child.stderr!.setEncoding('utf8');
      child.stdout!.on('data', (d: string) => {
        if (tooBig) return;
        stdout += d;
        if (stdout.length > 20e6) { tooBig = true; killGroup(); }
      });
      child.stderr!.on('data', () => undefined); // stderr stays out of errors
      child.on('error', (e) => { live.delete(child); clearTimeout(timer); reject(e); });
      child.on('close', (code) => {
        live.delete(child);
        clearTimeout(timer);
        killGroup(); // nothing may outlive the call
        if (timedOut) return reject(new Error(`timeout after ${timeoutMs} ms`));
        if (tooBig) return reject(new Error('CLI output over the 20 MB cap'));
        if (!stdout) return reject(new Error(`CLI exited ${code} with no output`));
        resolve({ out: stdout, code });
      });
      child.stdin!.on('error', () => undefined);
      child.stdin!.end(o.prompt);
    });

    let raw: any;
    try { raw = JSON.parse(out); } catch { throw new Error('CLI output was not JSON'); } // never echo model text
    if (raw?.type !== 'result') throw new Error('CLI output was not a result envelope');
    if (raw.is_error) {
      const status = typeof raw.api_error_status === 'number' ? raw.api_error_status : undefined;
      throw new LlmCallError(`model error status=${status ?? 'none'} subtype=${raw.subtype ?? 'none'}`, status);
    }
    if (exitCode !== 0) throw new Error(`CLI exited ${exitCode} without reporting an error`);
    if (o.schema && raw.structured_output == null) {
      throw new Error(`no structured output (${raw.terminal_reason ?? 'unknown'})`);
    }
    return { text: String(raw.result ?? ''), data: raw.structured_output, raw };
  } finally {
    rmSync(root, { recursive: true, force: true }); // the temp folder lives only for this call
  }
}
