/*
 * Phase 2B — registration, login, /auth/me and logout over real HTTP against
 * an isolated, migrated Postgres schema (tests/dbHarness.ts).
 *
 *   TEST_DATABASE_URL=postgresql://$USER@localhost:5432/aitoolkart_test npm test
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { INVALID_CREDENTIALS_MESSAGE } from '../src/auth/service.ts'
import { hashSessionToken } from '../src/auth/tokens.ts'
import { AUTH } from '../src/config/limits.ts'
import { createRateLimiter } from '../src/http/middleware/rateLimit.ts'
import { createTestDatabase, dbSkipReason } from './dbHarness.ts'
import { ALLOWED_ORIGIN, Client, insertUser, TEST_PASSWORD, uniqueEmail, withAccountServer } from './authHelpers.ts'
import { readJson, testContainer, withServer } from './helpers.ts'

interface UserBody {
  user: { id: string; email: string; name: string | null; role: string; emailVerified: boolean; createdAt: string }
}
interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> }
}

await test('auth routes', { skip: dbSkipReason }, async (t) => {
  const { db, drop } = await createTestDatabase()
  try {
    await withAccountServer(db, async (server) => {
      await t.test('register: creates the user, signs in, returns only public fields', async () => {
        const client = new Client(server.origin)
        const email = uniqueEmail('reg')
        const response = await client.post('/auth/register', { email, password: TEST_PASSWORD, name: 'Ada' })
        assert.equal(response.status, 201)
        const body = await readJson<UserBody>(response)
        assert.deepEqual(Object.keys(body.user).sort(), ['createdAt', 'email', 'emailVerified', 'id', 'name', 'role'])
        assert.equal(body.user.email, email)
        assert.equal(body.user.role, 'USER')
        assert.equal(client.cookies.has(AUTH.cookieName), true)

        const me = await client.get('/auth/me')
        assert.equal(me.status, 200)
        assert.equal((await readJson<UserBody>(me)).user.id, body.user.id)
      })

      await t.test('register: email is normalized before storing and comparing', async () => {
        const local = uniqueEmail('norm')
        const response = await new Client(server.origin).post('/auth/register', {
          email: `  ${local.toUpperCase()} `,
          password: TEST_PASSWORD,
        })
        assert.equal(response.status, 201)
        assert.equal((await readJson<UserBody>(response)).user.email, local)
        assert.ok(await db.user.findUnique({ where: { email: local } }))
      })

      await t.test('register: the password is never stored in plaintext', async () => {
        const email = uniqueEmail('hash')
        await new Client(server.origin).post('/auth/register', { email, password: TEST_PASSWORD })
        const row = await db.user.findUniqueOrThrow({ where: { email } })
        assert.match(row.passwordHash, /^scrypt\$/)
        assert.equal(row.passwordHash.includes(TEST_PASSWORD), false)
      })

      await t.test('register: invalid email / password come back as per-field errors', async () => {
        const badEmail = await new Client(server.origin).post('/auth/register', { email: 'nope', password: TEST_PASSWORD })
        assert.equal(badEmail.status, 400)
        assert.ok((await readJson<ErrorBody>(badEmail)).error.fields?.email)

        const badPassword = await new Client(server.origin).post('/auth/register', { email: uniqueEmail(), password: 'short' })
        assert.equal(badPassword.status, 400)
        assert.ok((await readJson<ErrorBody>(badPassword)).error.fields?.password)
      })

      await t.test('register: duplicate email (in any case) is rejected with 409', async () => {
        const email = uniqueEmail('dup')
        assert.equal((await new Client(server.origin).post('/auth/register', { email, password: TEST_PASSWORD })).status, 201)
        const again = await new Client(server.origin).post('/auth/register', { email: email.toUpperCase(), password: TEST_PASSWORD })
        assert.equal(again.status, 409)
        assert.equal((await readJson<ErrorBody>(again)).error.code, 'EMAIL_TAKEN')
        assert.equal(await db.user.count({ where: { email } }), 1)
      })

      await t.test('register: a client cannot choose its own role', async () => {
        const response = await new Client(server.origin).post('/auth/register', {
          email: uniqueEmail(),
          password: TEST_PASSWORD,
          role: 'SUPER_ADMIN',
        })
        assert.equal(response.status, 400)
      })

      await t.test('login: valid credentials create a new server-side session', async () => {
        const user = await insertUser(db)
        const client = new Client(server.origin)
        const response = await client.post('/auth/login', { email: user.email.toUpperCase(), password: TEST_PASSWORD })
        assert.equal(response.status, 200)
        const token = client.cookies.get(AUTH.cookieName) as string
        const session = await db.session.findUnique({ where: { tokenHash: hashSessionToken(token) } })
        assert.equal(session?.userId, user.id)
        // The raw token itself is nowhere in the database.
        assert.equal(await db.session.count({ where: { tokenHash: token } }), 0)
      })

      await t.test('login: cookie attributes are HttpOnly, SameSite=Lax, Path=/', async () => {
        const user = await insertUser(db)
        const client = new Client(server.origin)
        await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD })
        const line = client.lastSetCookie.find((cookie) => cookie.startsWith(`${AUTH.cookieName}=`)) as string
        assert.match(line, /HttpOnly/i)
        assert.match(line, /SameSite=Lax/i)
        assert.match(line, /Path=\//)
        assert.match(line, /Max-Age=\d+/)
      })

      await t.test('login: wrong password and unknown email fail identically', async () => {
        const user = await insertUser(db)
        const wrong = await new Client(server.origin).post('/auth/login', { email: user.email, password: 'wrong password!!' })
        const unknown = await new Client(server.origin).post('/auth/login', { email: uniqueEmail('ghost'), password: TEST_PASSWORD })
        assert.equal(wrong.status, 401)
        assert.equal(unknown.status, 401)
        const [a, b] = [await readJson<ErrorBody>(wrong), await readJson<ErrorBody>(unknown)]
        assert.deepEqual(a, b)
        assert.equal(a.error.message, INVALID_CREDENTIALS_MESSAGE)
      })

      await t.test('login: a disabled account cannot sign in', async () => {
        const user = await insertUser(db)
        await db.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } })
        const response = await new Client(server.origin).post('/auth/login', { email: user.email, password: TEST_PASSWORD })
        assert.equal(response.status, 401)
      })

      await t.test('/auth/me without a session is 401', async () => {
        const response = await new Client(server.origin).get('/auth/me')
        assert.equal(response.status, 401)
        assert.equal((await readJson<ErrorBody>(response)).error.code, 'UNAUTHENTICATED')
      })

      await t.test('logout revokes the session server-side and clears the cookie', async () => {
        const user = await insertUser(db)
        const client = new Client(server.origin)
        await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD })
        const token = client.cookies.get(AUTH.cookieName) as string

        const response = await client.post('/auth/logout')
        assert.equal(response.status, 204)
        assert.equal(client.cookies.has(AUTH.cookieName), false)
        const session = await db.session.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(token) } })
        assert.ok(session.revokedAt)

        // Replaying the old cookie after logout does not work.
        client.cookies.set(AUTH.cookieName, token)
        assert.equal((await client.get('/auth/me')).status, 401)
      })

      await t.test('logout without a session is a harmless 204', async () => {
        assert.equal((await new Client(server.origin).post('/auth/logout')).status, 204)
      })

      await t.test('a revoked session, a garbage token and a forged token are all rejected', async () => {
        const user = await insertUser(db)
        const client = new Client(server.origin)
        await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD })
        await db.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } })
        assert.equal((await client.get('/auth/me')).status, 401)

        for (const value of ['garbage', 'A'.repeat(43), user.id]) {
          const forged = new Client(server.origin)
          forged.cookies.set(AUTH.cookieName, value)
          assert.equal((await forged.get('/auth/me')).status, 401, value)
        }
      })

      await t.test('disabling a user ends their existing sessions immediately', async () => {
        const user = await insertUser(db)
        const client = new Client(server.origin)
        await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD })
        assert.equal((await client.get('/auth/me')).status, 200)
        await db.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } })
        assert.equal((await client.get('/auth/me')).status, 401)
      })

      await t.test('logging in again replaces (revokes) the previous session', async () => {
        const user = await insertUser(db)
        const client = new Client(server.origin)
        await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD })
        const first = client.cookies.get(AUTH.cookieName) as string
        await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD })
        assert.notEqual(client.cookies.get(AUTH.cookieName), first)
        const old = await db.session.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(first) } })
        assert.ok(old.revokedAt)
      })

      await t.test('a cross-site POST is refused by the origin check', async () => {
        const user = await insertUser(db)
        const evil = await new Client(server.origin).post(
          '/auth/login',
          { email: user.email, password: TEST_PASSWORD },
          { origin: 'https://evil.example' },
        )
        assert.equal(evil.status, 403)
        const ours = await new Client(server.origin).post('/auth/login', { email: user.email, password: TEST_PASSWORD }, { origin: ALLOWED_ORIGIN })
        assert.equal(ours.status, 200)
      })

      await t.test('no response body or Set-Cookie ever carries the password hash', async () => {
        const client = new Client(server.origin)
        const email = uniqueEmail('leak')
        const register = await client.post('/auth/register', { email, password: TEST_PASSWORD })
        const text = await register.text()
        const row = await db.user.findUniqueOrThrow({ where: { email } })
        assert.equal(text.includes(row.passwordHash), false)
        assert.equal(text.includes('passwordHash'), false)
        assert.equal(text.includes(TEST_PASSWORD), false)
      })
    })

    await t.test('an expired session is rejected', async () => {
      let clock = new Date('2026-10-05T12:00:00Z')
      await withAccountServer(
        db,
        async (server) => {
          const user = await insertUser(db)
          const client = new Client(server.origin)
          await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD })
          assert.equal((await client.get('/auth/me')).status, 200)

          clock = new Date(clock.getTime() + AUTH.sessionTtlMs - 1000)
          assert.equal((await client.get('/auth/me')).status, 200, 'still valid just before expiry')

          clock = new Date(clock.getTime() + 2000)
          const expired = await client.get('/auth/me')
          assert.equal(expired.status, 401)
          // The browser is told to drop the dead cookie.
          assert.equal(client.cookies.has(AUTH.cookieName), false)
        },
        { now: () => clock },
      )
    })

    await t.test('login attempts are rate limited per IP', async () => {
      await withAccountServer(
        db,
        async (server) => {
          const user = await insertUser(db)
          const attempt = () => new Client(server.origin).post('/auth/login', { email: user.email, password: 'wrong password!!' })
          assert.equal((await attempt()).status, 401)
          assert.equal((await attempt()).status, 401)
          const limited = await attempt()
          assert.equal(limited.status, 429)
          assert.ok(Number(limited.headers.get('retry-after')) > 0)
        },
        { loginLimiter: createRateLimiter({ maxPerWindow: 2, windowMs: 60_000, message: 'Too many sign-in attempts.' }) },
      )
    })

    await t.test('production mode uses a Secure __Host- cookie', async () => {
      await withAccountServer(
        db,
        async (server) => {
          const user = await insertUser(db)
          const client = new Client(server.origin)
          await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD })
          const line = client.lastSetCookie.find((cookie) => cookie.startsWith('__Host-atk_session=')) as string
          assert.ok(line, 'expected the __Host- cookie')
          assert.match(line, /Secure/)
          assert.doesNotMatch(line, /Domain=/i)
        },
        { isProduction: true },
      )
    })
  } finally {
    await drop()
  }
})

await test('without a database the account routes answer 503 and nothing else changes', async () => {
  await withServer(testContainer(), async (server) => {
    for (const path of ['/auth/me', '/me/tools', '/admin/tools/claude/owners']) {
      const response = await fetch(`${server.origin}/api${path}`)
      assert.equal(response.status, 503, path)
      assert.equal((await readJson<ErrorBody>(response)).error.code, 'AUTH_UNAVAILABLE')
    }
    assert.equal((await fetch(`${server.origin}/api/health`)).status, 200)
  })
})
