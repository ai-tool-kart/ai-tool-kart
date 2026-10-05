/*
 * http/clientIp.ts — a forwarded client IP is believed only with the shared
 * proxy secret. Everything else falls back to req.ip. No database.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response } from 'express'
import { clientIpOf, createClientIp, PROXY_CLIENT_IP_HEADER, PROXY_SECRET_HEADER } from '../src/http/clientIp.ts'
import { createRateLimiter } from '../src/http/middleware/rateLimit.ts'
import { isApiError } from '../src/domain/errors.ts'

const SECRET = 's'.repeat(40)

function request(headers: Record<string, string>, ip = '10.9.8.7'): Request {
  return { headers: { ...headers }, ip } as unknown as Request
}

function resolve(trustedProxySecret: string | undefined, req: Request): string {
  createClientIp({ trustedProxySecret })(req, {} as Response, () => {})
  return clientIpOf(req)
}

await test('client IP resolution', async (t) => {
  await t.test('a matching secret makes the forwarded IP the client IP', () => {
    const req = request({ [PROXY_SECRET_HEADER]: SECRET, [PROXY_CLIENT_IP_HEADER]: '203.0.113.5' })
    assert.equal(resolve(SECRET, req), '203.0.113.5')
  })

  await t.test('IPv6 forwarded addresses are accepted', () => {
    const req = request({ [PROXY_SECRET_HEADER]: SECRET, [PROXY_CLIENT_IP_HEADER]: '2001:db8::1' })
    assert.equal(resolve(SECRET, req), '2001:db8::1')
  })

  await t.test('a wrong or missing secret falls back to req.ip (direct-request spoofing fails)', () => {
    assert.equal(resolve(SECRET, request({ [PROXY_SECRET_HEADER]: 'guess', [PROXY_CLIENT_IP_HEADER]: '203.0.113.5' })), '10.9.8.7')
    assert.equal(resolve(SECRET, request({ [PROXY_CLIENT_IP_HEADER]: '203.0.113.5' })), '10.9.8.7')
  })

  await t.test('with no secret configured, forwarded headers are never trusted', () => {
    const req = request({ [PROXY_SECRET_HEADER]: SECRET, [PROXY_CLIENT_IP_HEADER]: '203.0.113.5' })
    assert.equal(resolve(undefined, req), '10.9.8.7')
  })

  await t.test('a non-IP forwarded value is ignored even with the right secret', () => {
    for (const bad of ['', 'not-an-ip', '203.0.113.5, 1.2.3.4', '999.1.1.1']) {
      const req = request({ [PROXY_SECRET_HEADER]: SECRET, [PROXY_CLIENT_IP_HEADER]: bad })
      assert.equal(resolve(SECRET, req), '10.9.8.7', bad)
    }
  })

  await t.test('both proxy headers are removed from the request once read', () => {
    const req = request({ [PROXY_SECRET_HEADER]: SECRET, [PROXY_CLIENT_IP_HEADER]: '203.0.113.5' })
    resolve(SECRET, req)
    assert.equal(PROXY_SECRET_HEADER in req.headers, false)
    assert.equal(PROXY_CLIENT_IP_HEADER in req.headers, false)
  })

  await t.test('the rate limiter keys on the resolved client IP', () => {
    const limiter = createRateLimiter({ maxPerWindow: 1, windowMs: 60_000 })
    const run = (req: Request) => {
      let result: unknown
      limiter(req, {} as Response, (error?: unknown) => {
        result = error
      })
      return result
    }
    const viaProxy = (ip: string) => {
      const req = request({ [PROXY_SECRET_HEADER]: SECRET, [PROXY_CLIENT_IP_HEADER]: ip }, '76.76.21.21')
      resolve(SECRET, req)
      return req
    }
    // Two real clients behind the same proxy address get separate buckets.
    assert.equal(run(viaProxy('203.0.113.1')), undefined)
    assert.equal(run(viaProxy('203.0.113.2')), undefined)
    assert.ok(isApiError(run(viaProxy('203.0.113.1'))))

    // A direct caller rotating fake forwarded IPs stays in ONE bucket.
    const direct = (fake: string) => {
      const req = request({ [PROXY_CLIENT_IP_HEADER]: fake }, '198.51.100.9')
      resolve(SECRET, req)
      return req
    }
    assert.equal(run(direct('1.1.1.1')), undefined)
    assert.ok(isApiError(run(direct('2.2.2.2'))))
  })
})
