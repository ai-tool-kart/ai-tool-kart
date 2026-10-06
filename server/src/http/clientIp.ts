/*
 * The client IP used for rate limiting — and the ONLY place a forwarded IP is
 * ever believed. Resolution order, first match wins:
 *
 *   1. Trusted proxy (browser → Vercel /api rewrite → Railway). Requires
 *      x-atk-proxy-secret to match TRUSTED_PROXY_SECRET (constant-time compare
 *      of SHA-256 digests). Then the visitor is `x-vercel-forwarded-for`:
 *      Vercel's documented visitor-IP header. The rewrite in
 *      client/vercel.json deletes any visitor-supplied copy before Vercel
 *      adds its own, so with the secret present the value is Vercel's.
 *      Verified on a preview: spoofed values never arrived.
 *
 *   2. Platform edge (direct requests to Railway). When `trustPlatformRealIp`
 *      is on (production, behind Railway's edge), `x-real-ip`: Railway's
 *      edge OVERWRITES it with the connecting address — verified, a
 *      client-sent value is replaced. This replaces `req.ip`, which with
 *      `trust proxy` 1 resolved to a Railway edge hop and put every visitor
 *      behind the same edge into one shared bucket.
 *
 *   3. Fallback: Express's `req.ip`, as before (development and tests, where
 *      nothing in front of the server sets x-real-ip).
 *
 * Every candidate must be exactly ONE syntactically valid IP; a list, junk
 * or an empty value is ignored and resolution falls through. Fail-closed: no
 * header a caller can set on its own (without the secret, or outside the
 * platform edge) ever chooses the IP.
 *
 * The proxy headers are deleted once read, so nothing downstream (or a future
 * log line) can see the secret or reuse a forwarded value.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import type { NextFunction, Request, Response } from 'express'

export const PROXY_SECRET_HEADER = 'x-atk-proxy-secret'
/** Retired: Vercel cannot fill it. Still stripped, never trusted. */
export const PROXY_CLIENT_IP_HEADER = 'x-atk-client-ip'
export const VERCEL_CLIENT_IP_HEADER = 'x-vercel-forwarded-for'
export const PLATFORM_CLIENT_IP_HEADER = 'x-real-ip'

const resolved = new WeakMap<Request, string>()

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

/** Exactly one valid IPv4/IPv6 address, else undefined. Lists and junk are rejected. */
function oneIp(value: string | undefined): string | undefined {
  return value !== undefined && isIP(value) !== 0 ? value : undefined
}

/** The address rate limiters key on. Falls back to req.ip when the middleware hasn't run. */
export function clientIpOf(req: Request): string {
  return resolved.get(req) ?? req.ip ?? 'unknown'
}

export interface ClientIpOptions {
  trustedProxySecret?: string
  /**
   * Believe `x-real-ip` from the platform edge. Only true where an edge that
   * overwrites it sits in front of the server (production on Railway);
   * anywhere else a client could set it, so it must stay off.
   */
  trustPlatformRealIp?: boolean
}

export function createClientIp({ trustedProxySecret, trustPlatformRealIp = false }: ClientIpOptions) {
  const expected = trustedProxySecret ? digest(trustedProxySecret) : undefined

  return function clientIp(req: Request, _res: Response, next: NextFunction): void {
    const presented = single(req.headers[PROXY_SECRET_HEADER])
    const vercelIp = oneIp(single(req.headers[VERCEL_CLIENT_IP_HEADER]))
    const platformIp = oneIp(single(req.headers[PLATFORM_CLIENT_IP_HEADER]))
    delete req.headers[PROXY_SECRET_HEADER]
    delete req.headers[PROXY_CLIENT_IP_HEADER]
    delete req.headers[VERCEL_CLIENT_IP_HEADER]

    const viaTrustedProxy =
      expected !== undefined && presented !== undefined && timingSafeEqual(digest(presented), expected)

    let ip = req.ip ?? 'unknown'
    if (trustPlatformRealIp && platformIp) ip = platformIp
    if (viaTrustedProxy && vercelIp) ip = vercelIp

    resolved.set(req, ip)
    next()
  }
}
