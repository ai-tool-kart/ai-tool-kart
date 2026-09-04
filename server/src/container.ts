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
 * Phase B is intentionally skeletal. As later phases land it grows to:
 *
 *   const catalogue = createJsonToolCatalogue({ logger })     // Phase C
 *   const retrieval = createRetrievalService({ catalogue })   // Phase C
 *   const llm       = createLLMClient({ provider, budget })   // Phase D
 *   const assistant = createAssistantEngine({ retrieval, llm, logger })  // Phase E
 *
 * Nothing is stubbed here in advance. A placeholder that returns undefined is
 * a dependency the rest of the code learns to work around.
 */

import type { ServerEnv } from './config/env.ts'
import type { Logger } from './utils/logger.ts'

export interface Container {
  readonly env: ServerEnv
  readonly logger: Logger
}

export interface CreateContainerOptions {
  env: ServerEnv
  logger: Logger
}

export function createContainer({ env, logger }: CreateContainerOptions): Container {
  return { env, logger }
}
