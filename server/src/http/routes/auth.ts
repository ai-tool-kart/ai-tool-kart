/*
 * /api/auth — accounts and sessions.
 *
 *   POST /auth/register   201 { user }   creates the account and signs in
 *   POST /auth/login      200 { user }   always a fresh session
 *   POST /auth/logout     204            revokes server-side, clears the cookie
 *   GET  /auth/me         200 { user }   401 when not signed in
 *
 * The session token travels only in the Set-Cookie header; no response body
 * ever contains it, the password hash, or any other internal field.
 */

import { Router, type RequestHandler } from 'express'
import type { SessionCookieConfig } from '../../auth/cookies.ts'
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '../../auth/cookies.ts'
import { toPublicUser } from '../../auth/roles.ts'
import type { AuthService } from '../../auth/service.ts'
import { getAuth, requireAuth } from '../middleware/auth.ts'

export interface AuthRouterOptions {
  auth: AuthService
  cookie: SessionCookieConfig
  authenticate: RequestHandler
  originCheck: RequestHandler
  loginLimiter: RequestHandler
  registerLimiter: RequestHandler
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const { auth, cookie, authenticate, originCheck, loginLimiter, registerLimiter } = options
  const router = Router()

  router.use(originCheck, authenticate)

  router.post('/register', registerLimiter, async (req, res, next) => {
    try {
      const { user, session } = await auth.register(req.body)
      setSessionCookie(res, session.token, session.expiresAt, cookie)
      res.status(201).json({ user: toPublicUser(user) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      // Signing in from a browser that already holds a session replaces it.
      const previous = readSessionCookie(req, cookie)
      const { user, session } = await auth.login(req.body)
      if (previous) await auth.logout(previous)
      setSessionCookie(res, session.token, session.expiresAt, cookie)
      res.json({ user: toPublicUser(user) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/logout', async (req, res, next) => {
    try {
      await auth.logout(readSessionCookie(req, cookie))
      clearSessionCookie(res, cookie)
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: toPublicUser(getAuth(req).user) })
  })

  return router
}
