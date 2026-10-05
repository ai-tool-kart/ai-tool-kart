/*
 * Phase 2B — the pure parts of authentication: password hashing, session
 * tokens, cookie handling, input schemas, roles and the CSRF origin check.
 * No database; runs in every `npm test`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type { NextFunction, Request, Response } from 'express'
import { clearSessionCookie, readCookie, sessionCookieName, setSessionCookie } from '../src/auth/cookies.ts'
import { hashPassword, needsRehash, verifyPassword } from '../src/auth/password.ts'
import { derivedRole, hasRoleAtLeast, isAdmin, toPublicUser } from '../src/auth/roles.ts'
import { LoginSchema, normalizeEmail, RegisterSchema, RoleChangeSchema } from '../src/auth/schema.ts'
import { generateSessionToken, hashSessionToken, isWellFormedToken } from '../src/auth/tokens.ts'
import { AUTH } from '../src/config/limits.ts'
import { isApiError } from '../src/domain/errors.ts'
import type { User } from '../src/generated/prisma/client.ts'
import { createOriginCheck } from '../src/http/middleware/originCheck.ts'
import { createRateLimiter } from '../src/http/middleware/rateLimit.ts'
import { FAST_SCRYPT } from './authHelpers.ts'

await test('password hashing', async (t) => {
  await t.test('produces a self-describing scrypt hash, never the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple', FAST_SCRYPT)
    assert.match(hash, /^scrypt\$1024\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/)
    assert.equal(hash.includes('correct horse'), false)
  })

  await t.test('verifies the right password and rejects wrong ones', async () => {
    const hash = await hashPassword('correct horse battery staple', FAST_SCRYPT)
    assert.equal(await verifyPassword('correct horse battery staple', hash), true)
    assert.equal(await verifyPassword('correct horse battery stapl', hash), false)
    assert.equal(await verifyPassword('Correct horse battery staple', hash), false)
    assert.equal(await verifyPassword('', hash), false)
  })

  await t.test('the same password hashes differently every time (independent salts)', async () => {
    const [a, b] = await Promise.all([hashPassword('same password!', FAST_SCRYPT), hashPassword('same password!', FAST_SCRYPT)])
    assert.notEqual(a, b)
    assert.notEqual(a.split('$')[4], b.split('$')[4])
    assert.equal(await verifyPassword('same password!', a), true)
    assert.equal(await verifyPassword('same password!', b), true)
  })

  await t.test('production parameters (AUTH.scrypt) hash and verify', async () => {
    const hash = await hashPassword('production cost check', AUTH.scrypt)
    assert.ok(hash.startsWith(`scrypt$${AUTH.scrypt.N}$${AUTH.scrypt.r}$${AUTH.scrypt.p}$`))
    assert.equal(await verifyPassword('production cost check', hash), true)
    assert.equal(needsRehash(hash), false)
  })

  await t.test('weaker stored parameters are flagged for rehash', async () => {
    assert.equal(needsRehash(await hashPassword('x'.repeat(12), FAST_SCRYPT)), true)
  })

  await t.test('a malformed or hostile stored hash fails closed without throwing', async () => {
    for (const stored of ['', 'plaintext', 'scrypt$abc', 'bcrypt$1$2$3$4$5', `scrypt$${2 ** 30}$8$1$AAAAAAAAAAAAAAAAAAAAAA$${'A'.repeat(86)}`]) {
      assert.equal(await verifyPassword('anything', stored), false, stored)
    }
  })
})

await test('session tokens', async (t) => {
  await t.test('are 256-bit, unpredictable and well-formed', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateSessionToken))
    assert.equal(tokens.size, 200)
    for (const token of tokens) assert.ok(isWellFormedToken(token))
    assert.equal(Buffer.from([...tokens][0] as string, 'base64url').length, 32)
  })

  await t.test('only a SHA-256 hex digest is stored', () => {
    const token = generateSessionToken()
    const hash = hashSessionToken(token)
    assert.match(hash, /^[0-9a-f]{64}$/)
    assert.equal(hash.includes(token), false)
    assert.equal(hashSessionToken(token), hash)
  })

  await t.test('rejects malformed tokens before any lookup', () => {
    for (const bad of ['', 'short', 'x'.repeat(43) + '!', 'a'.repeat(44), "' OR 1=1 --"]) assert.equal(isWellFormedToken(bad), false)
  })
})

function fakeResponse() {
  const calls: { name: string; value?: string; options: Record<string, unknown> }[] = []
  const res = {
    cookie: (name: string, value: string, options: Record<string, unknown>) => calls.push({ name, value, options }),
    clearCookie: (name: string, options: Record<string, unknown>) => calls.push({ name, options }),
  }
  return { res: res as unknown as Response, calls }
}

await test('session cookie', async (t) => {
  await t.test('production: __Host- prefix, HttpOnly, Secure, SameSite=Lax, Path=/', () => {
    const { res, calls } = fakeResponse()
    setSessionCookie(res, 'tok', new Date(Date.now() + 60_000), { secure: true })
    const [call] = calls
    assert.equal(call?.name, '__Host-atk_session')
    assert.deepEqual(
      { httpOnly: call?.options.httpOnly, secure: call?.options.secure, sameSite: call?.options.sameSite, path: call?.options.path },
      { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
    )
    assert.equal('domain' in (call?.options ?? {}), false)
    assert.ok((call?.options.maxAge as number) > 0)
  })

  await t.test('development: plain name, not Secure (http://localhost)', () => {
    const { res, calls } = fakeResponse()
    setSessionCookie(res, 'tok', new Date(Date.now() + 60_000), { secure: false })
    assert.equal(calls[0]?.name, 'atk_session')
    assert.equal(calls[0]?.options.secure, false)
    assert.equal(calls[0]?.options.httpOnly, true)
  })

  await t.test('clearing uses the same name and attributes', () => {
    const { res, calls } = fakeResponse()
    clearSessionCookie(res, { secure: true })
    assert.equal(calls[0]?.name, sessionCookieName({ secure: true }))
    assert.equal(calls[0]?.options.path, '/')
  })

  await t.test('reads one cookie out of a Cookie header', () => {
    assert.equal(readCookie('a=1; atk_session=abc; b=2', 'atk_session'), 'abc')
    assert.equal(readCookie('atk_session_other=x', 'atk_session'), undefined)
    assert.equal(readCookie(undefined, 'atk_session'), undefined)
    assert.equal(readCookie('atk_session=%E0%A4%A', 'atk_session'), undefined)
  })
})

await test('input schemas', async (t) => {
  await t.test('emails are trimmed and lowercased — one normalization everywhere', () => {
    assert.equal(normalizeEmail('  Alice@Example.COM '), 'alice@example.com')
    const parsed = RegisterSchema.parse({ email: ' Alice@Example.COM', password: 'long enough pw' })
    assert.equal(parsed.email, 'alice@example.com')
    assert.equal(LoginSchema.parse({ email: 'ALICE@example.com ', password: 'x' }).email, 'alice@example.com')
  })

  await t.test('registration rejects invalid emails and short or huge passwords', () => {
    for (const email of ['', 'not-an-email', 'a@', '@b.com', `${'a'.repeat(250)}@b.com`]) {
      assert.equal(RegisterSchema.safeParse({ email, password: 'long enough pw' }).success, false, email)
    }
    assert.equal(RegisterSchema.safeParse({ email: 'a@b.com', password: 'short' }).success, false)
    assert.equal(RegisterSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(AUTH.maxPasswordChars + 1) }).success, false)
  })

  await t.test('registration cannot set a role or any other extra field', () => {
    assert.equal(RegisterSchema.safeParse({ email: 'a@b.com', password: 'long enough pw', role: 'ADMIN' }).success, false)
  })

  await t.test('passwords are not trimmed', () => {
    assert.equal(RegisterSchema.parse({ email: 'a@b.com', password: '  spaced pw  ' }).password, '  spaced pw  ')
  })

  await t.test('TOOL_OWNER cannot be assigned by hand', () => {
    assert.equal(RoleChangeSchema.safeParse({ role: 'TOOL_OWNER' }).success, false)
    assert.equal(RoleChangeSchema.safeParse({ role: 'ADMIN' }).success, true)
  })
})

await test('roles', async (t) => {
  await t.test('rank order USER < TOOL_OWNER < ADMIN < SUPER_ADMIN', () => {
    assert.equal(hasRoleAtLeast('SUPER_ADMIN', 'ADMIN'), true)
    assert.equal(hasRoleAtLeast('ADMIN', 'SUPER_ADMIN'), false)
    assert.equal(hasRoleAtLeast('TOOL_OWNER', 'ADMIN'), false)
    assert.equal(isAdmin('USER') || isAdmin('TOOL_OWNER'), false)
    assert.equal(isAdmin('ADMIN') && isAdmin('SUPER_ADMIN'), true)
  })

  await t.test('TOOL_OWNER follows ownership; admin roles never change from it', () => {
    assert.equal(derivedRole('USER', 1), 'TOOL_OWNER')
    assert.equal(derivedRole('TOOL_OWNER', 0), 'USER')
    assert.equal(derivedRole('ADMIN', 3), 'ADMIN')
    assert.equal(derivedRole('SUPER_ADMIN', 0), 'SUPER_ADMIN')
  })

  await t.test('the public view is an allowlist with no secrets', () => {
    const user = {
      id: 'u1', email: 'a@b.com', name: null, passwordHash: 'scrypt$secret', role: 'USER',
      emailVerifiedAt: null, disabledAt: null, lastLoginAt: null, createdAt: new Date(0), updatedAt: new Date(0),
    } as User
    const view = toPublicUser(user)
    assert.deepEqual(Object.keys(view).sort(), ['createdAt', 'email', 'emailVerified', 'id', 'name', 'role'])
    assert.equal(JSON.stringify(view).includes('scrypt'), false)
  })
})

function runMiddleware(handler: (req: Request, res: Response, next: NextFunction) => void, req: Partial<Request>): unknown {
  let result: unknown = 'not called'
  handler(req as Request, {} as Response, (error?: unknown) => {
    result = error
  })
  return result
}

await test('CSRF origin check', async (t) => {
  const check = createOriginCheck(['https://aitoolkart.com'])

  await t.test('safe methods always pass', () => {
    assert.equal(runMiddleware(check, { method: 'GET', headers: { origin: 'https://evil.example' } }), undefined)
  })

  await t.test('an allowlisted Origin passes; any other is refused', () => {
    assert.equal(runMiddleware(check, { method: 'POST', headers: { origin: 'https://aitoolkart.com' } }), undefined)
    const error = runMiddleware(check, { method: 'POST', headers: { origin: 'https://evil.example' } })
    assert.ok(isApiError(error) && error.status === 403)
    assert.ok(isApiError(runMiddleware(check, { method: 'DELETE', headers: { origin: 'null' } })))
  })

  await t.test('no Origin: Sec-Fetch-Site cross-site is refused, non-browser clients pass', () => {
    assert.ok(isApiError(runMiddleware(check, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } })))
    assert.equal(runMiddleware(check, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } }), undefined)
    assert.equal(runMiddleware(check, { method: 'POST', headers: {} }), undefined)
  })
})

await test('rate limiter accepts per-route limits without changing its defaults', () => {
  let clock = 0
  const limiter = createRateLimiter({ now: () => clock, maxPerWindow: 2, windowMs: 1000, message: 'Too many sign-in attempts.' })
  const req = { ip: '203.0.113.1' } as Request
  assert.equal(runMiddleware(limiter, req), undefined)
  assert.equal(runMiddleware(limiter, req), undefined)
  const error = runMiddleware(limiter, req)
  assert.ok(isApiError(error) && error.code === 'RATE_LIMITED' && error.message === 'Too many sign-in attempts.')
  clock = 1001
  assert.equal(runMiddleware(limiter, req), undefined)
})
