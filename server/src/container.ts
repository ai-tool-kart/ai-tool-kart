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
 * `createJsonToolCatalogue` is named HERE AND NOWHERE ELSE. Routes and the
 * retrieval service receive a ToolCatalogueRepository and cannot tell what is
 * behind it; swapping the catalogue for PostgreSQL is the one line below.
 *
 * As later phases land this grows to:
 *
 *   const llm       = createLLMClient({ provider, budget })              // Phase D
 *   const assistant = createAssistantEngine({ retrieval, llm, logger })  // Phase E
 *
 * Nothing is stubbed here in advance. A placeholder that returns undefined is
 * a dependency the rest of the code learns to work around.
 */

import { createJsonToolCatalogue } from './catalogue/json.ts'
import type { ToolCatalogueRepository } from './catalogue/repository.ts'
import type { ServerEnv } from './config/env.ts'
import { createRetrievalService, type RetrievalService } from './retrieval/service.ts'
import type { Logger } from './utils/logger.ts'

export interface Container {
  readonly env: ServerEnv
  readonly logger: Logger
  readonly catalogue: ToolCatalogueRepository
  readonly retrieval: RetrievalService
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
}

export function createContainer({
  env,
  logger,
  catalogue: injected,
}: CreateContainerOptions): Container {
  // The only line in the server that names a concrete repository implementation.
  const catalogue = injected ?? createJsonToolCatalogue({ logger })
  const retrieval = createRetrievalService({ catalogue, logger })

  return { env, logger, catalogue, retrieval }
}
