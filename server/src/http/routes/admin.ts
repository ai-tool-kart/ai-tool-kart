/*
 * /api/admin — privileged operations. Every route here sits behind
 * requireRole; nothing relies on the client hiding a button.
 *
 *   ADMIN and above
 *     GET    /admin/tools/:toolId/owners           who manages a tool
 *     PUT    /admin/tools/:toolId/owners/:userId   grant (idempotent)
 *     DELETE /admin/tools/:toolId/owners/:userId   revoke (idempotent)
 *
 *   SUPER_ADMIN only
 *     PATCH  /admin/users/:userId/role  { role }   USER | ADMIN | SUPER_ADMIN
 *
 * Phase 3 adds the submission moderation routes to this router.
 */

import { Router, type RequestHandler } from 'express'
import type { OwnershipService } from '../../auth/ownership.ts'
import type { UserAdminService } from '../../auth/users.ts'
import { getAuth, requireRole } from '../middleware/auth.ts'

export interface AdminRouterOptions {
  ownership: OwnershipService
  userAdmin: UserAdminService
  authenticate: RequestHandler
  originCheck: RequestHandler
}

export function createAdminRouter({ ownership, userAdmin, authenticate, originCheck }: AdminRouterOptions): Router {
  const router = Router()
  router.use(originCheck, authenticate, requireRole('ADMIN'))

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
      const result = await ownership.grant(toolId, userId, getAuth(req).user.id)
      res.status(result.created ? 201 : 200).json({ toolId, userId, role: result.role })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/tools/:toolId/owners/:userId', async (req, res, next) => {
    try {
      const { toolId, userId } = req.params
      const result = await ownership.revoke(toolId, userId)
      res.json({ toolId, userId, removed: result.removed, role: result.role })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/users/:userId/role', requireRole('SUPER_ADMIN'), async (req, res, next) => {
    try {
      // Typed loosely by Express because of the extra middleware; the route
      // pattern guarantees it is a single string.
      const { userId } = req.params as { userId: string }
      res.json({ user: await userAdmin.setRole(getAuth(req).user, userId, req.body) })
    } catch (error) {
      next(error)
    }
  })

  return router
}
