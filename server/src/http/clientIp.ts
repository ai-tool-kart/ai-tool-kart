/*
 * The client IP used for rate limiting — and the ONLY way a forwarded IP is
 * ever believed.
 *
 * Default (and whenever anything below fails): Express's `req.ip`, governed
 * by `trust proxy` in app.ts exactly as before — 1 hop in production
 * (Railway's edge), none in development.
 *
 * Trusted proxy (Vercel → Railway, once verified on a preview deployment):
 * the proxy sends two headers,
 *
 *   x-atk-proxy-secret   TRUSTED_PROXY_SECRET, known only to the proxy and
 *                        this server (never to the browser)
 *   x-atk-client-ip      the client address the proxy itself observed
 *
 * and the forwarded IP is used ONLY when the secret matches (constant-time
 * compare of SHA-256 digests) AND the value is a syntactically valid IP. A
 * direct request to Railway cannot know the secret, so whatever it puts in
 * x-atk-client-ip is ignored and it is rate-limited by its real connecting
 * address. Fail-closed: a missing, wrong or unset secret never widens trust,
 * it only means the proxy's own address is used.
 *
 * Both headers are deleted from the request once read, so nothing
 * downstream (or a future log line) can see or reuse the secret.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import type { NextFunction, Request, Response } from 'express'

export const PROXY_SECRET_HEADER = 'x-atk-proxy-secret'
export const PROXY_CLIENT_IP_HEADER = 'x-atk-client-ip'

const resolved = new WeakMap<Request, string>()

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

/** The address rate limiters key on. Falls back to req.ip when the middleware hasn't run. */
export function clientIpOf(req: Request): string {
  return resolved.get(req) ?? req.ip ?? 'unknown'
}

export function createClientIp({ trustedProxySecret }: { trustedProxySecret?: string }) {
  const expected = trustedProxySecret ? digest(trustedProxySecret) : undefined

  return function clientIp(req: Request, _res: Response, next: NextFunction): void {
    const presented = single(req.headers[PROXY_SECRET_HEADER])
    const forwarded = single(req.headers[PROXY_CLIENT_IP_HEADER])
    delete req.headers[PROXY_SECRET_HEADER]
    delete req.headers[PROXY_CLIENT_IP_HEADER]

    let ip = req.ip ?? 'unknown'
    if (expected && presented !== undefined && forwarded !== undefined && isIP(forwarded) !== 0) {
      if (timingSafeEqual(digest(presented), expected)) ip = forwarded
    }
    resolved.set(req, ip)
    next()
  }
}
