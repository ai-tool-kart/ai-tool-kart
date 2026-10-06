/*
 * User administration: listing, inspecting, and role management.
 *
 * Listing and inspecting are ADMIN operations (the route guards them).
 * Changing a role is SUPER_ADMIN only, and the rules are enforced HERE, in
 * the transaction that makes the change, rather than trusted to the route:
 *
 *   - nobody changes their own role (no self-promotion, and a super admin
 *     cannot demote themselves out of the last seat)
 *   - the actor's role is re-read inside the transaction: a super admin
 *     demoted a moment ago cannot finish a change they started before
 *   - TOOL_OWNER is never assigned by hand: asking for USER yields
 *     TOOL_OWNER when the person owns tools (roles.ts derivedRole); grant
 *     ownership (PUT /admin/tools/:id/owners/:userId) to make a TOOL_OWNER
 *   - the last active (not disabled) SUPER_ADMIN cannot be demoted. Every
 *     role change first locks all SUPER_ADMIN rows in id order, so two super
 *     admins demoting each other at the same instant serialize: the second
 *     finds it is no longer a super admin and is refused
 *   - lowering a role revokes that user's sessions, so a removed privilege
 *     cannot linger in an open tab. (Every request re-reads the role anyway;
 *     the revoke makes "you were signed out" explicit.)
 *   - every change is audited (USER_ROLE_CHANGED) in the same transaction;
 *     a no-op (same role) changes nothing and records nothing
 *
 * The bootstrap path for the first SUPER_ADMIN stays the CLI
 * (scripts/auth/setRole.ts); there is no HTTP route that can create one
 * without an existing super admin.
 */

import { recordAdminAction, type AuditEntryView } from '../admin/audit.ts'
import type { Paged } from '../admin/moderation.ts'
import type { Database } from '../db/client.ts'
import { conflict, forbidden, notFound, validationFailed } from '../domain/errors.ts'
import type { Prisma, User, UserRole } from '../generated/prisma/client.ts'
import { UUID_PATTERN, type Actor } from './ownership.ts'
import { derivedRole, ROLE_RANK, toPublicUser, type PublicUser } from './roles.ts'
import { RoleChangeSchema } from './schema.ts'

const USER_NOT_FOUND_MESSAGE = 'No user found with that id.'
/** Same words as http/middleware/auth.ts's role guard, so both refusals read alike. */
const NOT_PERMITTED_MESSAGE = 'Your account does not have permission to do that.'
export const LAST_SUPER_ADMIN_MESSAGE = 'This is the last active super admin. Promote someone else first.'

/** Roles a SUPER_ADMIN may set by hand. */
export const ASSIGNABLE_ROLES: readonly UserRole[] = ['USER', 'ADMIN', 'SUPER_ADMIN']

/** What an admin may see about an account. An allowlist: no hashes, no sessions. */
export interface AdminUserView {
  id: string
  email: string
  name: string | null
  role: UserRole
  emailVerified: boolean
  disabled: boolean
  createdAt: string
  lastLoginAt: string | null
  submissionCount: number
  ownedToolCount: number
}

export interface AdminUserDetail {
  user: AdminUserView
  ownedTools: { id: string; name: string; ownerSince: string }[]
  submissions: { id: string; name: string; status: string; submittedAt: string }[]
  /** Role changes and ownership grants/revocations that targeted this user. */
  history: AuditEntryView[]
  /** What the REQUESTING admin may set this user's role to. Empty = no role control. */
  assignableRoles: UserRole[]
}

export interface UserListQuery {
  page: number
  pageSize: number
  q?: string | undefined
  role?: UserRole[] | undefined
}

export interface UserAdminService {
  list(query: UserListQuery): Promise<Paged<AdminUserView>>
  get(actor: Actor, userId: string): Promise<AdminUserDetail>
  setRole(actor: Actor, targetUserId: string, rawBody: unknown, context?: { requestId?: string | undefined }): Promise<PublicUser>
}

type CountedUser = User & { _count: { submissions: number; ownedTools: number } }

function toAdminUser(user: CountedUser): AdminUserView {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    disabled: user.disabledAt !== null,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    submissionCount: user._count.submissions,
    ownedToolCount: user._count.ownedTools,
  }
}

const COUNTS = { _count: { select: { submissions: true, ownedTools: true } } } as const

