/*
 * Phase 2B — role guards, tool ownership and explicit IDOR attempts, over
 * real HTTP against an isolated Postgres schema.
 *
 * The scenario the phase brief names: user A owns notion-ai, user B owns
 * claude. A must never reach B's tool, or B's submission, by changing an id
 * in the URL or body — and must get the same NOT_FOUND an unknown id gets,
 * so probing reveals nothing.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestDatabase, dbSkipReason } from './dbHarness.ts'
import { Client, insertSubmission, insertTool, signedInAs, withAccountServer } from './authHelpers.ts'
import { readJson } from './helpers.ts'

interface ErrorBody {
  error: { code: string; message: string }
}

const SUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

async function errorOf(response: Response): Promise<{ status: number; body: ErrorBody }> {
  return { status: response.status, body: await readJson<ErrorBody>(response) }
}

await test('authorization and ownership', { skip: dbSkipReason }, async (t) => {
  const { db, drop } = await createTestDatabase()
  try {
    await insertTool(db, 'notion-ai')
    await insertTool(db, 'claude')
    await insertTool(db, 'unowned-tool')

    await withAccountServer(db, async (server) => {
      const superAdmin = await signedInAs(db, server, 'SUPER_ADMIN')
      const admin = await signedInAs(db, server, 'ADMIN')
      const plain = await signedInAs(db, server, 'USER')
      const ownerA = await signedInAs(db, server, 'USER')
      const ownerB = await signedInAs(db, server, 'USER')

      const put = (client: Client, path: string) => client.request('PUT', path)
      const del = (client: Client, path: string) => client.request('DELETE', path)
      const patch = (client: Client, path: string, body: unknown) => client.request('PATCH', path, body)

      await t.test('ADMIN can grant ownership; the user becomes TOOL_OWNER', async () => {
        const grantA = await put(admin.client, `/admin/tools/notion-ai/owners/${ownerA.user.id}`)
        assert.equal(grantA.status, 201)
        assert.equal((await readJson<{ role: string }>(grantA)).role, 'TOOL_OWNER')
        assert.equal((await put(admin.client, `/admin/tools/claude/owners/${ownerB.user.id}`)).status, 201)
        // Idempotent.
        assert.equal((await put(admin.client, `/admin/tools/notion-ai/owners/${ownerA.user.id}`)).status, 200)
        const row = await db.user.findUniqueOrThrow({ where: { id: ownerA.user.id } })
        assert.equal(row.role, 'TOOL_OWNER')
        const owner = await db.toolOwner.findUniqueOrThrow({ where: { toolId_userId: { toolId: 'notion-ai', userId: ownerA.user.id } } })
        assert.equal(owner.grantedByUserId, admin.user.id)
      })

      await t.test('the role takes effect on the next request with the SAME session', async () => {
        const me = await readJson<{ user: { role: string } }>(await ownerA.client.get('/auth/me'))
        assert.equal(me.user.role, 'TOOL_OWNER')
      })

      await t.test('USER cannot perform admin actions (403)', async () => {
        const { status, body } = await errorOf(await put(plain.client, `/admin/tools/claude/owners/${plain.user.id}`))
        assert.equal(status, 403)
        assert.equal(body.error.code, 'FORBIDDEN')
        assert.equal(await db.toolOwner.count({ where: { userId: plain.user.id } }), 0)
      })

      await t.test('TOOL_OWNER cannot perform admin actions, even on their own tool', async () => {
        assert.equal((await ownerA.client.get('/admin/tools/notion-ai/owners')).status, 403)
        assert.equal((await put(ownerA.client, `/admin/tools/claude/owners/${ownerA.user.id}`)).status, 403)
        assert.equal(await ownerA.client.get('/admin/tools/claude/owners').then((r) => r.status), 403)
      })

      await t.test('anonymous requests to protected routes are 401', async () => {
        const client = new Client(server.origin)
        for (const path of ['/me/tools', '/me/tools/claude', `/me/submissions/${SUB_A}`, '/admin/tools/claude/owners']) {
          assert.equal((await client.get(path)).status, 401, path)
        }
      })

      await t.test('an owner sees exactly their own tools', async () => {
        const body = await readJson<{ items: { tool: { id: string } }[] }>(await ownerA.client.get('/me/tools'))
        assert.deepEqual(body.items.map((item) => item.tool.id), ['notion-ai'])
        const own = await ownerA.client.get('/me/tools/notion-ai')
        assert.equal(own.status, 200)
        assert.equal((await readJson<{ tool: { id: string } }>(own)).tool.id, 'notion-ai')
      })

      await t.test("IDOR: changing the tool id to another owner's tool is NOT_FOUND", async () => {
        const otherOwners = await errorOf(await ownerA.client.get('/me/tools/claude'))
        const unowned = await errorOf(await ownerA.client.get('/me/tools/unowned-tool'))
        const missing = await errorOf(await ownerA.client.get('/me/tools/does-not-exist'))
        assert.equal(otherOwners.status, 404)
        // Indistinguishable from an id that doesn't exist.
        assert.deepEqual(otherOwners, unowned)
        assert.deepEqual(otherOwners, missing)
        assert.equal((await ownerB.client.get('/me/tools/notion-ai')).status, 404)
      })

      await t.test('IDOR: path tricks do not escape the ownership check', async () => {
        for (const path of ['/me/tools/claude%2F..%2Fnotion-ai', '/me/tools/CLAUDE', '/me/tools/claude%00', "/me/tools/claude' OR '1'='1"]) {
          const status = (await ownerA.client.get(path)).status
          assert.ok(status === 404, `${path} → ${status}`)
        }
      })

      await t.test("IDOR: an owner cannot read another user's submission", async () => {
        await insertSubmission(db, SUB_A, ownerA.user.id)
        await insertSubmission(db, SUB_B, ownerB.user.id)

        const own = await ownerA.client.get(`/me/submissions/${SUB_A}`)
        assert.equal(own.status, 200)
        const ownBody = await readJson<{ submission: Record<string, unknown> }>(own)
        assert.equal(ownBody.submission.id, SUB_A)
        assert.equal('reviewerId' in ownBody.submission, false)

        const theirs = await errorOf(await ownerA.client.get(`/me/submissions/${SUB_B}`))
        const unknown = await errorOf(await ownerA.client.get('/me/submissions/cccccccc-cccc-4ccc-8ccc-cccccccccccc'))
        const malformed = await errorOf(await ownerA.client.get('/me/submissions/1'))
        assert.equal(theirs.status, 404)
        assert.deepEqual(theirs, unknown)
        assert.deepEqual(theirs, malformed)
        assert.equal((await ownerB.client.get(`/me/submissions/${SUB_A}`)).status, 404)
      })

      await t.test('IDOR: ids smuggled into a body or query are ignored', async () => {
        const viaQuery = await ownerA.client.get(`/me/tools?userId=${ownerB.user.id}`)
        const ids = (await readJson<{ items: { tool: { id: string } }[] }>(viaQuery)).items.map((item) => item.tool.id)
        assert.deepEqual(ids, ['notion-ai'])
        // A body naming another user on a privileged route changes nothing.
        const viaBody = await ownerA.client.request('PATCH', `/admin/users/${ownerA.user.id}/role`, { role: 'SUPER_ADMIN', userId: ownerB.user.id })
        assert.equal(viaBody.status, 403)
      })

      await t.test('ADMIN can open any tool and any submission (moderation)', async () => {
        assert.equal((await admin.client.get('/me/tools/claude')).status, 200)
        assert.equal((await admin.client.get(`/me/submissions/${SUB_B}`)).status, 200)
        const owners = await readJson<{ items: { userId: string }[] }>(await admin.client.get('/admin/tools/claude/owners'))
        assert.deepEqual(owners.items.map((item) => item.userId), [ownerB.user.id])
      })

      await t.test('a tool can have more than one owner', async () => {
        assert.equal((await put(admin.client, `/admin/tools/claude/owners/${ownerA.user.id}`)).status, 201)
        assert.equal((await ownerA.client.get('/me/tools/claude')).status, 200)
        assert.equal((await ownerB.client.get('/me/tools/claude')).status, 200)
      })

      await t.test('revoking ownership removes access immediately; last revoke demotes to USER', async () => {
        await del(admin.client, `/admin/tools/claude/owners/${ownerA.user.id}`)
        assert.equal((await ownerA.client.get('/me/tools/claude')).status, 404)
        assert.equal((await db.user.findUniqueOrThrow({ where: { id: ownerA.user.id } })).role, 'TOOL_OWNER')

        const revoke = await del(admin.client, `/admin/tools/notion-ai/owners/${ownerA.user.id}`)
        assert.equal((await readJson<{ role: string }>(revoke)).role, 'USER')
        assert.equal((await ownerA.client.get('/me/tools/notion-ai')).status, 404)
        // Revoking something that is not there is harmless.
        assert.equal((await readJson<{ removed: boolean }>(await del(admin.client, `/admin/tools/notion-ai/owners/${ownerA.user.id}`))).removed, false)
      })

      await t.test('granting to an unknown tool or user is NOT_FOUND', async () => {
        assert.equal((await put(admin.client, `/admin/tools/nope/owners/${ownerA.user.id}`)).status, 404)
        assert.equal((await put(admin.client, '/admin/tools/claude/owners/dddddddd-dddd-4ddd-8ddd-dddddddddddd')).status, 404)
        assert.equal((await put(admin.client, '/admin/tools/claude/owners/not-a-uuid')).status, 404)
      })

      await t.test('ADMIN cannot manage roles; SUPER_ADMIN can', async () => {
        assert.equal((await patch(admin.client, `/admin/users/${plain.user.id}/role`, { role: 'ADMIN' })).status, 403)
        const promoted = await patch(superAdmin.client, `/admin/users/${plain.user.id}/role`, { role: 'ADMIN' })
        assert.equal(promoted.status, 200)
        assert.equal((await readJson<{ user: { role: string } }>(promoted)).user.role, 'ADMIN')
        // The promotion is live on the user's existing session.
        assert.equal((await plain.client.get('/admin/tools/claude/owners')).status, 200)
      })

      await t.test('demotion revokes sessions and removes access at once', async () => {
        const demoted = await patch(superAdmin.client, `/admin/users/${plain.user.id}/role`, { role: 'USER' })
        assert.equal(demoted.status, 200)
        assert.equal((await plain.client.get('/admin/tools/claude/owners')).status, 401)
      })

      await t.test('asking for USER keeps TOOL_OWNER when the person still owns tools', async () => {
        const response = await patch(superAdmin.client, `/admin/users/${ownerB.user.id}/role`, { role: 'USER' })
        assert.equal((await readJson<{ user: { role: string } }>(response)).user.role, 'TOOL_OWNER')
      })

      await t.test('nobody can change their own role, and TOOL_OWNER/unknown roles are rejected', async () => {
        assert.equal((await patch(superAdmin.client, `/admin/users/${superAdmin.user.id}/role`, { role: 'USER' })).status, 403)
        assert.equal((await patch(superAdmin.client, `/admin/users/${ownerB.user.id}/role`, { role: 'TOOL_OWNER' })).status, 400)
        assert.equal((await patch(superAdmin.client, `/admin/users/${ownerB.user.id}/role`, { role: 'GOD' })).status, 400)
      })

      await t.test('SUPER_ADMIN passes every ADMIN check too', async () => {
        assert.equal((await superAdmin.client.get('/admin/tools/claude/owners')).status, 200)
        assert.equal((await superAdmin.client.get(`/me/submissions/${SUB_A}`)).status, 200)
      })
    })

    await t.test('a disabled admin loses admin access immediately', async () => {
      await withAccountServer(db, async (server) => {
        const admin = await signedInAs(db, server, 'ADMIN')
        assert.equal((await admin.client.get('/admin/tools/claude/owners')).status, 200)
        await db.user.update({ where: { id: admin.user.id }, data: { disabledAt: new Date() } })
        assert.equal((await admin.client.get('/admin/tools/claude/owners')).status, 401)
      })
    })

    await t.test('ownership is never inferred from the role alone', async () => {
      await withAccountServer(db, async (server) => {
        // A TOOL_OWNER role with no ownership rows grants access to nothing.
        const { client } = await signedInAs(db, server, 'TOOL_OWNER')
        assert.deepEqual((await readJson<{ items: unknown[] }>(await client.get('/me/tools'))).items, [])
        assert.equal((await client.get('/me/tools/claude')).status, 404)
      })
    })
  } finally {
    await drop()
  }
})
