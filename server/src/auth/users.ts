/*
 * Role management — the one operation reserved for SUPER_ADMIN.
 *
 * Rules, enforced here rather than trusted to the route:
 *   - nobody changes their own role (no self-promotion, and a super admin
 *     can't lock the system out of super admins by demoting themselves)
 *   - TOOL_OWNER is never assigned by hand: asking for USER yields
 *     TOOL_OWNER when the person owns tools (roles.ts derivedRole)
 *   - lowering a role revokes that user's sessions, so a removed privilege
 *     cannot linger in an open tab. (Every request re-reads the role anyway;
 *     the revoke makes "you were signed out" explicit.)
 */

import type { Database } from '../db/client.ts'
import { forbidden, notFound, validationFailed } from '../domain/errors.ts'
import type { UserRole } from '../generated/prisma/client.ts'
import { derivedRole, ROLE_RANK, toPublicUser, type PublicUser } from './roles.ts'
import { RoleChangeSchema } from './schema.ts'
import type { Actor } from './ownership.ts'
import type { SessionService } from './sessions.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface UserAdminService {
  setRole(actor: Actor, targetUserId: string, rawBody: unknown): Promise<PublicUser>
}

export function createUserAdminService({ db, sessions }: { db: Database; sessions: SessionService }): UserAdminService {
  return {
    async setRole(actor, targetUserId, rawBody) {
      const parsed = RoleChangeSchema.safeParse(rawBody)
      if (!parsed.success) {
        throw validationFailed('Choose a valid role.', { role: parsed.error.issues[0]?.message ?? 'Invalid role.' })
      }
      if (targetUserId === actor.id) throw forbidden('You cannot change your own role.')

      const target = UUID_PATTERN.test(targetUserId) ? await db.user.findUnique({ where: { id: targetUserId } }) : null
      if (!target) throw notFound('No user found with that id.')

      const requested: UserRole = parsed.data.role
      const role =
        requested === 'USER' ? derivedRole('USER', await db.toolOwner.count({ where: { userId: target.id } })) : requested

      const updated = await db.user.update({ where: { id: target.id }, data: { role } })
      if (ROLE_RANK[role] < ROLE_RANK[target.role]) await sessions.revokeAllForUser(target.id)
      return toPublicUser(updated)
    },
  }
}
