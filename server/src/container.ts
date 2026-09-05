/*
 * The composition root.
 *
 * This is the ONE module that names a concrete implementation of anything.
 * Everything else receives its collaborators through an options object and
 * depends on interfaces — which is what makes the JSON-to-PostgreSQL catalogue
 * swap in ASSISTANT_ARCHITECTURE_PLAN.md §16.1 a one-line change here rather
 * than a rewrite of the retrieval and assistant layers.
 *
 * Manual constructor injection, exactly as executePipeline() wires the news
 * agent in news agent/src/pipeline/run.ts. No DI container, no service locator,
 * no decorators — `erasableSyntaxOnly` forbids the last of those anyway.
 *
 * `createJsonToolCatalogue` and `createProvider` are named HERE AND NOWHERE
 * ELSE. Routes and services receive a ToolCatalogueRepository and an LLMClient
 * and cannot tell what is behind either; swapping the catalogue for PostgreSQL
 * or the mock for a real vendor is one line below in each case.
 *
 * As later phases land this grows to:
 *
 *   const assistant = createAssistantEngine({ retrieval, llm, logger })  // Phase E
 *
 * Nothing is stubbed here in advance. A placeholder that returns undefined is
 * a dependency the rest of the code learns to work around.
 *
 * ── One budget per container, and why that changes in Phase E ─────────────────
 *
 * The budget created here is process-wide, which is right for Phase D: there is
 * exactly one caller, the manual verification path, and a shared circuit breaker
 * makes a runaway loop visible immediately. It is NOT right for a live chat
 * endpoint, where one conversation would consume every other request's headroom.
 * Phase E creates a per-turn budget inside the engine — see LLM_BUDGET in
 * config/limits.ts — and this one becomes the outer ceiling.
 */

import { createJsonToolCatalogue } from './catalogue/json.ts'
import type { ToolCatalogueRepository } from './catalogue/repository.ts'
import type { ServerEnv } from './config/env.ts'
import { LLM_BUDGET } from './config/limits.ts'
import { createBudget, type Budget } from './llm/budget.ts'
import { createLLMClient, type LLMClient } from './llm/client.ts'
import { createProvider } from './llm/factory.ts'
import type { MockProviderOptions } from './llm/providers/mock.ts'
import { createRetrievalService, type RetrievalService } from './retrieval/service.ts'
import type { Logger } from './utils/logger.ts'

export interface Container {
  readonly env: ServerEnv
  readonly logger: Logger
  readonly catalogue: ToolCatalogueRepository
  readonly retrieval: RetrievalService
  readonly llm: LLMClient
  readonly llmBudget: Budget
}

export interface CreateContainerOptions {
  env: ServerEnv
  logger: Logger
  /**
   * Test seam.
   *
   * A test builds the whole app against a fixture catalogue by passing one in,
   * so route tests neither read the real seed file nor break every time a tool
   * is added to it.
   */
  catalogue?: ToolCatalogueRepository
  /**
   * Test seam for the provider.
   *
   * Scripted mock behaviour — malformed output, refusals, outages — is injected
   * here rather than by intercepting the network, exactly as the News Agent
   * does. There is no network to intercept, and a test that stubs `fetch` is a
   * test that stops proving anything the moment an adapter changes transport.
   */
  mock?: MockProviderOptions
}

export function createContainer({
  env,
  logger,
  catalogue: injected,
  mock,
}: CreateContainerOptions): Container {
  // The only line in the server that names a concrete repository implementation.
  const catalogue = injected ?? createJsonToolCatalogue({ logger })
  const retrieval = createRetrievalService({ catalogue, logger })

  // ...and the only line that names a concrete LLM provider.
  const provider = createProvider({ env, ...(mock ? { mock } : {}) })
  const llmBudget = createBudget({
    maxLlmCalls: LLM_BUDGET.maxLlmCalls,
    maxTokens: LLM_BUDGET.maxTokens,
  })
  const llm = createLLMClient({ provider, budget: llmBudget, logger })

  return { env, logger, catalogue, retrieval, llm, llmBudget }
}
