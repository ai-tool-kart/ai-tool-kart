/*
 * The Phase 6 migration against a database that already holds Phase 2A/2B
 * data — the situation in every real environment. Applies the earlier
 * migrations, writes rows the way production has them, applies Phase 6, and
 * checks nothing existing changed and the new rules hold.
 *
 * Local database only (dbHarness.ts dbSkipReason); its own schema, dropped after.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { dbSkipReason } from './dbHarness.ts'

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations')
const PHASE_6 = '20261007120000_phase_6_admin_moderation'

await test('phase 6 migration over existing data', { skip: dbSkipReason }, async (t) => {
  const schema = `test_${randomBytes(6).toString('hex')}`
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
  await client.connect()
  try {
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}"`)
    const dirs = (await readdir(MIGRATIONS_DIR, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    assert.ok(dirs.includes(PHASE_6))
    const earlier = dirs.filter((dir) => dir < PHASE_6)
    for (const dir of earlier) await client.query(await readFile(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'))

    // Production-shaped rows: a seed tool, a user, a submission with its creation event.
    await client.query(`INSERT INTO tools (id, slug, name, mono, cat, model, tagline, rating, reviews, price, trend, badge, tags, pop, api, ctx, team, trial, integr, url, normalized_url, summary, roles, use_cases, stages, pricing_tier, updated_at)
      VALUES ('claude','claude','Claude','Cl','Writing','Freemium','t',4.8,10,'p','','',ARRAY['a'],90,'—','—','—','—','—','https://claude.ai','claude.ai','s',ARRAY['Writer'],ARRAY['Draft an article'],ARRAY['draft'],'freemium',now())`)
    await client.query(`INSERT INTO users (id, email, password_hash, role, updated_at) VALUES ('11111111-1111-4111-8111-111111111111','smoke@example.com','scrypt$x','USER',now())`)
    await client.query(`INSERT INTO submissions (id, user_id, site_url, normalized_url, name, tagline, description, category, pricing_model, tags, alternatives, launch_week_id, updated_at)
      VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','https://smoke.example.com','smoke.example.com','Smoke','t','d','Writing','Free','{}','{}','2026-11-16',now())`)
    await client.query(`INSERT INTO submission_events (id, submission_id, actor_user_id, actor_type, event_type, to_status)
      VALUES ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','OWNER','SUBMISSION_CREATED','SUBMITTED')`)
    const snapshot = async () =>
      (await client.query(`SELECT
        (SELECT row_to_json(t) FROM tools t) AS tool,
        (SELECT row_to_json(u) FROM users u) AS "user",
        (SELECT row_to_json(s) FROM submissions s) AS submission,
        (SELECT row_to_json(e) FROM submission_events e) AS event`)).rows[0]
    const before = await snapshot()

    await client.query(await readFile(join(MIGRATIONS_DIR, PHASE_6, 'migration.sql'), 'utf8'))

    await t.test('existing rows are byte-for-byte unchanged', async () => {
      assert.deepEqual(await snapshot(), before)
    })

    await t.test('the earlier append-only trigger still protects submission_events', async () => {
      await assert.rejects(client.query(`DELETE FROM submission_events`), /append-only/)
    })

    await t.test('the new event types are usable', async () => {
      for (const type of ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'NOTE_ADDED']) {
        await client.query(
          `INSERT INTO submission_events (id, submission_id, actor_user_id, actor_type, event_type) VALUES (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'ADMIN', $1)`,
          [type],
        )
      }
    })

    await t.test('admin_audit_events: requires a target, an object, an existing actor; append-only', async () => {
      const actor = '11111111-1111-4111-8111-111111111111'
      await assert.rejects(client.query(`INSERT INTO admin_audit_events (id, actor_user_id, action) VALUES (gen_random_uuid(), $1, 'TOOL_UPDATED')`, [actor]), /has_target/)
      await assert.rejects(
        client.query(`INSERT INTO admin_audit_events (id, actor_user_id, action, target_tool_id, metadata) VALUES (gen_random_uuid(), $1, 'TOOL_UPDATED', 'claude', '[]')`, [actor]),
        /metadata_is_object/,
      )
      await assert.rejects(
        client.query(`INSERT INTO admin_audit_events (id, actor_user_id, action, target_tool_id) VALUES (gen_random_uuid(), gen_random_uuid(), 'TOOL_UPDATED', 'claude')`),
        /foreign key/,
      )
      await client.query(`INSERT INTO admin_audit_events (id, actor_user_id, action, target_tool_id) VALUES (gen_random_uuid(), $1, 'TOOL_UPDATED', 'claude')`, [actor])
      await assert.rejects(client.query(`UPDATE admin_audit_events SET metadata = '{}'`), /append-only/)
      await assert.rejects(client.query(`DELETE FROM admin_audit_events`), /append-only/)
      await assert.rejects(client.query(`TRUNCATE admin_audit_events`), /append-only/)
      // An audited tool or user cannot be deleted out from under its history.
      await assert.rejects(client.query(`DELETE FROM tools WHERE id = 'claude'`), /foreign key/)
    })
  } finally {
    await client.query(`SET search_path TO public`).catch(() => {})
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await client.end()
  }
})
