/*
 * Tool ownership and record-level authorization — the IDOR boundary.
 *
 * Every "may this user see/change THIS record?" question is answered here,
 * from the database, for the authenticated user resolved by sessions.ts.
 * Nothing in a URL, query string or body is ever trusted as proof of
 * ownership: a route passes the record id it was asked about and the
 * authenticated actor, and gets back either the record or NOT_FOUND.
 *
 * NOT_FOUND, not FORBIDDEN, on purpose: answering 403 for "exists but not
 * yours" and 404 for "doesn't exist" would let anyone enumerate which tool
 * ids and submission ids are real by probing. Both cases look identical.
 *
 * Admins (ADMIN, SUPER_ADMIN) pass every record check — moderation needs
 * them to. That is the only bypass, and it lives here, not in routes.
 */

import { SLUG_PATTERN } from '../catalogue/schema.ts'
import type { Database } from '../db/client.ts'
import { rowToTool } from '../db/legacy/mapping.ts'
import type { Tool } from '../domain/types.ts'
import { notFound } from '../domain/errors.ts'
import type { Submission, User, UserRole } from '../generated/prisma/client.ts'
import { derivedRole, isAdmin } from './roles.ts'

export const TOOL_NOT_FOUND_MESSAGE = 'No tool found with that id.'
export const SUBMISSION_NOT_FOUND_MESSAGE = 'No submission found with that id.'
const USER_NOT_FOUND_MESSAGE = 'No user found with that id.'

/** The minimum an authorization decision needs. A full User satisfies it. */
export interface Actor {
  id: string
  role: UserRole
}

export interface OwnedTool {
  tool: Tool
  /** When this user was given ownership. */
  ownerSince: string
}

export interface ToolOwnerView {
  userId: string
  email: string
  name: string | null
  ownerSince: string
  grantedByUserId: string | null
}

export interface OwnershipService {
  /** The tools `actor` personally owns. Admins see their own list too, not everyone's. */
  listOwnedTools(actor: Actor): Promise<OwnedTool[]>
  /** The tool, if `actor` owns it or is an admin. Otherwise NOT_FOUND. */
  getAccessibleTool(actor: Actor, toolId: string): Promise<Tool>
  /** The submission, if `actor` submitted it or is an admin. Otherwise NOT_FOUND. */
  getAccessibleSubmission(actor: Actor, submissionId: string): Promise<Submission>
  isOwner(userId: string, toolId: string): Promise<boolean>

  /* Admin operations. The CALLER (a route behind requireRole('ADMIN')) authorizes them. */
  listOwners(toolId: string): Promise<ToolOwnerView[]>
  grant(toolId: string, userId: string, grantedByUserId: string | null): Promise<{ created: boolean; role: UserRole }>
  revoke(toolId: string, userId: string): Promise<{ removed: boolean; role: UserRole }>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Every catalogue id matches SLUG_PATTERN (catalogue/schema.ts), so anything
 * else cannot exist. Checked BEFORE querying: some inputs (a NUL byte) make
 * Postgres reject the query outright, which would surface as a 500 — a
 * distinguishable answer — instead of the uniform NOT_FOUND.
 */
function isToolId(value: string): boolean {
  return value.length <= 100 && SLUG_PATTERN.test(value)
}

export function createOwnershipService({ db }: { db: Database }): OwnershipService {
  async function syncRole(tx: Pick<Database, 'user' | 'toolOwner'>, user: User): Promise<UserRole> {
    const owned = await tx.toolOwner.count({ where: { userId: user.id } })
    const role = derivedRole(user.role, owned)
    if (role !== user.role) await tx.user.update({ where: { id: user.id }, data: { role } })
    return role
  }

  return {
    async listOwnedTools(actor) {
      const rows = await db.toolOwner.findMany({
        where: { userId: actor.id },
        include: { tool: true },
        orderBy: { createdAt: 'asc' },
      })
      return rows.map((row) => ({ tool: rowToTool(row.tool), ownerSince: row.createdAt.toISOString() }))
    },

    async getAccessibleTool(actor, toolId) {
      if (!isToolId(toolId)) throw notFound(TOOL_NOT_FOUND_MESSAGE)
      const tool = isAdmin(actor.role)
        ? await db.tool.findUnique({ where: { id: toolId } })
        : (await db.toolOwner.findUnique({
            where: { toolId_userId: { toolId, userId: actor.id } },
            include: { tool: true },
          }))?.tool
      if (!tool) throw notFound(TOOL_NOT_FOUND_MESSAGE)
      return rowToTool(tool)
    },

    async getAccessibleSubmission(actor, submissionId) {
      // A malformed id would make Postgres reject the uuid cast (500); it
      // can't match anything, so answer exactly like an unknown id.
      if (!UUID_PATTERN.test(submissionId)) throw notFound(SUBMISSION_NOT_FOUND_MESSAGE)
      const submission = await db.submission.findFirst({
        where: isAdmin(actor.role) ? { id: submissionId } : { id: submissionId, userId: actor.id },
      })
      if (!submission) throw notFound(SUBMISSION_NOT_FOUND_MESSAGE)
      return submission
    },

    async isOwner(userId, toolId) {
      if (!isToolId(toolId) || !UUID_PATTERN.test(userId)) return false
      return (await db.toolOwner.count({ where: { toolId, userId } })) > 0
    },

    async listOwners(toolId) {
      if (!isToolId(toolId) || !(await db.tool.findUnique({ where: { id: toolId }, select: { id: true } }))) {
        throw notFound(TOOL_NOT_FOUND_MESSAGE)
      }
      const rows = await db.toolOwner.findMany({ where: { toolId }, include: { user: true }, orderBy: { createdAt: 'asc' } })
      return rows.map((row) => ({
        userId: row.userId,
        email: row.user.email,
        name: row.user.name,
        ownerSince: row.createdAt.toISOString(),
        grantedByUserId: row.grantedByUserId,
      }))
    },

    async grant(toolId, userId, grantedByUserId) {
      return db.$transaction(async (tx) => {
        if (!isToolId(toolId) || !(await tx.tool.findUnique({ where: { id: toolId }, select: { id: true } }))) {
          throw notFound(TOOL_NOT_FOUND_MESSAGE)
        }
        const user = UUID_PATTERN.test(userId) ? await tx.user.findUnique({ where: { id: userId } }) : null
        if (!user) throw notFound(USER_NOT_FOUND_MESSAGE)

        const existing = await tx.toolOwner.findUnique({ where: { toolId_userId: { toolId, userId } } })
        if (!existing) await tx.toolOwner.create({ data: { toolId, userId, grantedByUserId } })
        return { created: !existing, role: await syncRole(tx, user) }
      })
    },

    async revoke(toolId, userId) {
      return db.$transaction(async (tx) => {
        const user = UUID_PATTERN.test(userId) ? await tx.user.findUnique({ where: { id: userId } }) : null
        if (!user) throw notFound(USER_NOT_FOUND_MESSAGE)
        if (!isToolId(toolId)) return { removed: false, role: user.role }
        const { count } = await tx.toolOwner.deleteMany({ where: { toolId, userId } })
        return { removed: count > 0, role: await syncRole(tx, user) }
      })
    },
  }
}
