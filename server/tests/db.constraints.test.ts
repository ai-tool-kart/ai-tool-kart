/*
 * Database-level guarantees: the hand-written parts of the migrations
 * (append-only audit trail, partial unique index, CHECK constraints) and
 * the Phase 2B relationships with their cascade/restrict behaviour.
 *
 * Runs against an isolated, freshly migrated schema (tests/dbHarness.ts),
 * only when TEST_DATABASE_URL points at a LOCAL database. Skipped otherwise.
 *
 *   TEST_DATABASE_URL=postgresql://$USER@localhost:5432/aitoolkart_test npm test
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { FAST_SCRYPT, insertTool, insertUser } from './authHelpers.ts'
import { hashPassword } from '../src/auth/password.ts'
import { createTestDatabase, dbSkipReason } from './dbHarness.ts'

function submissionData(id: string, status: 'SUBMITTED' | 'REJECTED' = 'SUBMITTED', userId: string | null = null) {
  return {
    id,
    status,
    userId,
    // Rows without a user are only legal as legacy imports (Phase 2B CHECK).
    source: userId ? ('form' as const) : ('legacy_json' as const),
    siteUrl: 'https://example.com',
    normalizedUrl: 'example.com',
    name: 'Example',
    tagline: 'Tagline',
    description: 'Description',
    category: 'Writing',
    pricingModel: 'Free',
    tags: [],
    alternatives: [],
    launchWeekId: '2026-11-16',
  }
}

const CONSTRAINT = /constraint|violat|foreign key|unique|check/i

await test('database constraints', { skip: dbSkipReason }, async (t) => {
  const { db, drop } = await createTestDatabase()
  try {
    /* ── Phase 2A ─────────────────────────────────────────────────────── */

    await t.test('submission_events rejects UPDATE, DELETE and TRUNCATE', async () => {
      await db.submission.create({ data: submissionData('11111111-1111-4111-8111-111111111111') })
      const event = await db.submissionEvent.create({
        data: {
          submissionId: '11111111-1111-4111-8111-111111111111',
          actorType: 'SYSTEM',
          eventType: 'SUBMISSION_CREATED',
          toStatus: 'SUBMITTED',
        },
      })
      await assert.rejects(
        db.submissionEvent.update({ where: { id: event.id }, data: { metadata: { edited: true } } }),
        /append-only/,
      )
      await assert.rejects(db.submissionEvent.delete({ where: { id: event.id } }), /append-only/)
      await assert.rejects(db.$executeRawUnsafe('TRUNCATE submission_events CASCADE'), /append-only/)
      assert.equal(await db.submissionEvent.count(), 1)
    })

    await t.test('only one live submission per normalized URL', async () => {
      await assert.rejects(
        db.submission.create({ data: submissionData('22222222-2222-4222-8222-222222222222') }),
        /Unique constraint|normalized_url/,
      )
    })

    await t.test('a rejected submission does not block a new one for the same URL', async () => {
      await db.submission.create({ data: submissionData('33333333-3333-4333-8333-333333333333', 'REJECTED') })
      assert.equal(await db.submission.count({ where: { normalizedUrl: 'example.com' } }), 2)
    })

    await t.test('launch_week_id format is enforced by the database', async () => {
      await assert.rejects(
        db.submission.create({
          data: { ...submissionData('44444444-4444-4444-8444-444444444444', 'REJECTED'), launchWeekId: 'next week' },
        }),
        /launch_week_format|check constraint/i,
      )
    })

    /* ── Phase 2B: users ──────────────────────────────────────────────── */

    await t.test('user email is unique', async () => {
      const user = await insertUser(db)
      await assert.rejects(insertUser(db, 'USER', user.email), /Unique constraint|email/)
    })

    await t.test('a non-normalized email cannot be stored, even bypassing the app', async () => {
      const passwordHash = await hashPassword('irrelevant pw', FAST_SCRYPT)
      await assert.rejects(db.user.create({ data: { email: 'Mixed@Example.com', passwordHash } }), CONSTRAINT)
      await assert.rejects(db.user.create({ data: { email: ' padded@example.com', passwordHash } }), CONSTRAINT)
    })

    await t.test('a plaintext-looking password_hash cannot be stored', async () => {
      await assert.rejects(db.user.create({ data: { email: 'plain@example.com', passwordHash: 'hunter2hunter2' } }), CONSTRAINT)
    })

    /* ── Phase 2B: sessions ───────────────────────────────────────────── */

    await t.test('a session must belong to a real user, and dies with it', async () => {
      const tokenHash = 'a'.repeat(64)
      const expiresAt = new Date(Date.now() + 60_000)
      await assert.rejects(
        db.session.create({ data: { userId: '99999999-9999-4999-8999-999999999999', tokenHash, expiresAt } }),
        CONSTRAINT,
      )
      const user = await insertUser(db)
      await db.session.create({ data: { userId: user.id, tokenHash, expiresAt } })
      await db.user.delete({ where: { id: user.id } })
      assert.equal(await db.session.count({ where: { tokenHash } }), 0)
    })

    await t.test('session token hashes are unique, hex-shaped, and expire after creation', async () => {
      const user = await insertUser(db)
      const expiresAt = new Date(Date.now() + 60_000)
      await db.session.create({ data: { userId: user.id, tokenHash: 'b'.repeat(64), expiresAt } })
      await assert.rejects(db.session.create({ data: { userId: user.id, tokenHash: 'b'.repeat(64), expiresAt } }), CONSTRAINT)
      await assert.rejects(db.session.create({ data: { userId: user.id, tokenHash: 'raw-token', expiresAt } }), CONSTRAINT)
      await assert.rejects(
        db.session.create({ data: { userId: user.id, tokenHash: 'c'.repeat(64), createdAt: new Date(), expiresAt: new Date(0) } }),
        CONSTRAINT,
      )
    })

    /* ── Phase 2B: tool ownership ─────────────────────────────────────── */

    await t.test('tool_owners requires a real tool and a real user', async () => {
      await insertTool(db, 'owned-tool')
      const user = await insertUser(db)
      await assert.rejects(db.toolOwner.create({ data: { toolId: 'no-such-tool', userId: user.id } }), CONSTRAINT)
      await assert.rejects(
        db.toolOwner.create({ data: { toolId: 'owned-tool', userId: '99999999-9999-4999-8999-999999999999' } }),
        CONSTRAINT,
      )
      await db.toolOwner.create({ data: { toolId: 'owned-tool', userId: user.id } })
      // Composite primary key: the same pair cannot be granted twice.
      await assert.rejects(db.toolOwner.create({ data: { toolId: 'owned-tool', userId: user.id } }), CONSTRAINT)
    })

    await t.test('ownership is removed with the user; the granter link is nulled, not cascaded', async () => {
      await insertTool(db, 'cascade-tool')
      const [owner, granter] = [await insertUser(db), await insertUser(db, 'ADMIN')]
      await db.toolOwner.create({ data: { toolId: 'cascade-tool', userId: owner.id, grantedByUserId: granter.id } })
      await db.user.delete({ where: { id: granter.id } })
      const row = await db.toolOwner.findUniqueOrThrow({ where: { toolId_userId: { toolId: 'cascade-tool', userId: owner.id } } })
      assert.equal(row.grantedByUserId, null)
      await db.user.delete({ where: { id: owner.id } })
      assert.equal(await db.toolOwner.count({ where: { toolId: 'cascade-tool' } }), 0)
      assert.ok(await db.tool.findUnique({ where: { id: 'cascade-tool' } }), 'the tool itself is untouched')
    })

    /* ── Phase 2B: submissions ↔ users ────────────────────────────────── */

    await t.test('a non-legacy submission must have a submitting user', async () => {
      await assert.rejects(
        db.submission.create({ data: { ...submissionData('55555555-5555-4555-8555-555555555555', 'REJECTED'), source: 'form' } }),
        /submissions_user_required|check constraint/i,
      )
    })

    await t.test('submission.user_id and reviewer_id must reference real users', async () => {
      await assert.rejects(
        db.submission.create({ data: submissionData('66666666-6666-4666-8666-666666666666', 'REJECTED', '99999999-9999-4999-8999-999999999999') }),
        CONSTRAINT,
      )
      const author = await insertUser(db)
      await assert.rejects(
        db.submission.create({
          data: { ...submissionData('77777777-7777-4777-8777-777777777777', 'REJECTED', author.id), reviewerId: '99999999-9999-4999-8999-999999999999' },
        }),
        CONSTRAINT,
      )
    })

    await t.test('a user with submissions, reviews or audit events cannot be deleted (RESTRICT)', async () => {
      const [author, reviewer, actor] = [await insertUser(db), await insertUser(db, 'ADMIN'), await insertUser(db, 'ADMIN')]
      const id = '88888888-8888-4888-8888-888888888888'
      await db.submission.create({ data: { ...submissionData(id, 'REJECTED', author.id), reviewerId: reviewer.id } })
      await db.submissionEvent.create({ data: { submissionId: id, actorType: 'ADMIN', actorUserId: actor.id, eventType: 'SUBMISSION_CREATED' } })

      for (const user of [author, reviewer, actor]) {
        await assert.rejects(db.user.delete({ where: { id: user.id } }), CONSTRAINT)
      }
      const stored = await db.submission.findUniqueOrThrow({ where: { id }, include: { user: true, reviewer: true } })
      assert.equal(stored.user?.id, author.id)
      assert.equal(stored.reviewer?.id, reviewer.id)
    })

    await t.test('event actor must match actor type, and must be a real user', async () => {
      const submissionId = '11111111-1111-4111-8111-111111111111'
      const admin = await insertUser(db, 'ADMIN')
      // OWNER/ADMIN events need an actor; SYSTEM events must not have one.
      await assert.rejects(
        db.submissionEvent.create({ data: { submissionId, actorType: 'ADMIN', eventType: 'SUBMISSION_CREATED' } }),
        /actor_matches_type|check constraint/i,
      )
      await assert.rejects(
        db.submissionEvent.create({ data: { submissionId, actorType: 'SYSTEM', actorUserId: admin.id, eventType: 'SUBMISSION_CREATED' } }),
        /actor_matches_type|check constraint/i,
      )
      await assert.rejects(
        db.submissionEvent.create({
          data: { submissionId, actorType: 'ADMIN', actorUserId: '99999999-9999-4999-8999-999999999999', eventType: 'SUBMISSION_CREATED' },
        }),
        CONSTRAINT,
      )
      const event = await db.submissionEvent.create({
        data: { submissionId, actorType: 'ADMIN', actorUserId: admin.id, eventType: 'SUBMISSION_CREATED' },
        include: { actor: true },
      })
      assert.equal(event.actor?.id, admin.id)
    })
  } finally {
    await drop()
  }
})
