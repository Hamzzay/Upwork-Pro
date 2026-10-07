import { getSettings } from '../settings';
import { PROVIDER_IDS, type ProviderId } from './ids';
export { PROVIDER_IDS, type ProviderId };

/**
 * The AI services an admin can choose between in Settings. Keys never live in the database: each provider reads its key from .env,
 * and the Settings page only learns whether the key is there.
 */

export interface ProviderInfo {
  label: string;
  keyEnv: string; // what to add to .env
  models: { id: string; label: string }[]; // suggestions; an admin can type another model name
  note: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  glm: {
    label: 'GLM (Z.ai)', keyEnv: 'LLM_API_KEY',
    models: [{ id: 'glm-5.3-flash[1m]', label: 'GLM 5.3 Flash: cheaper, slower' }, { id: 'glm-5.3[1m]', label: 'GLM 5.3: full, faster, uses quota faster' }],
    note: 'Runs through the pinned Claude Code program, pointed at Z.ai (LLM_BASE_URL and LLM_API_KEY in .env).',
  },
  claude: {
    label: 'Claude (Anthropic)', keyEnv: 'ANTHROPIC_API_KEY or LLM_OAUTH_TOKEN',
    models: [{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5: balanced' }, { id: 'claude-opus-5-5', label: 'Claude Opus 5.5: strongest, slowest' }, { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5: fastest, cheapest' }],
    note: 'Runs through the same Claude Code program, pointed at Anthropic (ANTHROPIC_API_KEY, or LLM_OAUTH_TOKEN from `claude setup-token`, in .env).',
  },
  openai: {
    label: 'GPT (OpenAI)', keyEnv: 'OPENAI_API_KEY',
    models: [{ id: 'gpt-5', label: 'GPT-5: strongest' }, { id: 'gpt-5-mini', label: 'GPT-5 mini: faster, cheaper' }],
    note: 'Calls the OpenAI API directly (OPENAI_API_KEY in .env). Type a different model name if your account uses another.',
  },
};

export const defaultModel = (p: ProviderId): string => (p === 'glm' ? process.env.LLM_MODEL || PROVIDERS.glm.models[0].id : PROVIDERS[p].models[0].id);

/** Is the key for this provider on the server? Never returns the key. */
export function keyPresent(p: ProviderId): boolean {
  if (p === 'glm') return !!process.env.LLM_API_KEY && !!process.env.LLM_BASE_URL;
  if (p === 'claude') return !!process.env.ANTHROPIC_API_KEY || !!process.env.LLM_OAUTH_TOKEN;
  return !!process.env[PROVIDERS[p].keyEnv];
}

/** 'mock' in .env turns every provider off (tests, demos): the choice in Settings only applies to real calls. */
export const realCallsEnabled = () => process.env.LLM_PROVIDER === 'claude-cli';

export interface Choice { provider: ProviderId; model: string }

/** What the next call should use. Read from Settings each time, so a change applies to the next job with no restart. */
export async function currentChoice(): Promise<Choice> {
  try {
    const s = await getSettings();
    const provider = s['ai.provider'];
    return { provider, model: s[`ai.model.${provider}` as const] || defaultModel(provider) };
  } catch {
    return { provider: 'glm', model: defaultModel('glm') }; // no database (a script): the original behaviour
  }
}
