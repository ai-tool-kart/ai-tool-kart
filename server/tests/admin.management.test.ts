/*
 * Phase 6 — catalogue, user and role administration, the audit log and
 * dashboard statistics, over real HTTP against an isolated Postgres schema.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createTestDatabase, dbSkipReason } from './dbHarness.ts'
import { Client, insertTool, insertUser, signedInAs, withAccountServer } from './authHelpers.ts'
import { approvalBody, assertNoSecrets, errorOf, insertReviewable } from './adminHelpers.ts'
import { fixtureCatalogue, makeTool, readJson } from './helpers.ts'
import { createUserAdminService } from '../src/auth/users.ts'

interface ToolDetail {
  tool: { id: string; slug: string; name: string; cat: string; url: string; tags: string[]; plainLine?: string; isMcpServer?: boolean }
  meta: { updatedAt: string; source: string }
  owners: { userId: string }[]
  issues: string[]
  possibleDuplicates: { id: string }[]
  liveCatalogue: { present: boolean; matchesDatabase: boolean }
  history: { type: string; actor: { id: string } | null; metadata: Record<string, unknown> }[]
}

interface Page<T> {
  items: T[]
  total: number
}

await test('admin management', { skip: dbSkipReason }, async (t) => {
  const { db, drop } = await createTestDatabase()
  try {
    await insertTool(db, 'alpha-writer')
    await insertTool(db, 'beta-coder')
    await db.tool.update({ where: { id: 'beta-coder' }, data: { cat: 'Code', name: 'Beta Coder' } })
    await insertTool(db, 'beta-coder-clone')
    await db.tool.update({ where: { id: 'beta-coder-clone' }, data: { name: 'beta coder', status: 'draft' } })
    // insertTool's summary is under the catalogue's 40-character floor; these
    // records are made valid so edits to them validate. broken-record stays broken.
    await db.tool.updateMany({
      where: { id: { in: ['alpha-writer', 'beta-coder', 'beta-coder-clone'] } },
      data: { summary: 'A valid catalogue summary that is comfortably longer than forty characters.' },
    })
    // A stored record that breaks the catalogue rules (summary under 40 chars).
    await insertTool(db, 'broken-record')
    // The live catalogue knows alpha-writer, but with a different name.
    const catalogue = fixtureCatalogue([makeTool({ id: 'alpha-writer', name: 'Alpha Writer (live)', url: 'https://alpha-writer.example.com' })])

    await withAccountServer(
      db,
      async (server) => {
        const superAdmin = await signedInAs(db, server, 'SUPER_ADMIN')
        const admin = await signedInAs(db, server, 'ADMIN')
        const plain = await signedInAs(db, server, 'USER')
        const patch = (client: Client, path: string, body: unknown) => client.request('PATCH', path, body)
        const loadTool = async (client: Client, id: string) => readJson<ToolDetail>(await client.get(`/admin/tools/${id}`))

        /* ── Tools ─────────────────────────────────────────────────────── */

        await t.test('tool list: search, filters and counts', async () => {
          const all = await readJson<Page<{ id: string; issueCount: number }>>(await admin.client.get('/admin/tools'))
          assert.equal(all.total, 4)
          const search = await readJson<Page<{ id: string }>>(await admin.client.get('/admin/tools?q=beta'))
          assert.deepEqual(search.items.map((item) => item.id).sort(), ['beta-coder', 'beta-coder-clone'])
          const drafts = await readJson<Page<{ id: string }>>(await admin.client.get('/admin/tools?status=draft'))
          assert.deepEqual(drafts.items.map((item) => item.id), ['beta-coder-clone'])
          const code = await readJson<Page<{ id: string }>>(await admin.client.get('/admin/tools?category=Code'))
          assert.deepEqual(code.items.map((item) => item.id), ['beta-coder'])
          assert.equal((await admin.client.get('/admin/tools?status=archived')).status, 400)
          assert.ok((all.items.find((item) => item.id === 'broken-record')?.issueCount ?? 0) > 0)
        })

        await t.test('tool detail: issues, possible duplicates, live-catalogue comparison', async () => {
          const broken = await loadTool(admin.client, 'broken-record')
          assert.ok(broken.issues.some((issue) => issue.startsWith('summary')), broken.issues.join('; '))
          assert.equal(broken.liveCatalogue.present, false)

          const beta = await loadTool(admin.client, 'beta-coder')
          assert.deepEqual(beta.possibleDuplicates.map((dup) => dup.id), ['beta-coder-clone'])

          const alpha = await loadTool(admin.client, 'alpha-writer')
          assert.equal(alpha.liveCatalogue.present, true)
          assert.equal(alpha.liveCatalogue.matchesDatabase, false)

          for (const bad of ['does-not-exist', 'NOT_A_SLUG', 'x%00y']) {
            assert.equal((await admin.client.get(`/admin/tools/${bad}`)).status, 404, bad)
          }
        })

        await t.test('tool edit: validated, audited, identifiers preserved, the live catalogue untouched', async () => {
          const before = await loadTool(admin.client, 'alpha-writer')
          const liveBefore = await (await new Client(server.origin).get('/tools/alpha-writer')).text()
          const response = await patch(admin.client, '/admin/tools/alpha-writer', {
            expectedUpdatedAt: before.meta.updatedAt,
            changes: { name: '  Alpha Writer Pro  ', tags: ['Writing', 'Editing'], plainLine: 'Helps you write.', isMcpServer: true },
          })
          assert.equal(response.status, 200)
          const after = await readJson<ToolDetail>(response)
          assert.equal(after.tool.id, 'alpha-writer')
          assert.equal(after.tool.slug, 'alpha-writer')
          assert.equal(after.tool.name, 'Alpha Writer Pro')
          assert.deepEqual(after.tool.tags, ['Writing', 'Editing'])
          assert.equal(after.tool.plainLine, 'Helps you write.')
          assert.equal(after.tool.isMcpServer, true)

          const event = after.history[0]
          assert.equal(event?.type, 'TOOL_UPDATED')
          assert.equal(event?.actor?.id, admin.user.id)
          const changes = event?.metadata.changes as Record<string, { from: unknown; to: unknown }>
          assert.deepEqual(Object.keys(changes).sort(), ['isMcpServer', 'name', 'plainLine', 'tags'])
          assert.deepEqual(changes.name, { from: 'alpha-writer', to: 'Alpha Writer Pro' })

          assert.equal(await (await new Client(server.origin).get('/tools/alpha-writer')).text(), liveBefore)
        })

        await t.test('tool edit: a stale editor gets 409, not a silent overwrite', async () => {
          const opened = await loadTool(admin.client, 'beta-coder')
          const first = await patch(superAdmin.client, '/admin/tools/beta-coder', { expectedUpdatedAt: opened.meta.updatedAt, changes: { tagline: 'Edited first.' } })
          assert.equal(first.status, 200)
          const second = await errorOf(await patch(admin.client, '/admin/tools/beta-coder', { expectedUpdatedAt: opened.meta.updatedAt, changes: { tagline: 'Edited second.' } }))
          assert.equal(second.status, 409)
          assert.equal(second.body.error.code, 'CONFLICT')
          assert.equal((await db.tool.findUniqueOrThrow({ where: { id: 'beta-coder' } })).tagline, 'Edited first.')
        })

        await t.test('tool edit: invalid values, read-only fields and URL collisions are refused', async () => {
          const current = await loadTool(admin.client, 'beta-coder')
          const expectedUpdatedAt = current.meta.updatedAt
          const invalid: [Record<string, unknown>, string][] = [
            [{ cat: 'Astrology' }, 'cat'],
            [{ url: 'javascript:alert(1)' }, 'url'],
            [{ model: 'Subscription' }, 'model'], // illegal for its 'free' pricing tier
            [{ tags: [] }, 'tags'],
          ]
          for (const [changes, field] of invalid) {
            const response = await errorOf(await patch(admin.client, '/admin/tools/beta-coder', { expectedUpdatedAt, changes }))
            assert.equal(response.status, 400, JSON.stringify(changes))
            assert.ok(response.body.error.fields?.[field], `${field}: ${JSON.stringify(response.body.error.fields)}`)
          }
          for (const changes of [{ id: 'renamed' }, { slug: 'renamed' }, { status: 'active' }, { rating: 5 }, { source: 'seed' }]) {
            assert.equal((await patch(admin.client, '/admin/tools/beta-coder', { expectedUpdatedAt, changes })).status, 400, JSON.stringify(changes))
          }
          assert.equal((await patch(admin.client, '/admin/tools/beta-coder', { changes: { name: 'x' } })).status, 400)
          assert.equal((await patch(admin.client, '/admin/tools/beta-coder', { expectedUpdatedAt, changes: {} })).status, 400)

          const clash = await errorOf(await patch(admin.client, '/admin/tools/beta-coder', { expectedUpdatedAt, changes: { url: 'https://www.alpha-writer.example.com/' } }))
          assert.equal(clash.status, 409)
          assert.equal(clash.body.error.code, 'DUPLICATE_URL')

          assert.equal((await db.tool.findUniqueOrThrow({ where: { id: 'beta-coder' } })).updatedAt.toISOString(), expectedUpdatedAt)
          assert.equal((await patch(admin.client, '/admin/tools/no-such-tool', { expectedUpdatedAt, changes: { name: 'x' } })).status, 404)
        })

        await t.test('an invalid stored record can only be saved once its broken field is fixed', async () => {
          const broken = await loadTool(admin.client, 'broken-record')
          const nameOnly = await errorOf(await patch(admin.client, '/admin/tools/broken-record', { expectedUpdatedAt: broken.meta.updatedAt, changes: { name: 'Renamed' } }))
          assert.equal(nameOnly.status, 400)
          assert.ok(nameOnly.body.error.fields?.summary)
          const fixed = await readJson<ToolDetail>(
            await patch(admin.client, '/admin/tools/broken-record', {
              expectedUpdatedAt: broken.meta.updatedAt,
              changes: { name: 'Renamed', summary: 'Now a properly descriptive summary for this catalogue record.' },
            }),
          )
          assert.deepEqual(fixed.issues, [])
        })

        await t.test('tool edit and ownership are admin-only', async () => {
          const current = await loadTool(admin.client, 'beta-coder')
          assert.equal((await patch(plain.client, '/admin/tools/beta-coder', { expectedUpdatedAt: current.meta.updatedAt, changes: { name: 'Hijacked' } })).status, 403)
          assert.equal((await plain.client.request('PUT', `/admin/tools/beta-coder/owners/${plain.user.id}`)).status, 403)
          assert.equal((await db.tool.findUniqueOrThrow({ where: { id: 'beta-coder' } })).name, 'Beta Coder')
        })

        await t.test('ownership grants and revocations are audited; repeats record nothing', async () => {
          const target = await insertUser(db, 'USER')
          assert.equal((await admin.client.request('PUT', `/admin/tools/beta-coder/owners/${target.id}`)).status, 201)
          assert.equal((await admin.client.request('PUT', `/admin/tools/beta-coder/owners/${target.id}`)).status, 200)
          assert.equal((await admin.client.request('DELETE', `/admin/tools/beta-coder/owners/${target.id}`)).status, 200)
          assert.equal((await admin.client.request('DELETE', `/admin/tools/beta-coder/owners/${target.id}`)).status, 200)

          const events = await db.adminAuditEvent.findMany({ where: { targetUserId: target.id }, orderBy: { createdAt: 'asc' } })
          assert.deepEqual(events.map((event) => event.action), ['TOOL_OWNER_GRANTED', 'TOOL_OWNER_REVOKED'])
          assert.deepEqual(events[0]?.metadata, { roleBefore: 'USER', roleAfter: 'TOOL_OWNER' })
          assert.deepEqual(events[1]?.metadata, { roleBefore: 'TOOL_OWNER', roleAfter: 'USER' })
          assert.ok(events.every((event) => event.actorUserId === admin.user.id && event.targetToolId === 'beta-coder'))
        })

        /* ── Users and roles ───────────────────────────────────────────── */

        await t.test('user list and detail: counts, filters, no secrets', async () => {
          const owner = await insertUser(db, 'USER', `owner-${randomUUID()}@example.com`)
          await admin.client.request('PUT', `/admin/tools/alpha-writer/owners/${owner.id}`)
          await insertReviewable(db, { userId: owner.id })

          const list = await admin.client.get(`/admin/users?q=${encodeURIComponent(owner.email)}`)
          const text = await list.text()
          assertNoSecrets(text)
          const body = JSON.parse(text) as Page<{ id: string; role: string; submissionCount: number; ownedToolCount: number }>
          assert.equal(body.total, 1)
          assert.deepEqual(
            { role: body.items[0]?.role, submissions: body.items[0]?.submissionCount, owned: body.items[0]?.ownedToolCount },
            { role: 'TOOL_OWNER', submissions: 1, owned: 1 },
          )
          const admins = await readJson<Page<{ role: string }>>(await admin.client.get('/admin/users?role=ADMIN,SUPER_ADMIN'))
          assert.ok(admins.items.every((item) => item.role === 'ADMIN' || item.role === 'SUPER_ADMIN'))
          assert.equal((await admin.client.get('/admin/users?role=GOD')).status, 400)

          const detail = await readJson<{ ownedTools: { id: string }[]; history: { type: string }[]; assignableRoles: string[] }>(
            await admin.client.get(`/admin/users/${owner.id}`),
          )
          assert.deepEqual(detail.ownedTools.map((tool) => tool.id), ['alpha-writer'])
          assert.deepEqual(detail.history.map((event) => event.type), ['TOOL_OWNER_GRANTED'])
          // An ADMIN is shown no role control; a SUPER_ADMIN is, except on themselves.
          assert.deepEqual(detail.assignableRoles, [])
          const asSuper = await readJson<{ assignableRoles: string[] }>(await superAdmin.client.get(`/admin/users/${owner.id}`))
          assert.deepEqual(asSuper.assignableRoles, ['USER', 'ADMIN', 'SUPER_ADMIN'])
          const self = await readJson<{ assignableRoles: string[] }>(await superAdmin.client.get(`/admin/users/${superAdmin.user.id}`))
          assert.deepEqual(self.assignableRoles, [])

          for (const bad of [randomUUID(), 'not-a-uuid']) assert.equal((await admin.client.get(`/admin/users/${bad}`)).status, 404)
        })

        await t.test('ADMIN cannot change roles — including granting SUPER_ADMIN, to others or itself', async () => {
          const target = await insertUser(db, 'USER')
          for (const [id, role] of [[target.id, 'ADMIN'], [target.id, 'SUPER_ADMIN'], [admin.user.id, 'SUPER_ADMIN']] as const) {
            const response = await errorOf(await patch(admin.client, `/admin/users/${id}/role`, { role }))
            assert.equal(response.status, 403, `${role}`)
          }
          assert.equal((await db.user.findUniqueOrThrow({ where: { id: target.id } })).role, 'USER')
          assert.equal((await db.user.findUniqueOrThrow({ where: { id: admin.user.id } })).role, 'ADMIN')
          assert.equal(await db.adminAuditEvent.count({ where: { action: 'USER_ROLE_CHANGED' } }), 0)
        })

        await t.test('SUPER_ADMIN changes roles with an audit record; demotion signs the user out', async () => {
          const target = await signedInAs(db, server, 'USER')
          const promoted = await patch(superAdmin.client, `/admin/users/${target.user.id}/role`, { role: 'ADMIN' })
          assert.equal(promoted.status, 200)
          assert.equal((await target.client.get('/admin/stats')).status, 200)

          const demoted = await patch(superAdmin.client, `/admin/users/${target.user.id}/role`, { role: 'USER' })
          assert.equal(demoted.status, 200)
          assert.equal((await target.client.get('/admin/stats')).status, 401)

          const events = await db.adminAuditEvent.findMany({ where: { action: 'USER_ROLE_CHANGED', targetUserId: target.user.id }, orderBy: { createdAt: 'asc' } })
          assert.deepEqual(events.map((event) => event.metadata), [
            { from: 'USER', to: 'ADMIN', requested: 'ADMIN' },
            { from: 'ADMIN', to: 'USER', requested: 'USER' },
          ])
          assert.ok(events.every((event) => event.actorUserId === superAdmin.user.id))

          // A no-op changes nothing and records nothing.
          assert.equal((await patch(superAdmin.client, `/admin/users/${target.user.id}/role`, { role: 'USER' })).status, 200)
          assert.equal(await db.adminAuditEvent.count({ where: { action: 'USER_ROLE_CHANGED', targetUserId: target.user.id } }), 2)
        })

        await t.test('self-escalation, invalid roles, malformed ids and forged bodies are refused', async () => {
          assert.equal((await patch(superAdmin.client, `/admin/users/${superAdmin.user.id}/role`, { role: 'USER' })).status, 403)
          const target = await insertUser(db, 'USER')
          for (const body of [{ role: 'TOOL_OWNER' }, { role: 'GOD' }, { role: 'admin' }, {}, { role: 'ADMIN', userId: plain.user.id }]) {
            assert.equal((await patch(superAdmin.client, `/admin/users/${target.id}/role`, body)).status, 400, JSON.stringify(body))
          }
          for (const id of ['not-a-uuid', randomUUID()]) {
            assert.equal((await patch(superAdmin.client, `/admin/users/${id}/role`, { role: 'ADMIN' })).status, 404, id)
          }
          // A plain user cannot reach the route at all, whatever the body says.
          assert.equal((await patch(plain.client, `/admin/users/${plain.user.id}/role`, { role: 'SUPER_ADMIN' })).status, 403)
          assert.equal((await db.user.findUniqueOrThrow({ where: { id: plain.user.id } })).role, 'USER')
        })

        await t.test('the service re-checks the actor: a stale or forged SUPER_ADMIN context is refused', async () => {
          const service = createUserAdminService({ db })
          const target = await insertUser(db, 'USER')
          // A session resolved while this user WAS a super admin, replayed after demotion.
          await assert.rejects(service.setRole({ id: admin.user.id, role: 'SUPER_ADMIN' }, target.id, { role: 'SUPER_ADMIN' }), { code: 'FORBIDDEN' })
          const disabled = await insertUser(db, 'SUPER_ADMIN')
          await db.user.update({ where: { id: disabled.id }, data: { disabledAt: new Date() } })
          await assert.rejects(service.setRole({ id: disabled.id, role: 'SUPER_ADMIN' }, target.id, { role: 'ADMIN' }), { code: 'FORBIDDEN' })
          assert.equal((await db.user.findUniqueOrThrow({ where: { id: target.id } })).role, 'USER')
        })

        await t.test('two super admins demoting each other at once never leaves zero super admins', async () => {
          // Make every OTHER super admin inactive so these two are the only active ones.
          const others = await db.user.findMany({ where: { role: 'SUPER_ADMIN', disabledAt: null } })
          for (let round = 0; round < 4; round++) {
            const a = await signedInAs(db, server, 'SUPER_ADMIN')
            const b = await signedInAs(db, server, 'SUPER_ADMIN')
            await db.user.updateMany({ where: { id: { in: others.map((user) => user.id) } }, data: { disabledAt: new Date() } })

            const responses = await Promise.all([
              patch(a.client, `/admin/users/${b.user.id}/role`, { role: 'USER' }),
              patch(b.client, `/admin/users/${a.user.id}/role`, { role: 'USER' }),
            ])
            const statuses = responses.map((response) => response.status).sort()
            assert.equal(statuses[0], 200, `round ${round}: ${statuses.join(',')}`)
            assert.notEqual(statuses[1], 200, `round ${round}: both demotions succeeded`)
            assert.equal(await db.user.count({ where: { role: 'SUPER_ADMIN', disabledAt: null } }), 1, `round ${round}`)

            // Tidy up for the next round: the survivor is retired too.
            await db.user.updateMany({ where: { id: { in: [a.user.id, b.user.id] } }, data: { disabledAt: new Date() } })
          }
          await db.user.updateMany({ where: { id: { in: others.map((user) => user.id) } }, data: { disabledAt: null } })
        })

        /* ── Audit log and statistics ──────────────────────────────────── */

        await t.test('audit log: merged, newest first, filterable and paginated', async () => {
          const sub = await insertReviewable(db, { userId: plain.user.id })
          await admin.client.post(`/admin/submissions/${sub.id}/reject`, { reason: 'Not a fit for this catalogue.' })

          const all = await readJson<Page<{ kind: string; type: string; createdAt: string; actor: { id: string } | null }>>(
            await admin.client.get('/admin/audit?pageSize=100'),
          )
          assert.equal(all.total, (await db.submissionEvent.count()) + (await db.adminAuditEvent.count()))
          assert.equal(all.items[0]?.type, 'REJECTED')
          const times = all.items.map((item) => item.createdAt)
          assert.deepEqual(times, [...times].sort().reverse())
          assert.ok(all.items.some((item) => item.kind === 'admin'))

          const onlyAdmin = await readJson<Page<{ kind: string }>>(await admin.client.get('/admin/audit?kind=admin'))
          assert.ok(onlyAdmin.items.every((item) => item.kind === 'admin'))
          assert.equal(onlyAdmin.total, await db.adminAuditEvent.count())

          const first = await readJson<Page<{ id: string }>>(await admin.client.get('/admin/audit?pageSize=2&page=1'))
          const second = await readJson<Page<{ id: string }>>(await admin.client.get('/admin/audit?pageSize=2&page=2'))
          assert.equal(first.items.length, 2)
          assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, first.items.length + second.items.length)
          assert.equal((await admin.client.get('/admin/audit?kind=secret')).status, 400)
          assert.equal((await plain.client.get('/admin/audit')).status, 403)
        })

        await t.test('statistics are computed from the database', async () => {
          const pending = await insertReviewable(db, { userId: plain.user.id })
          const toApprove = await insertReviewable(db, { userId: plain.user.id, name: 'Stats Tool' })
          await admin.client.post(`/admin/submissions/${toApprove.id}/approve`, approvalBody('stats-tool'))

          const stats = await readJson<{
            catalogue: { databaseTotal: number; byStatus: Record<string, number>; fromSubmissions: number; liveActive: number }
            submissions: { total: number; awaitingReview: number; approved: number; rejected: number; changesRequested: number }
            users: { total: number; byRole: Record<string, number> }
            moderation: { decisions: number }
            recentActivity: { actorType: string }[]
          }>(await admin.client.get('/admin/stats'))

          assert.equal(stats.catalogue.databaseTotal, await db.tool.count())
          assert.equal(stats.catalogue.byStatus.draft, await db.tool.count({ where: { status: 'draft' } }))
          assert.equal(stats.catalogue.fromSubmissions, 1)
          assert.equal(stats.catalogue.liveActive, 1)
          assert.equal(stats.submissions.total, await db.submission.count())
          assert.equal(stats.submissions.awaitingReview, await db.submission.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }))
          assert.ok(stats.submissions.awaitingReview >= 1, pending.id)
          assert.equal(stats.submissions.approved, await db.submission.count({ where: { status: { in: ['APPROVED', 'PUBLISHED'] } } }))
          assert.equal(stats.submissions.rejected, await db.submission.count({ where: { status: 'REJECTED' } }))
          assert.equal(stats.users.total, await db.user.count())
          assert.equal(stats.users.byRole.ADMIN, await db.user.count({ where: { role: 'ADMIN' } }))
          assert.equal(stats.moderation.decisions, await db.submissionEvent.count({ where: { eventType: { in: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'] } } }))
          assert.ok(stats.recentActivity.length > 0)
          assert.ok(stats.recentActivity.every((entry) => entry.actorType === 'ADMIN'))
        })
      },
      { catalogue },
    )
  } finally {
    await drop()
  }
})
