/*
 * POST /api/submissions — SPEC-submit-backend.md §7, plus Phase 3 accounts.
 *
 * Two intakes, chosen once at startup by whether a database is configured:
 *
 *   accounts absent   (production today) the original anonymous intake —
 *                     JSON store, exactly as before. 201 { id, status, createdAt }.
 *   accounts present  the submitter must be signed in. The submission goes
 *                     to Postgres owned by the SESSION's user, with a
 *                     SUBMISSION_CREATED audit event (submissions/
 *                     accountService.ts). Same 201 shape, so the client
 *                     handles both identically.
 *
 * Order matters and keeps §7's: rate limit, then honeypot (a bot still gets
 * its fake 201, signed in or not), then — accounts only — the CSRF origin
 * check and session resolution, then the handler's zod parse. Both abuse
 * controls are applied to this route only, not router-wide.
 */

import { Router, type RequestHandler } from 'express'
import type { AccountSubmissionService } from '../../submissions/accountService.ts'
import type { SubmissionService } from '../../submissions/service.ts'
import { getAuth, requireAuth } from '../middleware/auth.ts'
import { honeypot } from '../middleware/honeypot.ts'
import { createRateLimiter } from '../middleware/rateLimit.ts'
import { requestIdOf } from '../requestLogger.ts'

export interface SubmissionAccountsOptions {
  submissions: AccountSubmissionService
  authenticate: RequestHandler
  originCheck: RequestHandler
}

export interface SubmissionsRouterOptions {
  service: SubmissionService
  /** Present when a database is configured: switches intake to signed-in, Postgres-backed. */
  accounts?: SubmissionAccountsOptions
  /** Test seam: inject a rate limiter (e.g. with a fake clock). Defaults to a real one. */
  rateLimiter?: RequestHandler
}

export function createSubmissionsRouter({
  service,
  accounts,
  rateLimiter = createRateLimiter(),
}: SubmissionsRouterOptions): Router {
  const router = Router()

  if (accounts) {
    router.post('/', rateLimiter, honeypot, accounts.originCheck, accounts.authenticate, requireAuth, async (req, res, next) => {
      try {
        const created = await accounts.submissions.submit(req.body, {
          actor: getAuth(req).user,
          requestId: requestIdOf(res),
        })
        res.status(201).json({ id: created.id, status: created.status, createdAt: created.submittedAt })
      } catch (error) {
        next(error)
      }
    })
    return router
  }

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
