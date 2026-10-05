/*
 * Database-level guarantees the migration adds by hand (Prisma's schema
 * language can't express them): the append-only audit trail and the
 * one-live-submission-per-URL index.
 *
 * Needs a real Postgres. Runs only when TEST_DATABASE_URL is set and points
 * at a LOCAL database — it truncates the tables it touches. Skipped
 * otherwise, so `npm test` keeps working on a machine without Postgres.
 *
 *   TEST_DATABASE_URL=postgresql://$USER@localhost:5432/aitoolkart_test npm test
 *
 * The test database is migrated with: DATABASE_URL=<same> npm run db:deploy
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createDatabase } from '../src/db/client.ts'
import { describeDatabaseUrl } from '../src/db/target.ts'

const url = process.env.TEST_DATABASE_URL
const skip = !url
  ? 'TEST_DATABASE_URL not set'
  : !describeDatabaseUrl(url).isLocal
    ? 'TEST_DATABASE_URL is not local; refusing to truncate it'
    : false

function submissionData(id: string, status: 'SUBMITTED' | 'REJECTED' = 'SUBMITTED') {
  return {
    id,
    status,
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

await test('database constraints', { skip }, async (t) => {
  const db = createDatabase(url as string)
  // Events can't be deleted (that's the point), so the fixture tables are
  // reset with TRUNCATE ... CASCADE under a session that disables the
  // statement trigger — test database only.
  const reset = async () => {
    await db.$executeRawUnsafe('ALTER TABLE submission_events DISABLE TRIGGER submission_events_no_truncate')
    await db.$executeRawUnsafe('TRUNCATE submission_events, submissions, tools, data_import_runs CASCADE')
    await db.$executeRawUnsafe('ALTER TABLE submission_events ENABLE TRIGGER submission_events_no_truncate')
  }

  try {
    await reset()

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
  } finally {
    await reset()
    await db.$disconnect()
  }
})
