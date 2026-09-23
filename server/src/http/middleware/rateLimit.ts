/*
 * Rate limiting — SPEC-submit-backend.md §9.
 *
 * In-memory `Map<ip, timestamps[]>`, RATE_LIMIT.maxPerWindow requests per IP
 * per RATE_LIMIT.windowMs (config/limits.ts). Generic — nothing here names
 * "submissions" — applied to POST /api/submissions only by where it is
 * mounted (routes/submissions.ts), not by anything in this file.
 *
 * ── PER-PROCESS, not per-deployment ───────────────────────────────────────
 *
 * The Map lives in this module's closure, so it resets on every restart and
 * is never shared across replicas. Behind N instances of this server (a load
 * balancer, a process manager restarting workers), an IP effectively gets
 * up to N × RATE_LIMIT.maxPerWindow requests per window, one bucket per
 * instance that happens to receive its traffic — not a coordinated limit.
 * Fine for the single-instance deployment this app runs today; a shared
 * limit across replicas needs a shared store (Redis or the database), which
 * is out of scope here.
 *
 * ── Client IP, and the deployment assumption this depends on ─────────────
 *
 * Uses `req.ip`. app.ts currently sets `trust proxy` to `1` in production
 * only (`if (env.isProduction) app.set('trust proxy', 1)`) and leaves it
 * unset (false) in development — checked directly in app.ts before writing
 * this. `trust proxy: 1` tells Express to trust exactly the FIRST proxy
 * hop's X-Forwarded-For entry as the real client address.
 *
 * That is only correct under a SPECIFIC deployment shape: production sits
 * behind EXACTLY ONE trusted reverse proxy or load balancer, and that proxy
 * itself sets X-Forwarded-For to the connecting client's address (rather
 * than blindly forwarding whatever header a client sent). If that shape
 * changes — zero proxies in front, or more than one hop (a CDN in front of
 * a load balancer, say) — `req.ip` stops being trustworthy: with zero
 * proxies, `trust proxy: 1` would read a client-supplied header as if it
 * were the truth, making this limiter trivially bypassable; with two or
 * more hops, it reads the OUTER proxy's own address, collapsing every real
 * visitor behind it into one shared bucket. Fixing either case means
 * changing `trust proxy` in app.ts to match the real topology — not
 * something to guess at from inside this file, and not changed here.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { RATE_LIMIT } from '../../config/limits.ts'
import { rateLimited } from '../../domain/errors.ts'

export interface RateLimiterOptions {
  /** Test seam: an injectable clock, so tests advance time without sleeping. */
  now?: () => number
}

/**
 * A rate limiter's own middleware function, plus a second, test-only entry
 * point onto state that is otherwise private to this module's closure.
 * Express only ever calls it as a plain RequestHandler; `bucketCount` exists
 * because "pruning removes idle IPs" is a claim about the Map's SIZE, and
 * nothing about allow/deny behaviour at the middleware boundary can tell
 * "the bucket was deleted" apart from "the bucket was merely filtered to
 * empty on read" — both look identical from outside otherwise.
 */
export interface RateLimiterHandler extends RequestHandler {
  /** Distinct IPs with at least one timestamp still on record, right now. */
  bucketCount(): number
}

export function createRateLimiter({ now = Date.now }: RateLimiterOptions = {}): RateLimiterHandler {
  const buckets = new Map<string, number[]>()
  let lastSweptAt = now()

  /**
   * Drops every bucket with no timestamp left inside the window — the fix
   * for "an IP that submits once and never returns must not stay in memory
   * forever". Runs at most once per window: a full Map scan on every single
   * request would be wasted work for the vast majority of requests, which
   * touch only their own bucket below.
   */
  function sweepStaleBuckets(currentTime: number): void {
    if (currentTime - lastSweptAt < RATE_LIMIT.windowMs) return
    lastSweptAt = currentTime
    const cutoff = currentTime - RATE_LIMIT.windowMs
    for (const [ip, timestamps] of buckets) {
      if (timestamps.every((timestamp) => timestamp <= cutoff)) buckets.delete(ip)
    }
  }

  const rateLimiter = function rateLimiter(req: Request, _res: Response, next: NextFunction): void {
    const currentTime = now()
    sweepStaleBuckets(currentTime)

    const ip = req.ip ?? 'unknown'
    const cutoff = currentTime - RATE_LIMIT.windowMs
    // Timestamps are appended in call order and `now` only moves forward, so
    // this stays sorted ascending — recent[0], once the limit is hit below,
    // is genuinely the OLDEST request still counting against the window.
    const recent = (buckets.get(ip) ?? []).filter((timestamp) => timestamp > cutoff)

    if (recent.length >= RATE_LIMIT.maxPerWindow) {
      buckets.set(ip, recent)
      const oldest = recent[0] as number
      const retryAfterSeconds = Math.ceil((oldest + RATE_LIMIT.windowMs - currentTime) / 1000)
      next(
        rateLimited('Too many submissions from this address. Try again later.', retryAfterSeconds),
      )
      return
    }

    recent.push(currentTime)
    buckets.set(ip, recent)
    next()
  } as RateLimiterHandler

  rateLimiter.bucketCount = () => buckets.size

  return rateLimiter
}
