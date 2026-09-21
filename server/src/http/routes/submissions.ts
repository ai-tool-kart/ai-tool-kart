/*
 * POST /api/submissions — SPEC-submit-backend.md §7.
 *
 * Rate limiting (§7 step 1 / §9) is applied directly to this one route, not
 * router-wide via router.use() — so a future non-POST route added to this
 * router (an admin listing, say) is never accidentally throttled by a limit
 * meant for intake abuse.
 *
 * The honeypot check (§7 step 2) is slice 7 — absent here on purpose, not
 * forgotten. Nothing is reserved for it, for the same reason routes/index.ts's
 * own header gives: a middleware slot that does nothing is a middleware
 * someone assumes is already protecting them.
 */

import { Router, type RequestHandler } from 'express'
import { createRateLimiter } from '../middleware/rateLimit.ts'
import type { SubmissionService } from '../../submissions/service.ts'

export interface SubmissionsRouterOptions {
  service: SubmissionService
  /** Test seam: inject a rate limiter (e.g. with a fake clock). Defaults to a real one. */
  rateLimiter?: RequestHandler
}

export function createSubmissionsRouter({
  service,
  rateLimiter = createRateLimiter(),
}: SubmissionsRouterOptions): Router {
  const router = Router()

  router.post('/', rateLimiter, (req, res, next) => {
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
