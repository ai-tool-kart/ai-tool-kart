/*
 * Authentication and role middleware.
 *
 *   authenticate      resolves the session cookie (if any) into an
 *                     AuthContext. Never rejects: anonymous is a valid state.
 *   requireAuth       401 unless authenticate found a live session
 *   requireRole(min)  401 if anonymous, 403 if the role ranks below `min`
 *
 * Mounted per router (auth, me, admin), NOT app-wide: the public catalogue,
 * assistant and submission routes never touch the database for identity, so
 * they keep working exactly as before with or without one.
 *
 * The context is kept in a WeakMap keyed by the request rather than by
 * augmenting Express's global Request type. getAuth() is the only reader.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { clearSessionCookie, readSessionCookie, type SessionCookieConfig } from '../../auth/cookies.ts'
import { hasRoleAtLeast } from '../../auth/roles.ts'
import type { AuthContext, SessionService } from '../../auth/sessions.ts'
import { forbidden, unauthenticated } from '../../domain/errors.ts'
import type { UserRole } from '../../generated/prisma/client.ts'

const contexts = new WeakMap<Request, AuthContext>()

export const LOGIN_REQUIRED_MESSAGE = 'Log in to continue.'
export const NOT_PERMITTED_MESSAGE = 'Your account does not have permission to do that.'

/** The authenticated context, or undefined for an anonymous request. */
export function findAuth(req: Request): AuthContext | undefined {
  return contexts.get(req)
}

/** For handlers behind requireAuth/requireRole. Throws if mounted without one — a wiring bug. */
export function getAuth(req: Request): AuthContext {
  const context = contexts.get(req)
  if (!context) throw unauthenticated(LOGIN_REQUIRED_MESSAGE)
  return context
}

export function createAuthenticate(sessions: SessionService, cookie: SessionCookieConfig): RequestHandler {
  return async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = readSessionCookie(req, cookie)
      if (token !== undefined) {
        const context = await sessions.resolve(token)
        if (context) contexts.set(req, context)
        // A cookie that no longer authenticates (expired, revoked, garbage)
        // is cleared so the browser stops sending it.
        else clearSessionCookie(res, cookie)
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  next(contexts.has(req) ? undefined : unauthenticated(LOGIN_REQUIRED_MESSAGE))
}

export function requireRole(minimum: UserRole): RequestHandler {
  return function roleGuard(req: Request, _res: Response, next: NextFunction): void {
    const context = contexts.get(req)
    if (!context) return next(unauthenticated(LOGIN_REQUIRED_MESSAGE))
    if (!hasRoleAtLeast(context.user.role, minimum)) return next(forbidden(NOT_PERMITTED_MESSAGE))
    next()
  }
}
