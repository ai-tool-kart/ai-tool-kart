/*
 * GET /api/health
 *
 * Reports only what actually exists. Phase B has no LLM provider and no
 * catalogue, so it does not claim to — a health check that reports the status
 * of a subsystem that has not been built is worse than no health check, because
 * it will keep reporting "ok" once the subsystem exists and is broken.
 *
 * Later phases add fields as the systems behind them land: `provider` in Phase
 * D/H, `catalogueDriver` and `catalogueSize` in Phase C
 * (ASSISTANT_ARCHITECTURE_PLAN.md §13).
 *
 * Nothing here is a secret, and nothing here may become one.
 */

import { Router } from 'express'
import type { ServerEnv } from '../../config/env.ts'
import { SERVER_VERSION } from '../../utils/version.ts'

export interface HealthResponse {
  status: 'ok'
  version: string
  environment: ServerEnv['environment']
  uptimeSeconds: number
}

export interface HealthRouteOptions {
  env: ServerEnv
}

export function createHealthRouter({ env }: HealthRouteOptions): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      version: SERVER_VERSION,
      environment: env.environment,
      uptimeSeconds: Math.round(process.uptime()),
    }
    res.json(body)
  })

  return router
}
