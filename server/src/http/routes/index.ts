/*
 * Route table.
 *
 * Mounting only — no markup, no state, no business logic, mirroring how
 * client/src/App.tsx keeps its route table free of everything but routes.
 *
 * Every router is handed collaborators from the container. None of them
 * constructs a dependency, and none names a concrete implementation
 * (ASSISTANT_ARCHITECTURE_PLAN.md §6.4).
 *
 * Phase E mounts /assistant here, with the engine behind it, not before.
 */

import { Router } from 'express'
import { HEALTH, TAXONOMY_API, TOOLS_API } from '../../config/limits.ts'
import type { Container } from '../../container.ts'
import { createHealthRouter } from './health.ts'
import { createTaxonomyRouter, createToolsRouter } from './tools.ts'

export function createApiRouter(container: Container): Router {
  const router = Router()

  router.use(
    HEALTH.path,
    createHealthRouter({ env: container.env, catalogue: container.catalogue }),
  )
  router.use(
    TOOLS_API.path,
    createToolsRouter({ catalogue: container.catalogue, retrieval: container.retrieval }),
  )
  router.use(TAXONOMY_API.path, createTaxonomyRouter({ retrieval: container.retrieval }))

  return router
}
