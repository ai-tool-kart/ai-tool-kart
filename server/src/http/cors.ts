/*
 * CORS, hand-rolled against an exact-match origin allowlist.
 *
 * The `cors` package is ~1 dependency for ~30 lines of logic whose policy we
 * want to be able to read at a glance, and this repository ships a whole news
 * pipeline on two runtime dependencies. CLAUDE.md asks for a reason before a
 * dependency is added; "we needed to echo one header" is not one.
 *
 * The policy is deliberately strict:
 *   - exact origin match, never a wildcard and never a regex
 *   - an unlisted origin gets no CORS headers at all, so the browser blocks it
 *   - Vary: Origin is always sent, so a cache cannot serve one origin's
 *     response to another
 */

import type { NextFunction, Request, Response } from 'express'

export interface CorsOptions {
  /** Exact origins to permit. Empty disables CORS entirely. */
  allowedOrigins: string[]
  /** Methods this API exposes. */
  methods?: string[]
}

const DEFAULT_METHODS = ['GET', 'POST', 'OPTIONS']
const ALLOWED_HEADERS = ['Content-Type']
/**
 * Response headers `fetch()` may read for a cross-origin request. Without
 * this, only the small CORS-safelisted set (Content-Type, Content-Length,
 * etc.) is visible to client JS — a header an ApiError attaches itself, like
 * Retry-After on a 429 (domain/errors.ts's `rateLimited`), silently comes
 * back as `null` from `response.headers.get()` even though curl sees it
 * fine, because curl isn't subject to CORS at all.
 */
const EXPOSED_HEADERS = ['Retry-After']
const PREFLIGHT_MAX_AGE_SECONDS = 600

export function createCors({ allowedOrigins, methods = DEFAULT_METHODS }: CorsOptions) {
  const allowed = new Set(allowedOrigins)
  const methodList = methods.join(', ')
  const headerList = ALLOWED_HEADERS.join(', ')
  const exposedHeaderList = EXPOSED_HEADERS.join(', ')

  return function cors(req: Request, res: Response, next: NextFunction): void {
    // Always vary on Origin, even when we send nothing else: the response for
    // an allowed origin differs from the one for a disallowed origin.
    res.setHeader('Vary', 'Origin')

    const origin = req.headers.origin

    if (typeof origin === 'string' && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Methods', methodList)
      res.setHeader('Access-Control-Allow-Headers', headerList)
      res.setHeader('Access-Control-Expose-Headers', exposedHeaderList)
      res.setHeader('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE_SECONDS))
    }

    if (req.method === 'OPTIONS') {
      // Answer the preflight here rather than letting it fall through to the
      // 404 handler. 204 with no body is the correct response either way; a
      // disallowed origin simply received no Allow-Origin header above, which
      // is what makes the browser block the real request.
      res.status(204).end()
      return
    }

    next()
  }
}
