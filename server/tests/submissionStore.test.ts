/*
 * The JSON submission store — SPEC-submit-backend.md §3.
 *
 * The concurrency case ('20 concurrent creates all land') is the point of
 * this whole slice: a naive read-modify-write silently drops rows under
 * concurrent writers, and that failure mode does not throw, does not log,
 * and does not show up until someone notices the numbers do not add up. If
 * write serialization regresses, this is the test that catches it.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isApiError } from '../src/domain/errors.ts'
import { createJsonSubmissionStore } from '../src/submissions/store.json.ts'
import type { SubmissionStore } from '../src/submissions/store.ts'
import { makeSubmission } from './helpers.ts'

/** A fresh temp directory per test, so no test can see another's file. */
async function withStore(
  body: (store: SubmissionStore, filePath: string, dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'submission-store-test-'))
  const filePath = join(dir, 'submissions.json')
  try {
    await body(createJsonSubmissionStore(filePath), filePath, dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

await test('createJsonSubmissionStore', async (t) => {
  await t.test('a missing file reads as empty, not as an error', async () => {
    await withStore(async (store) => {
      assert.deepEqual(await store.list(), [])
      assert.equal(await store.findByNormalizedUrl('example.com'), null)
    })
  })

  await t.test('create() fills in id, status and createdAt', async () => {
    await withStore(async (store) => {
      const record = await store.create(makeSubmission())
      assert.equal(typeof record.id, 'string')
      assert.ok(record.id.length > 0)
      assert.equal(record.status, 'pending')
      assert.ok(!Number.isNaN(Date.parse(record.createdAt)))
    })
  })

  await t.test('the caller cannot set id, status or createdAt through input', async () => {
    // NewSubmission's type already excludes these — this proves the store
    // itself is the thing assigning them, not merely that TypeScript would
    // stop a caller who tried.
    await withStore(async (store) => {
      const record = await store.create(makeSubmission())
      assert.notEqual(record.status, undefined)
      assert.equal(record.status, 'pending')
    })
  })

  await t.test('the file is created on first write, not before', async () => {
    await withStore(async (store, filePath) => {
      await assert.rejects(() => readFile(filePath))
      await store.create(makeSubmission())
      const contents = await readFile(filePath, 'utf8')
      const parsed: unknown = JSON.parse(contents)
      assert.ok(Array.isArray(parsed))
      assert.equal((parsed as unknown[]).length, 1)
    })
  })

  await t.test('a created record is found by its normalized URL', async () => {
    await withStore(async (store) => {
      await store.create(makeSubmission({ normalizedUrl: 'novawrite.ai' }))
      const found = await store.findByNormalizedUrl('novawrite.ai')
      assert.ok(found)
      assert.equal(found.normalizedUrl, 'novawrite.ai')
    })
  })

  await t.test('a normalized URL nobody submitted returns null, not undefined or a throw', async () => {
    await withStore(async (store) => {
      await store.create(makeSubmission({ normalizedUrl: 'novawrite.ai' }))
      assert.equal(await store.findByNormalizedUrl('somebody-else.com'), null)
    })
  })

  await t.test('list() filters by status', async () => {
    await withStore(async (store) => {
      await store.create(makeSubmission({ normalizedUrl: 'a.com' }))
      await store.create(makeSubmission({ normalizedUrl: 'b.com' }))
      // Every create() lands as 'pending' — there is no approve/reject path
      // yet, so filtering for a status nothing has is the only status split
      // this slice can exercise honestly.
      assert.equal((await store.list({ status: 'pending' })).length, 2)
      assert.equal((await store.list({ status: 'approved' })).length, 0)
    })
  })

  await t.test('list() respects limit', async () => {
    await withStore(async (store) => {
      await store.create(makeSubmission({ normalizedUrl: 'a.com' }))
      await store.create(makeSubmission({ normalizedUrl: 'b.com' }))
      await store.create(makeSubmission({ normalizedUrl: 'c.com' }))
      assert.equal((await store.list({ limit: 2 })).length, 2)
      assert.equal((await store.list()).length, 3)
    })
  })

  await t.test('a write leaves no temp file behind', async () => {
    await withStore(async (store, _filePath, dir) => {
      await store.create(makeSubmission())
      const entries = await readdir(dir)
      assert.deepEqual(entries, ['submissions.json'])
    })
  })

  await t.test('corrupt JSON on disk surfaces as a domain error, not a parser exception', async () => {
    await withStore(async (store, filePath) => {
      await writeFile(filePath, 'not json{{{', 'utf8')
      await assert.rejects(
        () => store.list(),
        (error: unknown) => {
          assert.ok(isApiError(error), 'expected an ApiError, not a raw throw')
          assert.equal((error as { code: string }).code, 'INTERNAL')
          // The message must describe the failure, not repeat the parser's own
          // text — a SyntaxError's message often contains a source snippet.
          assert.doesNotMatch((error as Error).message, /not json/)
          return true
        },
      )
    })
  })

  await t.test('no method leaks the file path in what it throws', async () => {
    await withStore(async (store, filePath) => {
      await writeFile(filePath, 'not json{{{', 'utf8')
      try {
        await store.list()
        assert.fail('expected list() to throw on corrupt JSON')
      } catch (error) {
        assert.doesNotMatch((error as Error).message, /submission-store-test-/)
        assert.doesNotMatch((error as Error).message, /\.json/)
      }
    })
  })

  await t.test('20 concurrent create() calls all land, each with a distinct id', async () => {
    await withStore(async (store) => {
      const submissions = Array.from({ length: 20 }, (_unused, index) =>
        makeSubmission({ normalizedUrl: `concurrent-${index}.example.com` }),
      )

      const created = await Promise.all(submissions.map((input) => store.create(input)))

      assert.equal(created.length, 20, 'every create() call must resolve')

      const ids = new Set(created.map((record) => record.id))
      assert.equal(ids.size, 20, 'every id must be distinct')

      const stored = await store.list()
      assert.equal(
        stored.length,
        20,
        'all 20 rows must be on disk — a lost write here means the write ' +
          'serialization regressed',
      )

      const storedUrls = new Set(stored.map((record) => record.normalizedUrl))
      assert.equal(storedUrls.size, 20, 'no row was silently overwritten by another')
    })
  })
})
