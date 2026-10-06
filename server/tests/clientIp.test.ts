/*
 * http/clientIp.ts — which address the rate limiter keys on. No database.
 *
 *   trusted proxy  valid secret  → x-vercel-forwarded-for
 *   platform edge  production    → x-real-ip (Railway overwrites it)
 *   fallback                     → req.ip
 *
 * and no header a caller can set by itself ever chooses the IP.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response } from 'express'
import {
  clientIpOf,
  createClientIp,
  PLATFORM_CLIENT_IP_HEADER,
  PROXY_CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  VERCEL_CLIENT_IP_HEADER,
} from '../src/http/clientIp.ts'
import { createRateLimiter } from '../src/http/middleware/rateLimit.ts'
import { isApiError } from '../src/domain/errors.ts'

const SECRET = 's'.repeat(40)
const EDGE_HOP = '152.233.68.105' // what req.ip resolves to behind Railway with trust proxy 1

function request(headers: Record<string, string>, ip = EDGE_HOP): Request {
  return { headers: { ...headers }, ip } as unknown as Request
}

function resolve(req: Request, options: { secret?: string; production?: boolean } = {}): string {
  createClientIp({ trustedProxySecret: options.secret, trustPlatformRealIp: options.production ?? true })(
    req,
    {} as Response,
    () => {},
  )
  return clientIpOf(req)
}

/** A request as it reaches Railway THROUGH the Vercel proxy. */
function viaProxy(visitor: string, extra: Record<string, string> = {}): Request {
  return request({
    [PROXY_SECRET_HEADER]: SECRET,
    [VERCEL_CLIENT_IP_HEADER]: visitor,
    [PLATFORM_CLIENT_IP_HEADER]: '52.66.154.250', // Railway sets this to Vercel's egress
    ...extra,
  })
}

await test('client IP resolution', async (t) => {
  /* 1. valid proxy secret + x-vercel-forwarded-for */
  await t.test('valid proxy secret: the visitor is x-vercel-forwarded-for', () => {
    assert.equal(resolve(viaProxy('203.0.113.5'), { secret: SECRET }), '203.0.113.5')
    assert.equal(resolve(viaProxy('2001:db8::1'), { secret: SECRET }), '2001:db8::1')
  })

  /* 2. invalid / missing proxy secret */
  await t.test('wrong or missing secret: x-vercel-forwarded-for is ignored', () => {
    const wrong = request({ [PROXY_SECRET_HEADER]: 'guess', [VERCEL_CLIENT_IP_HEADER]: '6.6.6.6', [PLATFORM_CLIENT_IP_HEADER]: '198.51.100.9' })
    assert.equal(resolve(wrong, { secret: SECRET }), '198.51.100.9')
    const missing = request({ [VERCEL_CLIENT_IP_HEADER]: '6.6.6.6', [PLATFORM_CLIENT_IP_HEADER]: '198.51.100.9' })
    assert.equal(resolve(missing, { secret: SECRET }), '198.51.100.9')
  })

  await t.test('no secret configured: forwarded headers are never trusted', () => {
    assert.equal(resolve(viaProxy('6.6.6.6'), { secret: undefined }), '52.66.154.250')
  })

  /* 3. direct Railway x-real-ip */
  await t.test('direct request in production: x-real-ip from the platform edge, not the edge hop', () => {
    assert.equal(resolve(request({ [PLATFORM_CLIENT_IP_HEADER]: '198.51.100.9' })), '198.51.100.9')
  })

  await t.test('outside production x-real-ip is not believed (nothing overwrites it there)', () => {
    assert.equal(resolve(request({ [PLATFORM_CLIENT_IP_HEADER]: '9.9.9.9' }, '127.0.0.1'), { production: false }), '127.0.0.1')
  })

  await t.test('no usable header at all: req.ip', () => {
    assert.equal(resolve(request({})), EDGE_HOP)
  })

  /* 4. spoofed proxy / IP headers */
  await t.test('direct spoof: fake secret + every IP header cannot choose the IP', () => {
    const spoof = request({
      [PROXY_SECRET_HEADER]: 'attacker-guess',
      [PROXY_CLIENT_IP_HEADER]: '7.7.7.7',
      [VERCEL_CLIENT_IP_HEADER]: '6.6.6.6',
      [PLATFORM_CLIENT_IP_HEADER]: '198.51.100.9', // Railway's overwritten, real value
    })
    assert.equal(resolve(spoof, { secret: SECRET }), '198.51.100.9')
  })

  await t.test('the retired x-atk-client-ip is never used, even with a valid secret', () => {
    assert.equal(resolve(viaProxy('203.0.113.5', { [PROXY_CLIENT_IP_HEADER]: '7.7.7.7' }), { secret: SECRET }), '203.0.113.5')
    const onlyLegacy = request({ [PROXY_SECRET_HEADER]: SECRET, [PROXY_CLIENT_IP_HEADER]: '7.7.7.7' })
    assert.equal(resolve(onlyLegacy, { secret: SECRET, production: false }), EDGE_HOP)
  })

  /* 5. malformed / multiple IP values */
  await t.test('malformed or multiple values fall through instead of being trusted', () => {
    for (const bad of ['', 'not-an-ip', '6.6.6.6, 203.0.113.5', '999.1.1.1', '203.0.113.5 ']) {
      // a trailing space is trimmed and accepted; everything else is rejected
      const expected = bad === '203.0.113.5 ' ? '203.0.113.5' : '52.66.154.250'
      assert.equal(resolve(viaProxy(bad), { secret: SECRET }), expected, JSON.stringify(bad))
    }
    assert.equal(resolve(request({ [PLATFORM_CLIENT_IP_HEADER]: '1.1.1.1, 2.2.2.2' })), EDGE_HOP)
  })

  await t.test('proxy headers are stripped from the request once read', () => {
    const req = viaProxy('203.0.113.5', { [PROXY_CLIENT_IP_HEADER]: '7.7.7.7' })
    resolve(req, { secret: SECRET })
    for (const header of [PROXY_SECRET_HEADER, PROXY_CLIENT_IP_HEADER, VERCEL_CLIENT_IP_HEADER]) {
      assert.equal(header in req.headers, false, header)
    }
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
    const proxied = (visitor: string) => {
      const req = viaProxy(visitor)
      resolve(req, { secret: SECRET })
      return req
    }
    // Two visitors behind the same Vercel egress get separate buckets.
    assert.equal(run(proxied('203.0.113.1')), undefined)
    assert.equal(run(proxied('203.0.113.2')), undefined)
    assert.ok(isApiError(run(proxied('203.0.113.1'))))

    // A direct caller rotating fake headers stays in ONE bucket (its real address).
    const direct = (fake: string) => {
      const req = request({ [VERCEL_CLIENT_IP_HEADER]: fake, [PROXY_CLIENT_IP_HEADER]: fake, [PLATFORM_CLIENT_IP_HEADER]: '198.51.100.77' })
      resolve(req, { secret: SECRET })
      return req
    }
    assert.equal(run(direct('1.1.1.1')), undefined)
    assert.ok(isApiError(run(direct('2.2.2.2'))))

    // Two different direct visitors behind the same Railway edge hop are no
    // longer one shared bucket.
    const directVisitor = (realIp: string) => {
      const req = request({ [PLATFORM_CLIENT_IP_HEADER]: realIp })
      resolve(req)
      return req
    }
    assert.equal(run(directVisitor('198.51.100.10')), undefined)
    assert.equal(run(directVisitor('198.51.100.11')), undefined)
  })
})
