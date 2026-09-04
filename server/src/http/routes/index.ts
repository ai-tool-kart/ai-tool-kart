/*
 * Route table.
 *
 * Mounting only — no markup, no state, no business logic, mirroring how
 * client/src/App.tsx keeps its route table free of everything but routes.
 *
 * Phase C mounts /tools and /taxonomy here; Phase E mounts /assistant. Each
 * arrives with the service behind it, not before.
 */

import { Router } from 'express'
import { HEALTH } from '../../config/limits.ts'
import type { Container } from '../../container.ts'
import { createHealthRouter } from './health.ts'

export function createApiRouter(container: Container): Router {
  const router = Router()

  router.use(HEALTH.path, createHealthRouter({ env: container.env }))

  return router
}
