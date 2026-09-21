/*
 * POST /api/submissions — SPEC-submit-backend.md §7.
 *
 * Both abuse-control steps (§7 steps 1-2) are applied directly to this one
 * route, not router-wide via router.use() — so a future non-POST route added
 * to this router (an admin listing, say) is never accidentally caught by
 * either. Order matters and matches §7 exactly: rate limit, then honeypot,
 * then the handler — which starts with submissions/service.ts's own zod
 * parse (§7 step 3).
 */

import { Router, type RequestHandler } from 'express'
import { honeypot } from '../middleware/honeypot.ts'
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

  router.post('/', rateLimiter, honeypot, (req, res, next) => {
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
