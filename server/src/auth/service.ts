/*
 * Account operations: register, login, logout.
 *
 * Orchestration only — hashing is password.ts, tokens and session rows are
 * sessions.ts, input rules are schema.ts. HTTP-agnostic: throws the shared
 * ApiError vocabulary and lets the route decide what goes in the cookie.
 *
 * ── What login reveals ────────────────────────────────────────────────────
 * Unknown email, wrong password and disabled account all get the same
 * message AND roughly the same latency: an unknown email still runs one
 * scrypt verification against a throwaway hash, so response time does not
 * distinguish "no such account" from "wrong password".
 *
 * Registration necessarily says when an email is taken (EMAIL_TAKEN). Hiding
 * that properly needs an email-verification flow ("check your inbox"), which
 * is a separate decision — see the Phase 2B report.
 */

import { randomBytes } from 'node:crypto'
import type { Database } from '../db/client.ts'
import { emailTaken, unauthenticated, validationFailed } from '../domain/errors.ts'
import { Prisma, type User } from '../generated/prisma/client.ts'
import type { z } from 'zod'
import { hashPassword, needsRehash, verifyPassword, type ScryptParams } from './password.ts'
import { LoginSchema, RegisterSchema } from './schema.ts'
import type { CreatedSession, SessionService } from './sessions.ts'

export const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect.'
const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists. Log in instead.'

export interface AuthResult {
  user: User
  session: CreatedSession
}

export interface AuthService {
  register(rawBody: unknown): Promise<AuthResult>
  login(rawBody: unknown): Promise<AuthResult>
  logout(token: string | undefined): Promise<void>
}

export interface CreateAuthServiceOptions {
  db: Database
  sessions: SessionService
  /** Test seam: cheaper scrypt parameters so the suite stays fast. Production uses AUTH.scrypt. */
  scryptParams?: ScryptParams
  now?: () => Date
}

function fieldsFrom(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_'
    if (!(key in fields)) fields[key] = issue.message
  }
  return fields
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export function createAuthService({
  db,
  sessions,
  scryptParams,
  now = () => new Date(),
}: CreateAuthServiceOptions): AuthService {
  // A real hash of a random secret, made once on first use, so verifying
  // against an unknown email costs the same as verifying a real account.
  let dummyHash: Promise<string> | undefined
  const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(32).toString('base64url'), scryptParams))

  return {
    async register(rawBody) {
      const parsed = RegisterSchema.safeParse(rawBody)
      if (!parsed.success) throw validationFailed('Some account details need attention.', fieldsFrom(parsed.error))
      const { email, password, name } = parsed.data

      if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
        throw emailTaken(EMAIL_TAKEN_MESSAGE)
      }

      const passwordHash = await hashPassword(password, scryptParams)
      let user: User
      try {
        user = await db.user.create({
          data: { email, passwordHash, name: name ?? null, role: 'USER', lastLoginAt: now() },
        })
      } catch (error) {
        // Two registrations racing for the same address: the unique index decides.
        if (isUniqueViolation(error)) throw emailTaken(EMAIL_TAKEN_MESSAGE)
        throw error
      }

      return { user, session: await sessions.create(user.id) }
    },

    async login(rawBody) {
      const parsed = LoginSchema.safeParse(rawBody)
      if (!parsed.success) throw validationFailed('Enter your email and password.', fieldsFrom(parsed.error))
      const { email, password } = parsed.data

      const user = await db.user.findUnique({ where: { email } })
      if (!user) {
        await verifyPassword(password, await getDummyHash())
        throw unauthenticated(INVALID_CREDENTIALS_MESSAGE)
      }

      const valid = await verifyPassword(password, user.passwordHash)
      if (!valid || user.disabledAt !== null) throw unauthenticated(INVALID_CREDENTIALS_MESSAGE)

      const current = now()
      const passwordHash = needsRehash(user.passwordHash, scryptParams) ? await hashPassword(password, scryptParams) : undefined
      const updated = await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: current, ...(passwordHash ? { passwordHash } : {}) },
      })
      // Housekeeping: drop this user's long-dead sessions. Revoked rows that
      // have not expired yet are kept until they do.
      await db.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: current } } })

      // Always a NEW session: a pre-existing token is never upgraded to an
      // authenticated one, so session fixation has nothing to fix onto.
      return { user: updated, session: await sessions.create(user.id) }
    },

    async logout(token) {
      if (token) await sessions.revoke(token)
    },
  }
}
