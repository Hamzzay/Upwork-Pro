import { LlmCallError, type RunOptions, type RunResult } from './claude-runner';

/**
 * OpenAI Chat Completions with a strict JSON Schema, so the answer comes back in the exact shape the app needs.
 * Strict mode has rules of its own (every property required, no extra properties, a short list of keywords), so the
 * schema the app writes for the other providers is translated first; the app still checks every answer itself.
 */
const KEEP = new Set(['type', 'properties', 'required', 'items', 'enum', 'description', 'additionalProperties', 'anyOf']);

export function strictSchema(node: any): any {
  if (Array.isArray(node)) return node.map(strictSchema);
  if (!node || typeof node !== 'object') return node;
  const out: any = {};
  for (const [k, v] of Object.entries(node)) {
    if (!KEEP.has(k)) continue;
    out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, strictSchema(pv)])) : strictSchema(v);
  }
  if (out.type === 'object' && out.properties) { out.required = Object.keys(out.properties); out.additionalProperties = false; }
  return out;
}

const RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export async function runOpenAI(o: RunOptions): Promise<RunResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('llm_key_missing:openai');
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const timeoutMs = o.timeoutMs ?? 120_000;
  const body = {
    model: o.model,
    messages: [{ role: 'system', content: o.system }, { role: 'user', content: o.prompt }],
    ...(o.schema ? { response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: strictSchema(o.schema) } } } : {}),
  };
  const deadline = Date.now() + timeoutMs;
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), left);
    try {
      const res = await fetch(`${base}/chat/completions`, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
      lastStatus = res.status;
      if (!res.ok) {
        if (RETRY_STATUS.has(res.status) && attempt < 2) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
        throw new LlmCallError(`model error status=${res.status}`, res.status); // the body can echo the prompt: never put it in the message
      }
      const raw: any = await res.json();
      const choice = raw?.choices?.[0];
      if (choice?.message?.refusal) throw new Error('invalid_output');
      if (choice?.finish_reason === 'length') throw new Error('invalid_output'); // cut off: the JSON would be incomplete
      const text = String(choice?.message?.content ?? '');
      if (!o.schema) return { text, raw };
      let data: unknown;
      try { data = JSON.parse(text); } catch { throw new Error('no structured output (not JSON)'); }
      return { text, data, raw };
    } catch (e) {
      if ((e as any)?.name === 'AbortError') throw new Error(`timeout after ${timeoutMs} ms`);
      if (e instanceof LlmCallError || (e instanceof Error && /^(invalid_output|no structured output)/.test(e.message))) throw e;
      if (attempt < 2 && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; } // network blip
      throw new LlmCallError('model error status=none');
    } finally { clearTimeout(timer); }
  }
  throw new LlmCallError(`model error status=${lastStatus ?? 'none'}`, lastStatus);
}
