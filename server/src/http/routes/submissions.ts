/*
 * POST /api/submissions — SPEC-submit-backend.md §7.
 *
 * Rate limiting (§7 step 1) and the honeypot check (step 2) are slices 5
 * and 7 — absent here on purpose, not forgotten. Nothing is reserved for
 * either, for the same reason routes/index.ts's own header gives: a
 * middleware slot that does nothing is a middleware someone assumes is
 * already protecting them.
 */

import { Router } from 'express'
import type { SubmissionService } from '../../submissions/service.ts'

export interface SubmissionsRouterOptions {
  service: SubmissionService
}

export function createSubmissionsRouter({ service }: SubmissionsRouterOptions): Router {
  const router = Router()

  router.post('/', (req, res, next) => {
    void (async () => {
      try {
        const { id, status, createdAt } = await service.submit(req.body)
        res.status(201).json({ id, status, createdAt })
      } catch (error) {
        next(error)
      }
    })()
  })

  return router
}
