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
 * Nothing is stubbed here in advance. A placeholder that returns undefined is
 * a dependency the rest of the code learns to work around.
 *
 * ── One budget per TURN, not one per process ──────────────────────────────────
 *
 * Phase D created a single budget here, which was right when the only caller was
 * a manual verification path. It is wrong for a live chat endpoint: a budget is
 * mutable spend accounting, and one shared instance means the first pathological
 * conversation of the process exhausts every later request's headroom. The
 * symptom is unrelated users getting 503s from a healthy provider.
 *
 * So the container exposes a FACTORY. Every assistant turn calls it and gets a
 * fresh budget derived from LLM_BUDGET in config/limits.ts. The provider is
 * stateless and stays shared — it holds a credential and a base URL, not a
 * counter — and the client is a thin binding of the two, so making one per turn
 * costs an object allocation.
 *
 * This is a circuit breaker per unit of work, not a quota: there are no user
 * accounts to bill and no per-IP limiting until Phase I (§13).
 */

import { createAssistantEngine, type AssistantEngine } from './assistant/engine.ts'
import { createJsonToolCatalogue } from './catalogue/json.ts'
import type { ToolCatalogueRepository } from './catalogue/repository.ts'
import type { ServerEnv } from './config/env.ts'
import { LLM_BUDGET } from './config/limits.ts'
import { createBudget } from './llm/budget.ts'
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
  /** One client, one budget, one unit of work. Never share the result. */
  readonly createLLMClientForTurn: () => LLMClient
  readonly assistant: AssistantEngine
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

  // ...and the only line that names a concrete LLM provider. Stateless, so one
  // instance serves every request.
  const provider = createProvider({ env, ...(mock ? { mock } : {}) })

  const createLLMClientForTurn = (): LLMClient =>
    createLLMClient({
      provider,
      budget: createBudget({
        maxLlmCalls: LLM_BUDGET.maxLlmCalls,
        maxTokens: LLM_BUDGET.maxTokens,
      }),
      logger,
    })

  const assistant = createAssistantEngine({
    retrieval,
    catalogue,
    createClient: createLLMClientForTurn,
    logger,
  })

  return { env, logger, catalogue, retrieval, createLLMClientForTurn, assistant }
}
