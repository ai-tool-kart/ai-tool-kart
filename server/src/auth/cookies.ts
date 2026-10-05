/*
 * The session cookie.
 *
 *   HttpOnly    page JavaScript can never read the token
 *   Secure      production only (local dev is plain http://localhost)
 *   SameSite    Lax — see below
 *   Path=/      the whole site
 *   no Domain   host-only; in production the __Host- prefix makes the browser
 *               itself refuse the cookie unless Secure + Path=/ + no Domain
 *   Max-Age     the session's own absolute lifetime
 *
 * ── Why Lax ───────────────────────────────────────────────────────────────
 * Production serves the API through a Vercel rewrite (site/api/* → Railway),
 * so the browser sees ONE origin and the cookie is first-party. Locally the
 * site (localhost:5173) and API (localhost:3001) are different origins but
 * the SAME site (ports don't count), so Lax still sends it.
 *   - None would also send it on cross-site requests, the CSRF surface we
 *     want closed, and is unnecessary because nothing is cross-site.
 *   - Strict adds nothing for an API whose cookie is only ever sent by fetch
 *     from our own pages, and is easier to trip over.
 * Lax blocks the cookie on cross-site POSTs; http/middleware/originCheck.ts
 * is the second, independent CSRF layer.
 *
 * Parsing is done here rather than with cookie-parser: one header, one
 * cookie name, no signing — not worth a dependency.
 */

import type { CookieOptions, Request, Response } from 'express'
import { AUTH } from '../config/limits.ts'

export interface SessionCookieConfig {
  secure: boolean
}

export function sessionCookieName({ secure }: SessionCookieConfig): string {
  return secure ? AUTH.secureCookieName : AUTH.cookieName
}

function cookieOptions({ secure }: SessionCookieConfig): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/' }
}

/** Reads one cookie from the raw Cookie header. Undefined if absent or malformed. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() !== name) continue
    const raw = part.slice(index + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return undefined
    }
  }
  return undefined
}

export function readSessionCookie(req: Request, config: SessionCookieConfig): string | undefined {
  return readCookie(req.headers.cookie, sessionCookieName(config))
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date, config: SessionCookieConfig): void {
  res.cookie(sessionCookieName(config), token, {
    ...cookieOptions(config),
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  })
}

export function clearSessionCookie(res: Response, config: SessionCookieConfig): void {
  res.clearCookie(sessionCookieName(config), cookieOptions(config))
}
