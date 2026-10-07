// Kept apart from providers.ts so settings.ts and providers.ts do not import each other.
export const PROVIDER_IDS = ['glm', 'claude', 'openai'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
