/*
 * /api/me — the signed-in user's own records. The foundation the owner
 * dashboard (Phase 4) builds on; deliberately minimal for now.
 *
 *   GET /me/tools                     tools this user owns
 *   GET /me/tools/:toolId             one of them — NOT_FOUND if not theirs
 *   GET /me/submissions               their own submissions, newest first
 *   GET /me/submissions/:submissionId one of their submissions — NOT_FOUND if not theirs
 *
 * Every lookup goes through auth/ownership.ts with the AUTHENTICATED user;
 * the id in the URL is only ever the thing being asked about, never proof
 * of who is asking. Admins pass the same checks (moderation).
 */

import { Router, type RequestHandler } from 'express'
import type { OwnershipService } from '../../auth/ownership.ts'
import { toOwnerSubmission } from '../../submissions/ownerView.ts'
import { getAuth, requireAuth } from '../middleware/auth.ts'

export interface MeRouterOptions {
  ownership: OwnershipService
  authenticate: RequestHandler
  originCheck: RequestHandler
}

export function createMeRouter({ ownership, authenticate, originCheck }: MeRouterOptions): Router {
  const router = Router()
  router.use(originCheck, authenticate, requireAuth)

  router.get('/tools', async (req, res, next) => {
    try {
      res.json({ items: await ownership.listOwnedTools(getAuth(req).user) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/tools/:toolId', async (req, res, next) => {
    try {
      res.json({ tool: await ownership.getAccessibleTool(getAuth(req).user, req.params.toolId) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/submissions', async (req, res, next) => {
    try {
      const submissions = await ownership.listOwnSubmissions(getAuth(req).user)
      res.json({ items: submissions.map(toOwnerSubmission) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/submissions/:submissionId', async (req, res, next) => {
    try {
      const submission = await ownership.getAccessibleSubmission(getAuth(req).user, req.params.submissionId)
      res.json({ submission: toOwnerSubmission(submission) })
    } catch (error) {
      next(error)
    }
  })

  return router
}
