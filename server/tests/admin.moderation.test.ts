/*
 * Phase 6 — submission moderation over real HTTP against an isolated,
 * fully migrated Postgres schema (including the Phase 6 migration).
 *
 * Covers: role guards on every admin route, the queue's filters and
 * pagination, required reasons, the transition rules (invalid and duplicate
 * transitions are 409s), concurrent decisions, approval into a draft
 * catalogue record with ownership, duplicate URL/slug refusal with full
 * rollback, internal-note privacy, audit events, append-only enforcement,
 * and that no response leaks credentials or database internals.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createTestDatabase, dbSkipReason } from './dbHarness.ts'
import { ALLOWED_ORIGIN, Client, insertTool, insertUser, signedInAs, withAccountServer } from './authHelpers.ts'
import { approvalBody, assertNoSecrets, errorOf, insertReviewable } from './adminHelpers.ts'
import { fixtureCatalogue, makeTool, readJson } from './helpers.ts'

interface DetailBody {
  submission: {
    id: string
    status: string
    toolId: string | null
    rejectionReason: string | null
    ownerMessage: string | null
    allowedActions: string[]
    proposal: { slug: string; summary: string } | null
    reviewer: { id: string } | null
    submitter: { id: string; email: string } | null
    events: { type: string; actorType: string; actor: { id: string } | null; fromStatus: string | null; toStatus: string | null; metadata: Record<string, unknown> }[]
    duplicates: { catalogueTool: { id: string; location: string } | null; otherSubmissions: unknown[] }
  }
}

interface ListBody {
  items: { id: string; name: string; status: string; submitter: { email: string } | null }[]
  total: number
  page: number
  pageSize: number
}

const LIVE_TOOL_URL = 'https://live-only.example.net'

await test('admin moderation', { skip: dbSkipReason }, async (t) => {
  const { db, drop } = await createTestDatabase()
  try {
    // A tool that exists only in the DATABASE catalogue, and one that exists
    // only in the LIVE (JSON) catalogue the public site serves.
    await insertTool(db, 'existing-db-tool')
    const catalogue = fixtureCatalogue([makeTool({ id: 'live-only', url: LIVE_TOOL_URL })])

    await withAccountServer(
      db,
      async (server) => {
        const superAdmin = await signedInAs(db, server, 'SUPER_ADMIN')
        const admin = await signedInAs(db, server, 'ADMIN')
        const plain = await signedInAs(db, server, 'USER')
        const owner = await signedInAs(db, server, 'USER')
        await db.toolOwner.create({ data: { toolId: 'existing-db-tool', userId: owner.user.id } })
        await db.user.update({ where: { id: owner.user.id }, data: { role: 'TOOL_OWNER' } })
        const submitter = await signedInAs(db, server, 'USER')

        const post = (client: Client, path: string, body?: unknown) => client.request('POST', path, body)
        const detail = async (client: Client, id: string) => readJson<DetailBody>(await client.get(`/admin/submissions/${id}`))

        await t.test('anonymous requests to every admin route are 401', async () => {
          const anonymous = new Client(server.origin)
          const id = randomUUID()
          for (const path of ['/admin/stats', '/admin/vocabulary', '/admin/submissions', `/admin/submissions/${id}`, '/admin/tools', '/admin/users', '/admin/audit']) {
            assert.equal((await anonymous.get(path)).status, 401, path)
          }
          for (const action of ['approve', 'reject', 'request-changes', 'notes']) {
            assert.equal((await post(anonymous, `/admin/submissions/${id}/${action}`, {})).status, 401, action)
          }
        })

        await t.test('USER and TOOL_OWNER are 403 on every admin route — even for their own submission', async () => {
          const own = await insertReviewable(db, { userId: owner.user.id })
          for (const who of [plain, owner]) {
            for (const path of ['/admin/stats', '/admin/submissions', `/admin/submissions/${own.id}`, '/admin/tools', '/admin/users', '/admin/audit']) {
              assert.equal((await who.client.get(path)).status, 403, path)
            }
            const approve = await errorOf(await post(who.client, `/admin/submissions/${own.id}/approve`, approvalBody('self-approved')))
            assert.equal(approve.status, 403)
            assert.equal(approve.body.error.code, 'FORBIDDEN')
          }
          const after = await db.submission.findUniqueOrThrow({ where: { id: own.id } })
          assert.equal(after.status, 'SUBMITTED')
          assert.equal(await db.tool.count({ where: { id: 'self-approved' } }), 0)
        })

        await t.test('queue: filters, search by name / URL / submitter, pagination and safe limits', async () => {
          await insertReviewable(db, { userId: submitter.user.id, name: 'Queue Alpha', url: 'https://queue-alpha.example.org', submittedAt: new Date('2026-01-01T00:00:00Z') })
          await insertReviewable(db, { userId: submitter.user.id, name: 'Queue Beta', url: 'https://queue-beta.example.org', submittedAt: new Date('2026-01-02T00:00:00Z') })
          await insertReviewable(db, { userId: submitter.user.id, name: 'Queue Gamma', url: 'https://queue-gamma.example.org', status: 'REJECTED', submittedAt: new Date('2026-01-03T00:00:00Z') })

          const byName = await readJson<ListBody>(await admin.client.get('/admin/submissions?q=queue&pageSize=2&sort=submitted&order=asc'))
          assert.equal(byName.total, 3)
          assert.deepEqual(byName.items.map((item) => item.name), ['Queue Alpha', 'Queue Beta'])
          const page2 = await readJson<ListBody>(await admin.client.get('/admin/submissions?q=queue&pageSize=2&page=2&sort=submitted&order=asc'))
          assert.deepEqual(page2.items.map((item) => item.name), ['Queue Gamma'])

          const rejected = await readJson<ListBody>(await admin.client.get('/admin/submissions?q=queue&status=REJECTED'))
          assert.deepEqual(rejected.items.map((item) => item.name), ['Queue Gamma'])
          const multi = await readJson<ListBody>(await admin.client.get('/admin/submissions?q=queue&status=SUBMITTED,REJECTED'))
          assert.equal(multi.total, 3)

          const byUrl = await readJson<ListBody>(await admin.client.get('/admin/submissions?q=queue-beta.example'))
          assert.deepEqual(byUrl.items.map((item) => item.name), ['Queue Beta'])
          const byEmail = await readJson<ListBody>(await admin.client.get(`/admin/submissions?q=${encodeURIComponent(submitter.user.email)}`))
          assert.ok(byEmail.total >= 3)
          assert.ok(byEmail.items.every((item) => item.submitter?.email === submitter.user.email))

          for (const bad of ['pageSize=101', 'pageSize=0', 'page=0', 'page=999999', 'status=NOPE', 'sort=evil', `q=${'x'.repeat(201)}`]) {
            const response = await errorOf(await admin.client.get(`/admin/submissions?${bad}`))
            assert.equal(response.status, 400, bad)
            assert.equal(response.body.error.code, 'INVALID_REQUEST')
          }
        })

        await t.test('detail: full record, history and a proposal; unknown and malformed ids are the same 404', async () => {
          const created = await insertReviewable(db, { userId: submitter.user.id, name: 'Detail Tool' })
          const body = await detail(admin.client, created.id)
          assert.equal(body.submission.id, created.id)
          assert.equal(body.submission.submitter?.email, submitter.user.email)
          assert.deepEqual(body.submission.allowedActions, ['approve', 'requestChanges', 'reject', 'note'])
          assert.equal(body.submission.proposal?.slug, 'detail-tool')
          assert.ok((body.submission.proposal?.summary.length ?? 0) >= 40)

          const unknown = await errorOf(await admin.client.get(`/admin/submissions/${randomUUID()}`))
          const malformed = await errorOf(await admin.client.get('/admin/submissions/not-a-uuid'))
          const injected = await errorOf(await admin.client.get("/admin/submissions/1' OR '1'='1"))
          assert.equal(unknown.status, 404)
          assert.deepEqual(unknown, malformed)
          assert.deepEqual(unknown, injected)
        })

        await t.test('reject requires a real reason; forged fields are refused, not ignored', async () => {
          const created = await insertReviewable(db, { userId: submitter.user.id })
          for (const body of [{}, { reason: '' }, { reason: 'too short' }, { reason: 'x'.repeat(2001) }]) {
            const response = await errorOf(await post(admin.client, `/admin/submissions/${created.id}/reject`, body))
            assert.equal(response.status, 400, JSON.stringify(body).slice(0, 40))
            assert.equal(response.body.error.code, 'VALIDATION_FAILED')
            assert.ok(response.body.error.fields?.reason)
          }
          for (const forged of [{ reason: 'Not an AI tool at all.', status: 'APPROVED' }, { reason: 'Not an AI tool at all.', actorUserId: superAdmin.user.id }]) {
            assert.equal((await post(admin.client, `/admin/submissions/${created.id}/reject`, forged)).status, 400)
          }
          assert.equal((await db.submission.findUniqueOrThrow({ where: { id: created.id } })).status, 'SUBMITTED')
          assert.equal(await db.submissionEvent.count({ where: { submissionId: created.id } }), 0)
        })

        await t.test('reject: status, reviewer, audit event; the submitter sees the reason', async () => {
          const created = await insertReviewable(db, { userId: submitter.user.id })
          const reason = 'This is a directory of AI tools, and this site is a template marketplace.'
          const response = await post(admin.client, `/admin/submissions/${created.id}/reject`, { reason })
          assert.equal(response.status, 200)
          const body = await readJson<DetailBody>(response)
          assert.equal(body.submission.status, 'REJECTED')
          assert.equal(body.submission.rejectionReason, reason)
          assert.equal(body.submission.reviewer?.id, admin.user.id)
          assert.deepEqual(body.submission.allowedActions, ['note'])
          const event = body.submission.events.at(-1)
          assert.equal(event?.type, 'REJECTED')
          assert.equal(event?.actorType, 'ADMIN')
          assert.equal(event?.actor?.id, admin.user.id)
          assert.equal(event?.fromStatus, 'SUBMITTED')
          assert.equal(event?.toStatus, 'REJECTED')
          assert.equal(event?.metadata.reason, reason)

          const ownView = await readJson<{ submission: { status: string; rejectionReason: string } }>(await submitter.client.get(`/me/submissions/${created.id}`))
          assert.equal(ownView.submission.status, 'REJECTED')
          assert.equal(ownView.submission.rejectionReason, reason)
        })

        await t.test('request changes requires a message; the submitter sees it', async () => {
          const created = await insertReviewable(db, { userId: submitter.user.id })
          const missing = await errorOf(await post(admin.client, `/admin/submissions/${created.id}/request-changes`, { message: ' ' }))
          assert.equal(missing.status, 400)
          assert.ok(missing.body.error.fields?.message)

          const message = 'Please add your pricing page and a clearer tagline.'
          const ok = await readJson<DetailBody>(await post(admin.client, `/admin/submissions/${created.id}/request-changes`, { message }))
          assert.equal(ok.submission.status, 'CHANGES_REQUESTED')
          assert.deepEqual(ok.submission.allowedActions, ['reject', 'note'])
          const ownView = await readJson<{ submission: { ownerMessage: string } }>(await submitter.client.get(`/me/submissions/${created.id}`))
          assert.equal(ownView.submission.ownerMessage, message)
        })

        await t.test('invalid and duplicate transitions are 409 CONFLICT and change nothing', async () => {
          const rejected = await insertReviewable(db, { userId: submitter.user.id })
          await post(admin.client, `/admin/submissions/${rejected.id}/reject`, { reason: 'Duplicate of an existing listing.' })
          const eventsBefore = await db.submissionEvent.count({ where: { submissionId: rejected.id } })

          const cases: [string, unknown][] = [
            ['approve', approvalBody('rejected-then-approved')],
            ['reject', { reason: 'Rejecting it a second time.' }],
            ['request-changes', { message: 'Changes on a rejected one.' }],
          ]
          for (const [action, body] of cases) {
            const response = await errorOf(await post(admin.client, `/admin/submissions/${rejected.id}/${action}`, body))
            assert.equal(response.status, 409, action)
            assert.equal(response.body.error.code, 'CONFLICT')
          }
          assert.equal(await db.submissionEvent.count({ where: { submissionId: rejected.id } }), eventsBefore)
          assert.equal(await db.tool.count({ where: { id: 'rejected-then-approved' } }), 0)

          const changes = await insertReviewable(db, { userId: submitter.user.id })
          await post(admin.client, `/admin/submissions/${changes.id}/request-changes`, { message: 'Add a pricing page first.' })
          assert.equal((await post(admin.client, `/admin/submissions/${changes.id}/request-changes`, { message: 'Asking a second time.' })).status, 409)
          assert.equal((await post(admin.client, `/admin/submissions/${changes.id}/approve`, approvalBody('approve-after-changes'))).status, 409)
          // Rejecting a stale change request is allowed.
          assert.equal((await post(admin.client, `/admin/submissions/${changes.id}/reject`, { reason: 'No response to the change request.' })).status, 200)
        })

        await t.test('internal notes are recorded but never reach the submitter or public APIs', async () => {
          const created = await insertReviewable(db, { userId: submitter.user.id })
          const secret = 'INTERNAL-ONLY: the founder emailed support twice.'
          assert.equal((await post(admin.client, `/admin/submissions/${created.id}/notes`, { note: '' })).status, 400)
          const noted = await readJson<DetailBody>(await post(admin.client, `/admin/submissions/${created.id}/notes`, { note: secret }))
          assert.equal(noted.submission.status, 'SUBMITTED')
          const event = noted.submission.events.at(-1)
          assert.equal(event?.type, 'NOTE_ADDED')
          assert.equal(event?.metadata.note, secret)

          const ownDetail = await (await submitter.client.get(`/me/submissions/${created.id}`)).text()
          const ownList = await (await submitter.client.get('/me/submissions')).text()
          const publicTools = await (await new Client(server.origin).get('/tools')).text()
          for (const text of [ownDetail, ownList, publicTools]) assert.equal(text.includes(secret), false)
          assert.equal(ownDetail.includes('NOTE_ADDED'), false)

          // Notes are allowed in any status, including after a decision.
          await post(admin.client, `/admin/submissions/${created.id}/reject`, { reason: 'Not a fit for the catalogue.' })
          assert.equal((await post(admin.client, `/admin/submissions/${created.id}/notes`, { note: 'Closed out.' })).status, 200)
        })

        await t.test('approve: draft catalogue record, linked, owned by the submitter, audited; the live catalogue is untouched', async () => {
          const created = await insertReviewable(db, { userId: submitter.user.id, name: 'Approvable Tool', url: 'https://approvable.example.org' })
          const liveBefore = await (await new Client(server.origin).get('/tools?limit=100')).text()

          const response = await post(admin.client, `/admin/submissions/${created.id}/approve`, approvalBody('approvable-tool'))
          assert.equal(response.status, 200)
          const body = await readJson<DetailBody>(response)
          assert.equal(body.submission.status, 'APPROVED')
          assert.equal(body.submission.toolId, 'approvable-tool')
          assert.equal(body.submission.proposal, null)
          assert.deepEqual(body.submission.allowedActions, ['note'])
          const event = body.submission.events.at(-1)
          assert.equal(event?.type, 'APPROVED')
          assert.equal(event?.metadata.toolId, 'approvable-tool')
          assert.equal(event?.metadata.ownershipGrantedTo, submitter.user.id)

          const tool = await db.tool.findUniqueOrThrow({ where: { id: 'approvable-tool' } })
          assert.equal(tool.status, 'draft')
          assert.equal(tool.source, 'submission')
          assert.equal(tool.url, 'https://approvable.example.org')
          assert.equal(tool.name, 'Approvable Tool')

          const ownership = await db.toolOwner.findUniqueOrThrow({ where: { toolId_userId: { toolId: 'approvable-tool', userId: submitter.user.id } } })
          assert.equal(ownership.grantedByUserId, admin.user.id)
          assert.equal((await db.user.findUniqueOrThrow({ where: { id: submitter.user.id } })).role, 'TOOL_OWNER')
          const grant = await db.adminAuditEvent.findFirstOrThrow({ where: { action: 'TOOL_OWNER_GRANTED', targetToolId: 'approvable-tool' } })
          assert.equal(grant.actorUserId, admin.user.id)

          // The public catalogue is served from the JSON catalogue: approval does not change it.
          assert.equal(await (await new Client(server.origin).get('/tools?limit=100')).text(), liveBefore)
          assert.equal((await new Client(server.origin).get('/tools/approvable-tool')).status, 404)
        })

        await t.test('approve validates the whole catalogue record and rolls back completely on failure', async () => {
          const created = await insertReviewable(db, { userId: submitter.user.id })
          const toolsBefore = await db.tool.count()
          const cases: [Record<string, unknown>, string][] = [
            [{ stages: [] }, 'tool.stages'],
            [{ roles: ['Wizard'] }, 'tool.roles.0'],
            [{ mono: 'ABC' }, 'tool.mono'],
            [{ slug: 'Not A Slug' }, 'tool.id'],
            [{ summary: 'Too short.' }, 'tool.summary'],
          ]
          for (const [override, field] of cases) {
            const response = await errorOf(await post(admin.client, `/admin/submissions/${created.id}/approve`, approvalBody('valid-slug-x', override)))
            assert.equal(response.status, 400, JSON.stringify(override))
            assert.equal(response.body.error.code, 'VALIDATION_FAILED')
            assert.ok(response.body.error.fields?.[field], `${field} in ${JSON.stringify(response.body.error.fields)}`)
          }
          const extra = await post(admin.client, `/admin/submissions/${created.id}/approve`, { ...approvalBody('x'), status: 'PUBLISHED' })
          assert.equal(extra.status, 400)

          assert.equal(await db.tool.count(), toolsBefore)
          assert.equal((await db.submission.findUniqueOrThrow({ where: { id: created.id } })).status, 'SUBMITTED')
          assert.equal(await db.submissionEvent.count({ where: { submissionId: created.id } }), 0)
        })

        await t.test('approve refuses duplicate URLs (database or live catalogue) and taken slugs, without partial writes', async () => {
          const dbDupe = await insertReviewable(db, { userId: submitter.user.id, url: 'https://existing-db-tool.example.com/' })
          // Same site once normalized: www., trailing slash and tracking params all fold away.
          const liveDupe = await insertReviewable(db, { userId: submitter.user.id, url: 'https://WWW.live-only.example.net/?utm_source=x&ref=y' })
          const slugClash = await insertReviewable(db, { userId: submitter.user.id })
          const toolsBefore = await db.tool.count()
          const ownersBefore = await db.toolOwner.count()

          const detailDupe = await detail(admin.client, dbDupe.id)
          assert.equal(detailDupe.submission.duplicates.catalogueTool?.id, 'existing-db-tool')
          assert.equal(detailDupe.submission.duplicates.catalogueTool?.location, 'database')

          const a = await errorOf(await post(admin.client, `/admin/submissions/${dbDupe.id}/approve`, approvalBody('fresh-slug-a')))
          assert.equal(a.status, 409)
          assert.equal(a.body.error.code, 'DUPLICATE_URL')

          const liveDetail = await detail(admin.client, liveDupe.id)
          assert.equal(liveDetail.submission.duplicates.catalogueTool?.location, 'live-catalogue')
          const b = await errorOf(await post(admin.client, `/admin/submissions/${liveDupe.id}/approve`, approvalBody('fresh-slug-b')))
          assert.equal(b.status, 409)
          assert.equal(b.body.error.code, 'DUPLICATE_URL')

          for (const taken of ['existing-db-tool', 'live-only']) {
            const c = await errorOf(await post(admin.client, `/admin/submissions/${slugClash.id}/approve`, approvalBody(taken)))
            assert.equal(c.status, 409, taken)
            assert.equal(c.body.error.code, 'CONFLICT')
            assert.ok(c.body.error.fields?.['tool.slug'])
          }

          assert.equal(await db.tool.count(), toolsBefore)
          assert.equal(await db.toolOwner.count(), ownersBefore)
          for (const id of [dbDupe.id, liveDupe.id, slugClash.id]) {
            assert.equal((await db.submission.findUniqueOrThrow({ where: { id } })).status, 'SUBMITTED')
          }
        })

        await t.test('the detail proposal never suggests a slug that is taken', async () => {
          const named = await insertReviewable(db, { userId: submitter.user.id, name: 'Existing DB Tool' })
          const body = await detail(admin.client, named.id)
          assert.equal(body.submission.proposal?.slug, 'existing-db-tool-2')
        })

        await t.test('a legacy (anonymous) submission is approved without inventing an owner', async () => {
          const legacy = await insertReviewable(db, { userId: null, name: 'Legacy Tool' })
          const body = await readJson<DetailBody>(await post(admin.client, `/admin/submissions/${legacy.id}/approve`, approvalBody('legacy-tool')))
          assert.equal(body.submission.status, 'APPROVED')
          assert.equal(body.submission.events.at(-1)?.metadata.ownershipGrantedTo, null)
          assert.equal(await db.toolOwner.count({ where: { toolId: 'legacy-tool' } }), 0)
        })

        await t.test('concurrent decisions: exactly one wins, the rest get 409, state stays consistent', async () => {
          // Mutually exclusive decisions: once either lands, the others are
          // invalid. (request-changes is left out on purpose: request-changes
          // THEN reject is a legal sequence, so both may rightly succeed.)
          for (let round = 0; round < 4; round++) {
            const created = await insertReviewable(db, { userId: submitter.user.id })
            const responses = await Promise.all([
              post(admin.client, `/admin/submissions/${created.id}/approve`, approvalBody(`race-${round}`)),
              post(superAdmin.client, `/admin/submissions/${created.id}/reject`, { reason: 'Rejected in a race with approval.' }),
              post(admin.client, `/admin/submissions/${created.id}/approve`, approvalBody(`race-${round}-b`)),
            ])
            const statuses = responses.map((response) => response.status).sort()
            assert.deepEqual(statuses, [200, 409, 409], `round ${round}: ${statuses.join(',')}`)

            const final = await db.submission.findUniqueOrThrow({ where: { id: created.id } })
            const decisions = await db.submissionEvent.findMany({ where: { submissionId: created.id } })
            assert.equal(decisions.length, 1)
            assert.equal(decisions[0]?.toStatus, final.status)
            const toolRows = await db.tool.count({ where: { id: { in: [`race-${round}`, `race-${round}-b`] } } })
            assert.equal(toolRows, final.status === 'APPROVED' ? 1 : 0)
            if (final.status === 'APPROVED') assert.match(final.toolId ?? '', new RegExp(`^race-${round}(-b)?$`))
            else assert.equal(final.toolId, null)
          }
        })

        await t.test('concurrent identical requests: one change request lands, the duplicate is 409', async () => {
          const created = await insertReviewable(db, { userId: submitter.user.id })
          const responses = await Promise.all(
            [0, 1, 2].map(() => post(admin.client, `/admin/submissions/${created.id}/request-changes`, { message: 'Double-clicked change request.' })),
          )
          assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409, 409])
          assert.equal(await db.submissionEvent.count({ where: { submissionId: created.id } }), 1)
        })

        await t.test('the audit trail is append-only in the database', async () => {
          const event = await db.submissionEvent.findFirstOrThrow({ where: { eventType: 'APPROVED' } })
          await assert.rejects(db.submissionEvent.update({ where: { id: event.id }, data: { metadata: {} } }), /append-only/)
          await assert.rejects(db.submissionEvent.delete({ where: { id: event.id } }), /append-only/)
          const adminEvent = await db.adminAuditEvent.findFirstOrThrow()
          await assert.rejects(db.adminAuditEvent.update({ where: { id: adminEvent.id }, data: { metadata: {} } }), /append-only/)
          await assert.rejects(db.adminAuditEvent.delete({ where: { id: adminEvent.id } }), /append-only/)
          await assert.rejects(db.$executeRawUnsafe('TRUNCATE admin_audit_events'), /append-only/)
          // ...and the API offers no way to try.
          for (const method of ['DELETE', 'PATCH', 'PUT']) {
            assert.equal((await superAdmin.client.request(method, `/admin/audit/${adminEvent.id}`, method === 'DELETE' ? undefined : {})).status, 404, method)
          }
        })

        await t.test('cross-site writes are refused before anything runs', async () => {
          const created = await insertReviewable(db, { userId: submitter.user.id })
          const response = await admin.client.request('POST', `/admin/submissions/${created.id}/reject`, { reason: 'A forged cross-site rejection.' }, { origin: 'https://evil.example' })
          assert.equal(response.status, 403)
          assert.equal((await db.submission.findUniqueOrThrow({ where: { id: created.id } })).status, 'SUBMITTED')
          // The legitimate origin works.
          assert.equal((await admin.client.request('POST', `/admin/submissions/${created.id}/notes`, { note: 'ok' }, { origin: ALLOWED_ORIGIN })).status, 200)
        })

        await t.test('errors and responses leak no credentials or database internals', async () => {
          const malformedJson = await fetch(`${server.origin}/api/admin/submissions/${randomUUID()}/reject`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: [...admin.client.cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
            body: '{"reason": ',
          })
          assert.equal(malformedJson.status, 400)
          const texts = [
            await malformedJson.text(),
            await (await admin.client.get('/admin/submissions?pageSize=100')).text(),
            await (await admin.client.get('/admin/users?pageSize=100')).text(),
            await (await admin.client.get('/admin/audit?pageSize=100')).text(),
            await (await admin.client.get(`/admin/submissions/${(await insertReviewable(db, { userId: submitter.user.id })).id}`)).text(),
            await (await post(admin.client, `/admin/submissions/${randomUUID()}/approve`, approvalBody('nope'))).text(),
          ]
          for (const text of texts) {
            assertNoSecrets(text)
            assert.equal(/prisma|postgres|P20\d\d|stack/i.test(text), false, text.slice(0, 120))
          }
          // A user created directly still has a hash in the DB; none of it leaves.
          const someone = await insertUser(db, 'USER')
          assertNoSecrets(await (await admin.client.get(`/admin/users/${someone.id}`)).text())
        })
      },
      { catalogue },
    )
  } finally {
    await drop()
  }
})
