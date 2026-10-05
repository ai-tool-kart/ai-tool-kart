/*
 * Roles and the public view of a user. Pure — no database.
 *
 * ── Role vs ownership ─────────────────────────────────────────────────────
 * A ROLE answers "what kind of thing may this person do at all?". An
 * OWNERSHIP row answers "which specific tools may they manage?". They are
 * kept apart on purpose:
 *
 *   - Every per-tool check reads tool_owners (auth/ownership.ts). The role
 *     is never consulted for it, so a TOOL_OWNER role without an ownership
 *     row grants access to nothing.
 *   - TOOL_OWNER is maintained by the server as a label: granting a first
 *     ownership promotes USER → TOOL_OWNER; revoking the last demotes it
 *     back. Admins keep their admin role when they also own tools.
 *
 * Admin capability is a rank comparison; there is no per-permission matrix
 * yet because nothing needs one. ADMIN and SUPER_ADMIN also pass ownership
 * checks (moderators must be able to open any tool or submission); that
 * bypass lives in one place, ownership.ts, not in each route.
 */

import type { User, UserRole } from '../generated/prisma/client.ts'

export const ROLE_RANK: Record<UserRole, number> = {
  USER: 0,
  TOOL_OWNER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
}

export function hasRoleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum]
}

export function isAdmin(role: UserRole): boolean {
  return hasRoleAtLeast(role, 'ADMIN')
}

/** The role a non-admin should hold given how many tools they own. Admin roles are never derived. */
export function derivedRole(current: UserRole, ownedToolCount: number): UserRole {
  if (isAdmin(current)) return current
  return ownedToolCount > 0 ? 'TOOL_OWNER' : 'USER'
}

/**
 * Everything about a user that may leave the server. An allowlist, so a
 * column added to `users` later is private until someone adds it here.
 */
export interface PublicUser {
  id: string
  email: string
  name: string | null
  role: UserRole
  emailVerified: boolean
  createdAt: string
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  }
}
