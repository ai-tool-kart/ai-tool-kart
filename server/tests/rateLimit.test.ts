/*
 * createRateLimiter — SPEC-submit-backend.md §9.
 *
 * Unlike every other middleware test in this suite, this one calls the
 * returned handler DIRECTLY with hand-built req/res/next stand-ins, rather
 * than going through withServer()+fetch(). Two of the required cases force
 * that: "separate IPs have separate buckets" needs a caller-chosen `req.ip`,
 * which a real loopback test server cannot vary (there is no proxy in the
 * test environment for a spoofed X-Forwarded-For to matter, and connecting
 * from a genuinely different source address isn't practical in a test); and
 * "after the window passes" needs to advance time without a real sleep. No
 * existing middleware in this codebase needed either, so there was no
 * precedent to follow here — this is the seam that needed inventing.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { RATE_LIMIT } from '../src/config/limits.ts'
import { ApiError, isApiError } from '../src/domain/errors.ts'
import { createRateLimiter } from '../src/http/middleware/rateLimit.ts'

/** Calls the middleware once for `ip`; returns whatever it passed to next(). */
function callLimiter(limiter: RequestHandler, ip: string): unknown {
  let passedToNext: unknown = 'NEXT_WAS_NOT_CALLED'
  const req = { ip } as unknown as Request
  const res = {} as Response
  const next: NextFunction = ((error?: unknown) => {
    passedToNext = error
  }) as NextFunction

  limiter(req, res, next)
  return passedToNext
}

function assertAllowed(result: unknown, message: string): void {
  assert.equal(result, undefined, message)
}

function assertRateLimited(result: unknown, message: string): ApiError {
  assert.ok(isApiError(result), message)
  const error = result as ApiError
  assert.equal(error.code, 'RATE_LIMITED')
  assert.equal(error.status, 429)
  return error
}

await test('createRateLimiter', async (t) => {
  await t.test(
    `${RATE_LIMIT.maxPerWindow} requests from one IP pass; the next is 429 with Retry-After`,
    () => {
      let time = 0
      const limiter = createRateLimiter({ now: () => time })

      for (let i = 0; i < RATE_LIMIT.maxPerWindow; i++) {
        assertAllowed(callLimiter(limiter, '203.0.113.1'), `request ${i + 1} should be allowed`)
        time += 1000 // a second apart — comfortably inside the window either way
      }

      const blocked = assertRateLimited(
        callLimiter(limiter, '203.0.113.1'),
        `request ${RATE_LIMIT.maxPerWindow + 1} should be blocked`,
      )

      const retryAfter = Number(blocked.headers?.['Retry-After'])
      assert.ok(Number.isFinite(retryAfter), 'Retry-After must be present and numeric')
      // The oldest counted request was at time 0; the window resets exactly
      // RATE_LIMIT.windowMs after it.
      const expected = Math.ceil((RATE_LIMIT.windowMs - time) / 1000)
      assert.equal(retryAfter, expected)
      assert.ok(retryAfter > 0, 'Retry-After must never be zero or negative')
    },
  )

  await t.test('separate IPs have separate buckets', () => {
    const limiter = createRateLimiter({ now: () => 0 })

    for (let i = 0; i < RATE_LIMIT.maxPerWindow; i++) {
      assertAllowed(callLimiter(limiter, '198.51.100.1'), `IP A request ${i + 1} allowed`)
    }
    assertRateLimited(callLimiter(limiter, '198.51.100.1'), 'IP A is now exhausted')

    assertAllowed(
      callLimiter(limiter, '198.51.100.2'),
      "a different IP's first request must not inherit IP A's exhausted bucket",
    )
  })

  await t.test('after the window passes, a submission is allowed again', () => {
    let time = 0
    const limiter = createRateLimiter({ now: () => time })

    for (let i = 0; i < RATE_LIMIT.maxPerWindow; i++) callLimiter(limiter, '192.0.2.1')
    assertRateLimited(callLimiter(limiter, '192.0.2.1'), 'exhausted within the window')

    time += RATE_LIMIT.windowMs + 1
    assertAllowed(callLimiter(limiter, '192.0.2.1'), 'the window has fully rolled over')
  })

  await t.test('the window is rolling, not fixed: partial recovery mid-window', () => {
    // All maxPerWindow requests at t=0, then one more exactly windowMs+1
    // later lands after every one of the originals has aged out — a rolling
    // window, not a bucket that refills all-or-nothing on a fixed schedule.
    let time = 0
    const limiter = createRateLimiter({ now: () => time })

    for (let i = 0; i < RATE_LIMIT.maxPerWindow; i++) callLimiter(limiter, '192.0.2.5')
    assertRateLimited(callLimiter(limiter, '192.0.2.5'), 'exhausted')

    time = RATE_LIMIT.windowMs - 1
    assertRateLimited(callLimiter(limiter, '192.0.2.5'), 'still inside the original window')

    time = RATE_LIMIT.windowMs + 1
    assertAllowed(callLimiter(limiter, '192.0.2.5'), 'every original request has now aged out')
  })

  await t.test("pruning removes an idle IP's bucket, not just its timestamps", () => {
    // Allow/deny behaviour cannot tell "the bucket was deleted" apart from
    // "the bucket was merely filtered to empty on read" — both look
    // identical from the middleware boundary, since reads already filter by
    // window regardless of whether a sweep ever runs. So this asserts on
    // bucketCount() (rateLimit.ts's test-only introspection hook) directly,
    // which is a genuine claim about the Map's size — and would fail if
    // sweepStaleBuckets's buckets.delete(ip) call were ever removed.
    let time = 1_000_000
    const limiter = createRateLimiter({ now: () => time })

    callLimiter(limiter, '10.0.0.1')
    callLimiter(limiter, '10.0.0.2')
    callLimiter(limiter, '10.0.0.3')
    assert.equal(limiter.bucketCount(), 3, 'three distinct IPs, three buckets')

    // A sweep only runs once a full window has passed since the last one
    // (rateLimit.ts's sweepStaleBuckets), and only the next call triggers
    // it — there is no background timer.
    time += RATE_LIMIT.windowMs + 1
    callLimiter(limiter, '10.0.0.4')

    assert.equal(
      limiter.bucketCount(),
      1,
      'the three idle buckets must be gone, leaving only the one just created',
    )
  })
})
