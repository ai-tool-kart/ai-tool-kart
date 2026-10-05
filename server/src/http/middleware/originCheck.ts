/*
 * CSRF defence for cookie-authenticated routes — the second layer behind
 * SameSite=Lax (auth/cookies.ts).
 *
 * For state-changing methods (anything but GET/HEAD/OPTIONS):
 *
 *   Origin present          must be in the allowlist (CLIENT_ORIGIN)
 *   Origin absent, but
 *   Sec-Fetch-Site says     must be same-origin, same-site or none
 *   neither header          allowed: not a browser, so it cannot be carrying
 *                           a victim's cookie
 *
 * Browsers send Origin on every cross-origin request and on same-origin
 * POSTs, so a forged form or fetch from another site always fails here.
 *
 * Production note: with the Vercel /api rewrite the site origin itself is
 * the caller, so it must be listed in CLIENT_ORIGIN — the same list CORS
 * uses. There is deliberately ONE allowlist.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { forbidden } from '../../domain/errors.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none'])

export const CROSS_SITE_MESSAGE = 'This request did not come from AI Tool Kart.'

export function createOriginCheck(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins)
  return function originCheck(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) return next()

    const origin = req.headers.origin
    if (typeof origin === 'string') {
      return next(allowed.has(origin) ? undefined : forbidden(CROSS_SITE_MESSAGE))
    }

    const fetchSite = req.headers['sec-fetch-site']
    if (typeof fetchSite === 'string' && !TRUSTED_FETCH_SITES.has(fetchSite)) {
      return next(forbidden(CROSS_SITE_MESSAGE))
    }
    next()
  }
}
