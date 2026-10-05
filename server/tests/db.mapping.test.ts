/*
 * JSON → PostgreSQL mapping (src/db/legacy/mapping.ts) and the database
 * target guard (src/db/target.ts).
 *
 * Pure — no database. The round trip runs over the REAL catalogue file, so a
 * field added to Tool without a column fails here rather than silently
 * vanishing on import.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCatalogue } from '../src/catalogue/schema.ts'
import {
  diffSubmissionRow,
  LegacySubmissionSchema,
  legacySubmissionToRow,
  rowToTool,
  toolsEqual,
  toolToRow,
  type LegacySubmission,
} from '../src/db/legacy/mapping.ts'
import { assertDatabaseTarget, describeDatabaseUrl } from '../src/db/target.ts'
import type { Tool as ToolRow } from '../src/generated/prisma/client.ts'

const catalogueFile = join(process.cwd(), 'src', 'catalogue', 'data', 'tools.json')
const tools = parseCatalogue(JSON.parse(readFileSync(catalogueFile, 'utf8')), { origin: catalogueFile })

/** What Postgres hands back for an inserted create-input: defaults filled in. */
function asStoredRow(tool: (typeof tools)[number]): ToolRow {
  const input = toolToRow(tool)
  return {
    ...input,
    plainLine: input.plainLine ?? null,
    addedAt: (input.addedAt as Date | null) ?? null,
    isMcpServer: input.isMcpServer ?? false,
    status: input.status ?? 'active',
    verified: input.verified ?? false,
    source: input.source ?? 'seed',
    tags: input.tags as string[],
    roles: input.roles as string[],
    useCases: input.useCases as string[],
    stages: input.stages as string[],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function legacy(overrides: Partial<LegacySubmission> = {}): LegacySubmission {
  return LegacySubmissionSchema.parse({
    id: '0b7f6a52-2f53-4f8e-9d8f-2a1d2c3b4e5f',
    status: 'pending',
    createdAt: '2026-09-20T10:15:00.000Z',
    siteUrl: 'https://www.Example.com/?utm_source=x',
    normalizedUrl: 'example.com',
    name: 'Example',
    tagline: 'A test tool',
    description: 'Does things.',
    category: 'Writing',
    pricingModel: 'Free',
    tags: ['a'],
    alternatives: [],
    faqs: [{ question: 'Q?', answer: 'A.' }],
    plan: 'free',
    launchWeekId: '2026-11-16',
    ...overrides,
  })
}

await test('tools: JSON → row → Tool is lossless for every catalogue record', () => {
  assert.equal(tools.length, 68)
  for (const tool of tools) {
    const back = rowToTool(asStoredRow(tool))
    assert.ok(toolsEqual(back, tool), `round trip changed "${tool.id}"`)
  }
})

await test('tools: ids, slugs and normalized URLs are preserved and unique', () => {
  const rows = tools.map((tool) => toolToRow(tool))
  assert.deepEqual(
    rows.map((row) => row.id),
    tools.map((tool) => tool.id),
  )
  assert.equal(new Set(rows.map((row) => row.normalizedUrl)).size, rows.length)
})

await test('tools: absent isMcpServer is stored false and read back as absent', () => {
  const plain = tools.find((tool) => tool.isMcpServer === undefined)
  assert.ok(plain)
  assert.equal(toolToRow(plain).isMcpServer, false)
  assert.equal('isMcpServer' in rowToTool(asStoredRow(plain)), false)
})

await test('submissions: status mapping', async (t) => {
  const noTool = () => undefined
  const hasTool = () => 'example'

  await t.test('pending → SUBMITTED, not linked', () => {
    const { row } = legacySubmissionToRow(legacy(), hasTool)
    assert.equal(row.status, 'SUBMITTED')
    assert.equal(row.toolId, null)
  })

  await t.test('approved with a catalogue tool → PUBLISHED and linked', () => {
    const { row, warnings } = legacySubmissionToRow(legacy({ status: 'approved' }), hasTool)
    assert.equal(row.status, 'PUBLISHED')
    assert.equal(row.toolId, 'example')
    assert.deepEqual(warnings, [])
  })

  await t.test('approved without a catalogue tool → APPROVED, unlinked, with a warning', () => {
    const { row, warnings } = legacySubmissionToRow(legacy({ status: 'approved' }), noTool)
    assert.equal(row.status, 'APPROVED')
    assert.equal(row.toolId, null)
    assert.equal(warnings.length, 1)
  })

  await t.test('rejected → REJECTED with reviewNote as rejection_reason', () => {
    const { row } = legacySubmissionToRow(legacy({ status: 'rejected', reviewNote: 'Not an AI tool' }), noTool)
    assert.equal(row.status, 'REJECTED')
    assert.equal(row.rejectionReason, 'Not an AI tool')
  })
})

await test('submissions: id and timestamps preserved; review times left unknown', () => {
  const { row, eventMetadata } = legacySubmissionToRow(legacy({ status: 'rejected' }), () => undefined)
  assert.equal(row.id, '0b7f6a52-2f53-4f8e-9d8f-2a1d2c3b4e5f')
  assert.equal((row.submittedAt as Date).toISOString(), '2026-09-20T10:15:00.000Z')
  assert.equal(row.reviewedAt, null)
  assert.equal(eventMetadata.reviewTimestampsUnknown, 'true')
  assert.equal(row.source, 'legacy_json')
  assert.equal(row.userId, null)
})

await test('submissions: submittedFromIp is dropped and recorded as dropped', () => {
  const { row, eventMetadata } = legacySubmissionToRow(legacy({ submittedFromIp: '203.0.113.9' }), () => undefined)
  assert.equal(JSON.stringify(row).includes('203.0.113.9'), false)
  assert.deepEqual(eventMetadata.droppedFields, ['submittedFromIp'])
})

await test('submissions: normalizedUrl is recomputed from siteUrl', () => {
  const { row, warnings } = legacySubmissionToRow(legacy({ normalizedUrl: 'stale-key' }), () => undefined)
  assert.equal(row.normalizedUrl, 'example.com')
  assert.equal(warnings.length, 1)
})

await test('submissions: an unexpected key fails validation instead of being dropped', () => {
  assert.equal(LegacySubmissionSchema.safeParse({ ...legacy(), status_override: 'x' }).success, false)
})

await test('submissions: diffSubmissionRow detects identical vs changed rows', () => {
  const { row } = legacySubmissionToRow(legacy(), () => undefined)
  const stored = { ...row, submittedAt: new Date(row.submittedAt as Date), updatedAt: new Date() }
  assert.deepEqual(diffSubmissionRow(row, stored), [])
  assert.deepEqual(diffSubmissionRow(row, { ...stored, name: 'Renamed' }), ['name'])
})

await test('target guard', async (t) => {
  await t.test('redacts passwords', () => {
    const target = describeDatabaseUrl('postgresql://app:s3cret@db.example.com:5432/prod')
    assert.equal(target.redacted.includes('s3cret'), false)
    assert.equal(target.host, 'db.example.com')
    assert.equal(target.database, 'prod')
  })

  await t.test('allows localhost', () => {
    assert.equal(assertDatabaseTarget('postgresql://me@localhost:5432/dev', undefined).isLocal, true)
    assert.equal(assertDatabaseTarget('postgresql://me@127.0.0.1/dev', undefined).isLocal, true)
  })

  await t.test('refuses a remote host by default, without leaking the password', () => {
    assert.throws(
      () => assertDatabaseTarget('postgresql://app:s3cret@db.railway.internal:5432/railway', undefined),
      (error: Error) => /Refusing/.test(error.message) && !error.message.includes('s3cret'),
    )
  })

  await t.test('allows a remote host only when its exact name is given', () => {
    const url = 'postgresql://app:pw@db.railway.internal:5432/railway'
    assert.throws(() => assertDatabaseTarget(url, 'other.host'))
    assert.equal(assertDatabaseTarget(url, 'db.railway.internal').isLocal, false)
  })

  await t.test('refuses a missing URL', () => {
    assert.throws(() => assertDatabaseTarget(undefined, undefined), /not set/)
  })
})
