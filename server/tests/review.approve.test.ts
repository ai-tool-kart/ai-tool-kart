/*
 * review/approve.ts — the idempotent order: confirm pending, check the
 * catalogue by normalized URL, create only if absent, update status.
 *
 * Both the catalogue and the submission store are real, temp-file-backed
 * instances here, not fixtures held only in memory — the whole point of
 * "approving twice gives exactly one catalogue entry" is that it survives a
 * write actually landing on disk between the two calls.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonToolCatalogue } from '../src/catalogue/json.ts'
import type { ToolCatalogueRepository } from '../src/catalogue/repository.ts'
import { approveSubmission } from '../src/review/approve.ts'
import type { ReviewedFields } from '../src/review/buildTool.ts'
import { createJsonSubmissionStore } from '../src/submissions/store.json.ts'
import type { SubmissionStore } from '../src/submissions/store.ts'
import { makeSubmission } from './helpers.ts'

const FIELDS: ReviewedFields = {
  mono: 'Fx',
  slug: 'fixture-tool',
  price: '—',
  pop: 40,
  roles: ['Developer'],
  stages: ['build'],
  useCases: ['Draft an article'],
  tags: ['writing'],
  summary: 'A fixture tool used to exercise the approve orchestration in tests, well past the forty-character floor.',
}

async function withFixture(
  body: (ctx: { catalogue: ToolCatalogueRepository; store: SubmissionStore }) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'review-approve-test-'))
  try {
    const catalogueFile = join(dir, 'catalogue-fixture.json')
    await writeFile(catalogueFile, '[]', 'utf8')
    const catalogue = createJsonToolCatalogue({ path: catalogueFile })
    const store = createJsonSubmissionStore(join(dir, 'submissions-fixture.json'))
    await body({ catalogue, store })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

await test('approveSubmission', async (t) => {
  await t.test('a pending submission is created in the catalogue and marked approved', async () => {
    await withFixture(async ({ catalogue, store }) => {
      const submission = await store.create(makeSubmission())
      const result = await approveSubmission({
        submission,
        fields: FIELDS,
        catalogue,
        store,
        today: '2026-09-21',
      })

      assert.equal(result.created, true)
      assert.equal(result.dryRun, false)
      assert.equal(result.submission.status, 'approved')
      assert.equal(result.tool.slug, 'fixture-tool')

      const found = await catalogue.findBySlug('fixture-tool')
      assert.ok(found, 'the tool must actually be in the catalogue')
    })
  })

  await t.test('approving the same submission twice gives exactly one catalogue entry', async () => {
    await withFixture(async ({ catalogue, store }) => {
      const submission = await store.create(makeSubmission())

      await approveSubmission({ submission, fields: FIELDS, catalogue, store, today: '2026-09-21' })

      // Re-running against the ALREADY-approved submission would normally be
      // rejected by the pending check — this simulates the real recovery
      // case instead: the submission's status update never landed (crash),
      // so it is still 'pending' on disk, but the catalogue write from the
      // first run already succeeded.
      const stillPending = { ...submission }
      const secondRun = await approveSubmission({
        submission: stillPending,
        fields: FIELDS,
        catalogue,
        store,
        today: '2026-09-21',
      })

      assert.equal(secondRun.created, false, 'the second run must not create a duplicate')

      const page = await catalogue.search({ status: 'all', limit: 100 })
      const matches = page.items.filter((tool) => tool.slug === 'fixture-tool')
      assert.equal(matches.length, 1, 'exactly one catalogue entry for this submission')
    })
  })

  await t.test('rejects a submission that is not pending', async () => {
    await withFixture(async ({ catalogue, store }) => {
      const submission = await store.create(makeSubmission())
      await store.updateStatus(submission.id, 'rejected')
      const alreadyRejected = await store.list().then((all) => all[0])
      assert.ok(alreadyRejected)

      await assert.rejects(() =>
        approveSubmission({ submission: alreadyRejected, fields: FIELDS, catalogue, store, today: '2026-09-21' }),
      )
    })
  })

  await t.test('--dry-run writes nothing to either the catalogue or the store', async () => {
    await withFixture(async ({ catalogue, store }) => {
      const submission = await store.create(makeSubmission())
      const result = await approveSubmission({
        submission,
        fields: FIELDS,
        catalogue,
        store,
        today: '2026-09-21',
        dryRun: true,
      })

      assert.equal(result.dryRun, true)
      assert.equal(result.tool.slug, 'fixture-tool')

      assert.equal(await catalogue.findBySlug('fixture-tool'), undefined, 'dry-run must not write to the catalogue')

      const stillPending = await store.list({ status: 'pending' })
      assert.equal(stillPending.length, 1, 'dry-run must not touch the submission status')
    })
  })
})
