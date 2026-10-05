/*
 * Phase 3 — POST /api/submissions with accounts, and GET /me/submissions.
 *
 * With a database configured, a submission requires a signed-in user, is
 * stored in Postgres owned by the SESSION's user, and writes its
 * SUBMISSION_CREATED audit event in the same transaction. The anonymous JSON
 * intake (no database) is covered unchanged by submissionsRoute.test.ts.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from '../src/http/middleware/rateLimit.ts'
import { createTestDatabase, dbSkipReason } from './dbHarness.ts'
import { ALLOWED_ORIGIN, Client, signedInAs, withAccountServer } from './authHelpers.ts'
import { fixtureCatalogue, makeSubmissionPayload, makeTool, readJson } from './helpers.ts'

interface Created {
  id: string
  status: string
  createdAt: string
}
interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> }
}
interface OwnerSubmission {
  id: string
  name: string
  status: string
  submittedAt: string
  [key: string]: unknown
}

let sites = 0
const payload = (overrides: Record<string, unknown> = {}) => {
  sites += 1
  return makeSubmissionPayload({ siteUrl: `https://site-${process.pid}-${sites}.example.org`, ...overrides })
}

await test('account-backed submissions', { skip: dbSkipReason }, async (t) => {
  const { db, drop } = await createTestDatabase()
  const catalogue = fixtureCatalogue([makeTool({ id: 'listed', slug: 'listed', url: 'https://already-listed.example.com' })])
  try {
    await withAccountServer(
      db,
      async (server) => {
        const alice = await signedInAs(db, server, 'USER')
        const bob = await signedInAs(db, server, 'USER')

        await t.test('an anonymous submission is refused with 401 and nothing is stored', async () => {
          const response = await new Client(server.origin).post('/submissions', payload())
          assert.equal(response.status, 401)
          assert.equal((await readJson<ErrorBody>(response)).error.code, 'UNAUTHENTICATED')
          assert.equal(await db.submission.count(), 0)
        })

        await t.test('the honeypot still answers a bot with a fake 201 and stores nothing', async () => {
          const response = await new Client(server.origin).post('/submissions', payload({ company: 'Acme Spam Ltd' }))
          assert.equal(response.status, 201)
          assert.equal(await db.submission.count(), 0)
        })

        await t.test('a signed-in submission is stored as SUBMITTED, owned by the session user', async () => {
          const response = await alice.client.post('/submissions', payload({ name: 'Alice Tool' }))
          assert.equal(response.status, 201)
          const created = await readJson<Created>(response)
          assert.equal(created.status, 'SUBMITTED')

          const row = await db.submission.findUniqueOrThrow({ where: { id: created.id } })
          assert.equal(row.userId, alice.user.id)
          assert.equal(row.source, 'form')
          assert.equal(row.name, 'Alice Tool')
          assert.equal(row.reviewerId, null)
        })

        await t.test('the SUBMISSION_CREATED audit event is written with the actor and request id', async () => {
          const response = await alice.client.post('/submissions', payload())
          const { id } = await readJson<Created>(response)
          const events = await db.submissionEvent.findMany({ where: { submissionId: id } })
          assert.equal(events.length, 1)
          const [event] = events
          assert.equal(event?.eventType, 'SUBMISSION_CREATED')
          assert.equal(event?.actorType, 'OWNER')
          assert.equal(event?.actorUserId, alice.user.id)
          assert.equal(event?.toStatus, 'SUBMITTED')
          assert.equal(event?.requestId, response.headers.get('x-request-id'))
        })

        await t.test('a userId in the body is rejected, never used as the submitter', async () => {
          const before = await db.submission.count()
          const response = await alice.client.post('/submissions', payload({ userId: bob.user.id }))
          assert.equal(response.status, 400)
          assert.equal(await db.submission.count(), before)
          const status = await alice.client.post('/submissions', payload({ status: 'PUBLISHED' }))
          assert.equal(status.status, 400)
        })

        await t.test('validation errors keep the per-field format the form renders', async () => {
          const response = await alice.client.post('/submissions', payload({ name: '', tagline: 'x'.repeat(200) }))
          assert.equal(response.status, 400)
          const body = await readJson<ErrorBody>(response)
          assert.equal(body.error.code, 'VALIDATION_FAILED')
          assert.ok(body.error.fields?.name)
          assert.ok(body.error.fields?.tagline)
        })

        await t.test('a duplicate of a live submission is 409, whoever sends it', async () => {
          const site = 'https://dupe-check.example.org'
          assert.equal((await alice.client.post('/submissions', payload({ siteUrl: site }))).status, 201)
          const again = await bob.client.post('/submissions', payload({ siteUrl: 'https://WWW.dupe-check.example.org/?utm_source=x' }))
          assert.equal(again.status, 409)
          assert.equal((await readJson<ErrorBody>(again)).error.code, 'DUPLICATE_URL')
        })

        await t.test('a duplicate of a catalogue tool is 409', async () => {
          const response = await alice.client.post('/submissions', payload({ siteUrl: 'https://already-listed.example.com/' }))
          assert.equal(response.status, 409)
        })

        await t.test('a rejected submission no longer blocks the same site', async () => {
          const site = 'https://second-chance.example.org'
          const { id } = await readJson<Created>(await alice.client.post('/submissions', payload({ siteUrl: site })))
          await db.submission.update({ where: { id }, data: { status: 'REJECTED' } })
          assert.equal((await alice.client.post('/submissions', payload({ siteUrl: site }))).status, 201)
        })

        await t.test('a cross-site POST is refused by the origin check', async () => {
          const evil = await alice.client.post('/submissions', payload(), { origin: 'https://evil.example' })
          assert.equal(evil.status, 403)
          const ours = await alice.client.post('/submissions', payload(), { origin: ALLOWED_ORIGIN })
          assert.equal(ours.status, 201)
        })

        await t.test('GET /me/submissions lists only my submissions, newest first', async () => {
          const { id: bobsId } = await readJson<Created>(await bob.client.post('/submissions', payload({ name: 'Bob Tool' })))
          const mine = await readJson<{ items: OwnerSubmission[] }>(await alice.client.get('/me/submissions'))
          const aliceRows = await db.submission.findMany({ where: { userId: alice.user.id } })
          assert.equal(mine.items.length, aliceRows.length)
          assert.ok(mine.items.every((item) => item.id !== bobsId))
          const times = mine.items.map((item) => Date.parse(item.submittedAt))
          assert.deepEqual(times, [...times].sort((a, b) => b - a))

          const bobs = await readJson<{ items: OwnerSubmission[] }>(await bob.client.get('/me/submissions'))
          assert.deepEqual(bobs.items.map((item) => item.id), [bobsId])
        })

        await t.test('the list exposes only the submitter view — no reviewer, notes or audit data', async () => {
          const { items } = await readJson<{ items: OwnerSubmission[] }>(await alice.client.get('/me/submissions'))
          for (const item of items) {
            for (const key of ['reviewerId', 'userId', 'normalizedUrl', 'events', 'description']) {
              assert.equal(key in item, false, key)
            }
          }
        })

        await t.test("IDOR: another user's submission id is the same 404 as an unknown one", async () => {
          const { items } = await readJson<{ items: OwnerSubmission[] }>(await bob.client.get('/me/submissions'))
          const bobsId = items[0]?.id as string
          const theirs = await alice.client.get(`/me/submissions/${bobsId}`)
          const unknown = await alice.client.get('/me/submissions/00000000-0000-4000-8000-000000000000')
          assert.equal(theirs.status, 404)
          assert.deepEqual(await readJson<ErrorBody>(theirs), await readJson<ErrorBody>(unknown))
          const own = await bob.client.get(`/me/submissions/${bobsId}`)
          assert.equal(own.status, 200)
        })

        await t.test('a userId query parameter cannot widen the list', async () => {
          const { items } = await readJson<{ items: OwnerSubmission[] }>(await alice.client.get(`/me/submissions?userId=${bob.user.id}`))
          assert.ok(items.every((item) => item.name !== 'Bob Tool'))
        })

        await t.test("an admin's /me/submissions is still only their own", async () => {
          const admin = await signedInAs(db, server, 'ADMIN')
          const { items } = await readJson<{ items: unknown[] }>(await admin.client.get('/me/submissions'))
          assert.deepEqual(items, [])
        })

        await t.test('/me/submissions without a session is 401', async () => {
          assert.equal((await new Client(server.origin).get('/me/submissions')).status, 401)
        })
      },
      { catalogue },
    )

    await t.test('the submission rate limit still applies to signed-in users', async () => {
      await withAccountServer(
        db,
        async (server) => {
          const { client } = await signedInAs(db, server, 'USER')
          assert.equal((await client.post('/submissions', payload())).status, 201)
          const limited = await client.post('/submissions', payload())
          assert.equal(limited.status, 429)
        },
        { submissionLimiter: createRateLimiter({ maxPerWindow: 1, windowMs: 60_000 }) },
      )
    })
  } finally {
    await drop()
  }
})
