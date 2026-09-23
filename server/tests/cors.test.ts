/*
 * createCors — http/cors.ts.
 *
 * Covers the Access-Control-Expose-Headers gap found while manually
 * verifying the rate limiter's client-side banner (SPEC-submit-backend.md
 * §8/§9): without it, `Retry-After` — set on a 429 by domain/errors.ts's
 * `rateLimited` — is invisible to `fetch()`'s `response.headers.get()` for a
 * cross-origin request, even though curl (not subject to CORS) sees it fine.
 * fetch() only exposes the small CORS-safelisted header set unless the
 * server explicitly opts a header in.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type { NextFunction, Request, Response } from 'express'
import { createCors } from '../src/http/cors.ts'

function callCors(
  cors: (req: Request, res: Response, next: NextFunction) => void,
  { origin, method = 'GET' }: { origin?: string; method?: string },
): { headers: Record<string, string>; nextCalled: boolean; ended: boolean; status: number | undefined } {
  const headers: Record<string, string> = {}
  let ended = false
  let status: number | undefined
  const req = { headers: { origin }, method } as unknown as Request
  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value
      return this
    },
    status(code: number) {
      status = code
      return this
    },
    end() {
      ended = true
      return this
    },
  } as unknown as Response
  let nextCalled = false
  const next: NextFunction = (() => {
    nextCalled = true
  }) as NextFunction

  cors(req, res, next)
  return { headers, nextCalled, ended, status }
}

await test('createCors', async (t) => {
  await t.test('an allowed origin gets Retry-After in Access-Control-Expose-Headers', () => {
    const cors = createCors({ allowedOrigins: ['http://localhost:5173'] })
    const { headers, nextCalled } = callCors(cors, { origin: 'http://localhost:5173' })

    assert.equal(headers['Access-Control-Allow-Origin'], 'http://localhost:5173')
    assert.equal(headers['Access-Control-Expose-Headers'], 'Retry-After')
    assert.equal(nextCalled, true)
  })

  await t.test('a disallowed origin gets no CORS headers at all', () => {
    const cors = createCors({ allowedOrigins: ['http://localhost:5173'] })
    const { headers, nextCalled } = callCors(cors, { origin: 'http://evil.example' })

    assert.equal(headers['Access-Control-Allow-Origin'], undefined)
    assert.equal(headers['Access-Control-Expose-Headers'], undefined)
    // Still falls through to the route — an unlisted origin is blocked by
    // the browser's own CORS enforcement, not by this server refusing to run.
    assert.equal(nextCalled, true)
  })

  await t.test('a same-origin request (no Origin header) gets no CORS headers, still calls next()', () => {
    const cors = createCors({ allowedOrigins: ['http://localhost:5173'] })
    const { headers, nextCalled } = callCors(cors, {})

    assert.equal(headers['Access-Control-Allow-Origin'], undefined)
    assert.equal(nextCalled, true)
  })

  await t.test('OPTIONS preflight from an allowed origin answers 204 and does not call next()', () => {
    const cors = createCors({ allowedOrigins: ['http://localhost:5173'] })
    const { headers, nextCalled, ended, status } = callCors(cors, {
      origin: 'http://localhost:5173',
      method: 'OPTIONS',
    })

    assert.equal(headers['Access-Control-Expose-Headers'], 'Retry-After')
    assert.equal(status, 204)
    assert.equal(ended, true)
    assert.equal(nextCalled, false)
  })

  await t.test('Vary: Origin is always set, allowed or not', () => {
    const cors = createCors({ allowedOrigins: ['http://localhost:5173'] })
    assert.equal(callCors(cors, { origin: 'http://evil.example' }).headers.Vary, 'Origin')
    assert.equal(callCors(cors, {}).headers.Vary, 'Origin')
  })
})
