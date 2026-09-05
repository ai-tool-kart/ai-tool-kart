/*
 * GET /api/health
 *
 * Reports only what actually exists. Phase B reported the process; now that a
 * catalogue exists behind the port, it reports the catalogue too — as
 * ASSISTANT_ARCHITECTURE_PLAN.md §13 specifies.
 *
 * `provider` is still absent. There is no LLM provider until Phase D, and a
 * health check that reports the status of a subsystem that has not been built is
 * worse than no health check: it keeps reporting "ok" once the subsystem exists
 * and is broken.
 *
 * One endpoint, not separate liveness and readiness probes. The catalogue loads
 * synchronously at boot and fails the process if it is invalid, so a server that
 * is listening is a server that is ready — there is no window in which the two
 * answers differ, and inventing one would be a contract to maintain for nothing.
 *
 * `catalogueDriver` is the repository's own `id`, read through the port. That it
 * happens to say "json" today is the adapter's business; this route never names
 * an implementation.
 *
 * Nothing here is a secret, and nothing here may become one.
 */

import { Router } from 'express'
import type { ToolCatalogueRepository } from '../../catalogue/repository.ts'
import type { ServerEnv } from '../../config/env.ts'
import { SERVER_VERSION } from '../../utils/version.ts'

export interface HealthResponse {
  status: 'ok'
  version: string
  environment: ServerEnv['environment']
  uptimeSeconds: number
  /** Active, recommendable records. */
  catalogueSize: number
  /** Which adapter is behind the repository port: 'json' now, 'postgres' later. */
  catalogueDriver: string
}

export interface HealthRouteOptions {
  env: ServerEnv
  catalogue: ToolCatalogueRepository
}

export function createHealthRouter({ env, catalogue }: HealthRouteOptions): Router {
  const router = Router()

  router.get('/', (_req, res, next) => {
    void (async () => {
      try {
        const body: HealthResponse = {
          status: 'ok',
          version: SERVER_VERSION,
          environment: env.environment,
          uptimeSeconds: Math.round(process.uptime()),
          catalogueSize: await catalogue.size(),
          catalogueDriver: catalogue.id,
        }
        res.json(body)
      } catch (error) {
        next(error)
      }
    })()
  })

  return router
}
