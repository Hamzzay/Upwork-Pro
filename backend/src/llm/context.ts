import { AsyncLocalStorage } from 'node:async_hooks';

/** Which job a model call belongs to. Set once around each worker job, so every call inside it is logged against that job. */
export interface CallContext { kind: string; screeningId?: number | null; proposalId?: number | null; used?: { provider: string; model: string } }
export const llmContext = new AsyncLocalStorage<CallContext>();
export const withCallContext = <T>(ctx: CallContext, fn: () => Promise<T>) => llmContext.run(ctx, fn);

/** The provider and model the last call in this job really used, to store beside the result. */
export const lastUsed = () => llmContext.getStore()?.used;
