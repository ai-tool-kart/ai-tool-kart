/*
 * /api/admin — privileged operations. Every route here sits behind
 * requireRole; nothing relies on the client hiding a button. The services
 * re-check what only they can (current status, row locks, the actor's role
 * inside the transaction), so a route is never the only line of defence.
 *
 *   ADMIN and above
 *     GET    /admin/stats                                dashboard numbers
 *     GET    /admin/vocabulary                           taxonomy + field limits for admin forms
 *     GET    /admin/submissions                          moderation queue (paginated, filterable)
 *     GET    /admin/submissions/:submissionId            full review record + history
 *     POST   /admin/submissions/:submissionId/approve          { tool: {...} }
 *     POST   /admin/submissions/:submissionId/reject           { reason }
 *     POST   /admin/submissions/:submissionId/request-changes  { message }
 *     POST   /admin/submissions/:submissionId/notes            { note }   internal only
 *     GET    /admin/tools                                catalogue (database) list
 *     GET    /admin/tools/:toolId                        one tool, owners, issues, history
 *     PATCH  /admin/tools/:toolId                        { expectedUpdatedAt, changes }
 *     GET    /admin/tools/:toolId/owners                 who manages a tool
 *     PUT    /admin/tools/:toolId/owners/:userId         grant (idempotent)
 *     DELETE /admin/tools/:toolId/owners/:userId         revoke (idempotent)
 *     GET    /admin/users                                accounts (paginated)
 *     GET    /admin/users/:userId                        one account
 *     GET    /admin/audit                                merged, read-only audit timeline
 *
 *   SUPER_ADMIN only
 *     PATCH  /admin/users/:userId/role  { role }   USER | ADMIN | SUPER_ADMIN
 *
 * There is deliberately no route that edits or deletes an audit entry, and
 * none that deletes a tool or a submission.
 */

import { Router, type RequestHandler } from 'express'
import type { AuditService } from '../../admin/audit.ts'
import type { ModerationService } from '../../admin/moderation.ts'
import { AuditListQuerySchema, SubmissionListQuerySchema, ToolListQuerySchema, UserListQuerySchema } from '../../admin/schema.ts'
import type { StatsService } from '../../admin/stats.ts'
import type { ToolAdminService } from '../../admin/tools.ts'
import type { OwnershipService } from '../../auth/ownership.ts'
import { ASSIGNABLE_ROLES, type UserAdminService } from '../../auth/users.ts'
import {
  PRICING_MODELS,
  PRICING_MODELS_BY_TIER,
  PRICING_TIERS,
  ROLES,
  TOOL_CATEGORIES,
  USE_CASES,
  WORKFLOW_STAGES,
} from '../../catalogue/taxonomy.ts'
import { ADMIN, TOOL_FIELDS } from '../../config/limits.ts'
import { getAuth, requireRole } from '../middleware/auth.ts'
import { requestIdOf } from '../requestLogger.ts'
import { parseOrThrow } from '../validate.ts'

export interface AdminRouterOptions {
  ownership: OwnershipService
  userAdmin: UserAdminService
  moderation: ModerationService
  toolAdmin: ToolAdminService
  audit: AuditService
  stats: StatsService
  authenticate: RequestHandler
  originCheck: RequestHandler
}

/** Static for the life of the process: the taxonomy is compiled in. */
const VOCABULARY = {
  categories: TOOL_CATEGORIES,
  pricingModels: PRICING_MODELS,
  pricingTiers: PRICING_TIERS,
  pricingModelsByTier: PRICING_MODELS_BY_TIER,
  roles: ROLES,
  stages: WORKFLOW_STAGES,
  useCases: USE_CASES,
  toolFields: TOOL_FIELDS,
  moderation: { reasonMinChars: ADMIN.reasonMinChars, reasonMaxChars: ADMIN.reasonMaxChars, noteMaxChars: ADMIN.noteMaxChars },
  assignableRoles: ASSIGNABLE_ROLES,
}

