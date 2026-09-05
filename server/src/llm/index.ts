/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY COPY. Phase H moves the News Agent's version into shared/llm and
 * deletes this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LLM layer barrel.
 *
 * Phase E's assistant engine consumes the client through here and never reaches
 * for a provider directly — container.ts is the only module that names one.
 */

export { createLLMClient, extractJson } from './client.ts'
export type { CreateClientOptions, LLMClient, TaskRequest } from './client.ts'

export { createBudget } from './budget.ts'
export type { Budget, BudgetLimits } from './budget.ts'

export { availableProviders, createProvider } from './factory.ts'
export type { CreateProviderOptions, RealProviderOptions } from './factory.ts'

export { LLMRefusal } from './provider.ts'
export type {
  LLMProvider,
  LLMRawResponse,
  LLMRequest,
  LLMResponse,
  LLMTaskName,
  LLMUsage,
  LLMUsageDelta,
  ModelClass,
} from './provider.ts'

export { LLMError, isLLMError } from './errors.ts'
export type { LLMErrorCode } from './errors.ts'

export { describeSchema } from './schemas.ts'
export { createMockProvider, MOCK_MODELS } from './providers/mock.ts'
export type { MockProviderOptions, MockScript } from './providers/mock.ts'

export * from './prompts/index.ts'
