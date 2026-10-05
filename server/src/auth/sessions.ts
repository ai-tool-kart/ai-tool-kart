/*
 * Server-side sessions: create, resolve, revoke.
 *
 * resolve() is the ONE function that turns a cookie into an identity, and it
 * reads the user row fresh on every request — so a role change, a disabled
 * account or a revoked session takes effect on the very next request, not
 * when some cached claim expires. A session authenticates only if ALL hold:
 *
 *   token is well-formed  →  its hash exists  →  not revoked  →
 *   not expired  →  the user is not disabled
 *
 * Expiry is absolute (AUTH.sessionTtlMs from creation) and is never
 * extended. last_used_at is touched at most once per
 * AUTH.sessionTouchIntervalMs so reads don't turn into a write per request.
 */

import { AUTH } from '../config/limits.ts'
import type { Database } from '../db/client.ts'
import type { Session, User } from '../generated/prisma/client.ts'
import { errorFields, type Logger } from '../utils/logger.ts'
import { generateSessionToken, hashSessionToken, isWellFormedToken } from './tokens.ts'

export interface AuthContext {
  user: User
  session: Session
}

export interface CreatedSession {
  /** The raw token. Goes into the cookie and nowhere else — never logged, never stored. */
  token: string
  expiresAt: Date
}

export interface SessionService {
  create(userId: string): Promise<CreatedSession>
  resolve(token: string | undefined): Promise<AuthContext | null>
  /** Idempotent. Unknown or already-revoked tokens are not an error. */
  revoke(token: string): Promise<void>
  revokeAllForUser(userId: string): Promise<number>
}

export interface CreateSessionServiceOptions {
  db: Database
  logger: Logger
  /** Test seam for expiry. */
  now?: () => Date
}

export function createSessionService({ db, logger, now = () => new Date() }: CreateSessionServiceOptions): SessionService {
  return {
    async create(userId) {
      const createdAt = now()
      const token = generateSessionToken()
      const expiresAt = new Date(createdAt.getTime() + AUTH.sessionTtlMs)
      await db.session.create({
        data: { userId, tokenHash: hashSessionToken(token), createdAt, lastUsedAt: createdAt, expiresAt },
      })
      return { token, expiresAt }
    },

    async resolve(token) {
      if (!token || !isWellFormedToken(token)) return null
      const session = await db.session.findUnique({
        where: { tokenHash: hashSessionToken(token) },
        include: { user: true },
      })
      if (!session) return null

      const current = now()
      if (session.revokedAt !== null) return null
      if (session.expiresAt.getTime() <= current.getTime()) return null
      if (session.user.disabledAt !== null) return null

      if (current.getTime() - session.lastUsedAt.getTime() >= AUTH.sessionTouchIntervalMs) {
        // Best-effort bookkeeping; a failed touch must not fail the request.
        await db.session
          .update({ where: { id: session.id }, data: { lastUsedAt: current } })
          .catch((error: unknown) => logger.warn('Could not update session last_used_at', errorFields(error)))
      }

      const { user, ...rest } = session
      return { user, session: rest }
    },

    async revoke(token) {
      if (!isWellFormedToken(token)) return
      await db.session.updateMany({
        where: { tokenHash: hashSessionToken(token), revokedAt: null },
        data: { revokedAt: now() },
      })
    },

    async revokeAllForUser(userId) {
      const result = await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now() } })
      return result.count
    },
  }
}