export function createAdminRouter({
  ownership,
  userAdmin,
  moderation,
  toolAdmin,
  audit,
  stats,
  authenticate,
  originCheck,
}: AdminRouterOptions): Router {
  const router = Router()
  router.use(originCheck, authenticate, requireRole('ADMIN'))
  // Admin data is per-session and changes constantly: never cache it anywhere.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  const context = (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => ({
    actor: getAuth(req).user,
    requestId: requestIdOf(res),
  })

  router.get('/stats', async (_req, res, next) => {
    try {
      res.json(await stats.get())
    } catch (error) {
      next(error)
    }
  })

  router.get('/vocabulary', (_req, res) => {
    res.json(VOCABULARY)
  })

  /* ── Moderation ─────────────────────────────────────────────────────── */

  router.get('/submissions', async (req, res, next) => {
    try {
      res.json(await moderation.list(parseOrThrow(SubmissionListQuerySchema, req.query, 'query')))
    } catch (error) {
      next(error)
    }
  })

  router.get('/submissions/:submissionId', async (req, res, next) => {
    try {
      res.json({ submission: await moderation.get(req.params.submissionId) })
    } catch (error) {
      next(error)
    }
  })

  const decisions = {
    approve: moderation.approve,
    reject: moderation.reject,
    'request-changes': moderation.requestChanges,
    notes: moderation.addNote,
  } as const

  for (const [path, decide] of Object.entries(decisions)) {
    router.post(`/submissions/:submissionId/${path}`, async (req, res, next) => {
      try {
        const { submissionId } = req.params as { submissionId: string }
        res.json({ submission: await decide(submissionId, req.body, context(req, res)) })
      } catch (error) {
        next(error)
      }
    })
  }

  /* ── Catalogue ──────────────────────────────────────────────────────── */

  router.get('/tools', async (req, res, next) => {
    try {
      res.json(await toolAdmin.list(parseOrThrow(ToolListQuerySchema, req.query, 'query')))
    } catch (error) {
      next(error)
    }
  })

  router.get('/tools/:toolId', async (req, res, next) => {
    try {
      res.json(await toolAdmin.get(req.params.toolId))
    } catch (error) {
      next(error)
    }
  })

  router.patch('/tools/:toolId', async (req, res, next) => {
    try {
      res.json(await toolAdmin.update(req.params.toolId, req.body, context(req, res)))
    } catch (error) {
      next(error)
    }
  })

  router.get('/tools/:toolId/owners', async (req, res, next) => {
    try {
      res.json({ items: await ownership.listOwners(req.params.toolId) })
    } catch (error) {
      next(error)
    }
  })

  router.put('/tools/:toolId/owners/:userId', async (req, res, next) => {
    try {
      const { toolId, userId } = req.params
      const result = await ownership.grant(toolId, userId, getAuth(req).user.id, { requestId: requestIdOf(res) })
      res.status(result.created ? 201 : 200).json({ toolId, userId, role: result.role })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/tools/:toolId/owners/:userId', async (req, res, next) => {
    try {
      const { toolId, userId } = req.params
      const result = await ownership.revoke(toolId, userId, { actorUserId: getAuth(req).user.id, requestId: requestIdOf(res) })
      res.json({ toolId, userId, removed: result.removed, role: result.role })
    } catch (error) {
      next(error)
    }
  })

  /* ── Users ──────────────────────────────────────────────────────────── */

  router.get('/users', async (req, res, next) => {
    try {
      res.json(await userAdmin.list(parseOrThrow(UserListQuerySchema, req.query, 'query')))
    } catch (error) {
      next(error)
    }
  })

  router.get('/users/:userId', async (req, res, next) => {
    try {
      res.json(await userAdmin.get(getAuth(req).user, req.params.userId))
    } catch (error) {
      next(error)
    }
  })

  router.patch('/users/:userId/role', requireRole('SUPER_ADMIN'), async (req, res, next) => {
    try {
      // Typed loosely by Express because of the extra middleware; the route
      // pattern guarantees it is a single string.
      const { userId } = req.params as { userId: string }
      res.json({ user: await userAdmin.setRole(getAuth(req).user, userId, req.body, { requestId: requestIdOf(res) }) })
    } catch (error) {
      next(error)
    }
  })

  /* ── Audit ──────────────────────────────────────────────────────────── */

  router.get('/audit', async (req, res, next) => {
    try {
      res.json(await audit.list(parseOrThrow(AuditListQuerySchema, req.query, 'query')))
    } catch (error) {
      next(error)
    }
  })

  return router
}