export function assignableRolesFor(actor: Actor, targetUserId: string): UserRole[] {
  return actor.role === 'SUPER_ADMIN' && actor.id !== targetUserId ? [...ASSIGNABLE_ROLES] : []
}

export function createUserAdminService({ db }: { db: Database }): UserAdminService {
  return {
    async list({ page, pageSize, q, role }) {
      const where: Prisma.UserWhereInput = {
        ...(role && role.length > 0 ? { role: { in: role } } : {}),
        ...(q
          ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }
          : {}),
      }
      const [rows, total] = await Promise.all([
        db.user.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize, include: COUNTS }),
        db.user.count({ where }),
      ])
      return { items: rows.map(toAdminUser), total, page, pageSize }
    },

    async get(actor, userId) {
      if (!UUID_PATTERN.test(userId)) throw notFound(USER_NOT_FOUND_MESSAGE)
      const user = await db.user.findUnique({
        where: { id: userId },
        include: {
          ...COUNTS,
          ownedTools: { include: { tool: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
          submissions: { select: { id: true, name: true, status: true, submittedAt: true }, orderBy: { submittedAt: 'desc' }, take: 20 },
          adminAuditTargets: {
            include: { actor: { select: { id: true, email: true, name: true } }, targetTool: { select: { id: true, name: true } } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 50,
          },
        },
      })
      if (!user) throw notFound(USER_NOT_FOUND_MESSAGE)
      return {
        user: toAdminUser(user),
        ownedTools: user.ownedTools.map((row) => ({ id: row.tool.id, name: row.tool.name, ownerSince: row.createdAt.toISOString() })),
        submissions: user.submissions.map((row) => ({ ...row, submittedAt: row.submittedAt.toISOString() })),
        history: user.adminAuditTargets.map((event) => ({
          id: event.id,
          kind: 'admin',
          type: event.action,
          actorType: 'ADMIN',
          actor: event.actor,
          submission: null,
          tool: event.targetTool,
          targetUser: { id: user.id, email: user.email },
          fromStatus: null,
          toStatus: null,
          metadata: typeof event.metadata === 'object' && event.metadata !== null ? (event.metadata as Record<string, unknown>) : {},
          createdAt: event.createdAt.toISOString(),
        })),
        assignableRoles: assignableRolesFor(actor, user.id),
      }
    },

    async setRole(actor, targetUserId, rawBody, context = {}) {
      const parsed = RoleChangeSchema.safeParse(rawBody)
      if (!parsed.success) {
        throw validationFailed('Choose a valid role.', { role: parsed.error.issues[0]?.message ?? 'Invalid role.' })
      }
      if (targetUserId === actor.id) throw forbidden('You cannot change your own role.')
      if (!UUID_PATTERN.test(targetUserId)) throw notFound(USER_NOT_FOUND_MESSAGE)
      const requested: UserRole = parsed.data.role

      return db.$transaction(async (tx) => {
        // Serialize against every other change to the super-admin set (see header).
        await tx.$queryRaw`SELECT id FROM users WHERE role = 'SUPER_ADMIN' ORDER BY id FOR UPDATE`
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${targetUserId}::uuid FOR UPDATE`

        const current = await tx.user.findUnique({ where: { id: actor.id } })
        if (!current || current.role !== 'SUPER_ADMIN' || current.disabledAt !== null) throw forbidden(NOT_PERMITTED_MESSAGE)

        const target = await tx.user.findUnique({ where: { id: targetUserId } })
        if (!target) throw notFound(USER_NOT_FOUND_MESSAGE)

        const role = requested === 'USER' ? derivedRole('USER', await tx.toolOwner.count({ where: { userId: target.id } })) : requested
        if (role === target.role) return toPublicUser(target)

        if (target.role === 'SUPER_ADMIN') {
          const others = await tx.user.count({ where: { role: 'SUPER_ADMIN', disabledAt: null, id: { not: target.id } } })
          if (others === 0) throw conflict(LAST_SUPER_ADMIN_MESSAGE)
        }

        const updated = await tx.user.update({ where: { id: target.id }, data: { role } })
        if (ROLE_RANK[role] < ROLE_RANK[target.role]) {
          await tx.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } })
        }
        await recordAdminAction(tx, {
          actorUserId: actor.id,
          action: 'USER_ROLE_CHANGED',
          targetUserId: target.id,
          metadata: { from: target.role, to: role, requested },
          requestId: context.requestId,
        })
        return toPublicUser(updated)
      })
    },
  }
}
