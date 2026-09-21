/*
 * POST /api/submissions — SPEC-submit-backend.md §7, over a real socket.
 *
 * Response bodies use the server's ONE error contract, { error: { code,
 * message, fields? } } — the same shape every other route produces via
 * next(error) and the shared errorHandler. An earlier version of this route
 * wrote its own flatter, string-coded bodies directly; that was reverted
 * (see domain/errors.ts's VALIDATION_FAILED/DUPLICATE_URL codes and their
 * header comment) because a per-route exception to the single-errorHandler
 * contract was a mistake, not a feature. `fields` is the one real addition:
 * an optional per-input message map, present only on VALIDATION_FAILED,
 * documented as an extension in ASSISTANT_ARCHITECTURE_PLAN.md §13.
 *
 * Each case gets its own isolated temp-file store, the same way
 * submissionStore.test.ts does, so no test's data can affect another's
 * duplicate check.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { INTERNAL_MESSAGE } from '../src/http/errorHandler.ts'
import type { Tool } from '../src/domain/types.ts'
import { createJsonSubmissionStore } from '../src/submissions/store.json.ts'
import type { SubmissionStore } from '../src/submissions/store.ts'
import {
  capturingLogger,
  fixtureCatalogue,
  makeSubmissionPayload,
  makeTool,
  readJson,
  testContainer,
  withServer,
} from './helpers.ts'

interface CreatedResponse {
  id: string
  status: string
  createdAt: string
}
interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
    fields?: Record<string, string>
  }
}

async function withTempStore<T>(body: (store: SubmissionStore, filePath: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'submissions-route-test-'))
  const filePath = join(dir, 'submissions.json')
  try {
    return await body(createJsonSubmissionStore(filePath), filePath)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** A running server over an isolated store and a fixture catalogue. */
async function withSubmissionsServer(
  body: (ctx: { origin: string; store: SubmissionStore }) => Promise<void>,
  options: { tools?: Tool[] } = {},
): Promise<void> {
  await withTempStore(async (store) => {
    // makeTool()'s own default url is 'https://example.com' — the same
    // default makeSubmissionPayload() uses — so the default fixture here
    // deliberately uses a DIFFERENT url. Sharing one would make every test
    // that submits the default payload collide with the catalogue by
    // accident, rather than by the thing it is actually testing.
    const catalogue = fixtureCatalogue(
      options.tools ?? [makeTool({ url: 'https://unrelated-catalogue-tool.example' })],
    )
    const container = testContainer(undefined, undefined, catalogue, undefined, undefined, undefined, store)
    await withServer(container, (server) => body({ origin: server.origin, store }))
  })
}

function postSubmission(origin: string, payload: unknown): Promise<Response> {
  return fetch(`${origin}/api/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

await test('POST /api/submissions', async (t) => {
  await t.test('201 — a valid, new submission is created', async () => {
    await withSubmissionsServer(async ({ origin, store }) => {
      const response = await postSubmission(origin, makeSubmissionPayload())
      assert.equal(response.status, 201)

      const body = await readJson<CreatedResponse>(response)
      assert.deepEqual(Object.keys(body).sort(), ['createdAt', 'id', 'status'])
      assert.equal(typeof body.id, 'string')
      assert.ok(body.id.length > 0)
      assert.equal(body.status, 'pending')
      assert.ok(!Number.isNaN(Date.parse(body.createdAt)))

      // It is actually in the store, not just echoed back.
      const stored = await store.list()
      assert.equal(stored.length, 1)
      assert.equal(stored[0]?.id, body.id)
    })
  })

  await t.test('400 — VALIDATION_FAILED, fields keyed by the client’s own field names', async () => {
    await withSubmissionsServer(async ({ origin }) => {
      const payload = makeSubmissionPayload()
      delete payload.name
      delete payload.tagline

      const response = await postSubmission(origin, payload)
      assert.equal(response.status, 400)

      const body = await readJson<ErrorResponse>(response)
      assert.equal(body.error.code, 'VALIDATION_FAILED')
      assert.equal(typeof body.error.message, 'string')
      assert.ok(body.error.message.length > 0)
      assert.equal(typeof body.error.fields?.name, 'string')
      assert.equal(typeof body.error.fields?.tagline, 'string')
      assert.ok((body.error.fields?.name ?? '').length > 0)
      // No `details` on this one — `fields` already carries everything
      // relevant, and an empty details object should not appear either.
      assert.equal(body.error.details, undefined)
    })
  })

  await t.test('400 — a length cap exceeded by one (tagline)', async () => {
    await withSubmissionsServer(async ({ origin }) => {
      const response = await postSubmission(
        origin,
        makeSubmissionPayload({ tagline: 'a'.repeat(81) }),
      )
      assert.equal(response.status, 400)
      const body = await readJson<ErrorResponse>(response)
      assert.equal(body.error.code, 'VALIDATION_FAILED')
      assert.match(body.error.fields?.tagline ?? '', /80 characters or fewer/)
    })
  })

  await t.test('400 — an invalid category', async () => {
    await withSubmissionsServer(async ({ origin }) => {
      const response = await postSubmission(
        origin,
        makeSubmissionPayload({ category: 'notarealcategory' }),
      )
      assert.equal(response.status, 400)
      const body = await readJson<ErrorResponse>(response)
      assert.equal(body.error.code, 'VALIDATION_FAILED')
      assert.equal(body.error.fields?.category, 'Choose a category from the list.')
    })
  })

  await t.test('400 — an unparseable siteUrl', async () => {
    await withSubmissionsServer(async ({ origin }) => {
      const response = await postSubmission(origin, makeSubmissionPayload({ siteUrl: 'asdf' }))
      assert.equal(response.status, 400)
      const body = await readJson<ErrorResponse>(response)
      assert.equal(body.error.code, 'VALIDATION_FAILED')
      assert.match(body.error.fields?.siteUrl ?? '', /valid website address/)
    })
  })

  await t.test('400 — "status":"approved" is rejected by .strict()', async () => {
    // The case that matters most: §11 is explicit that if a client could set
    // status, anyone could self-approve straight into the live catalogue.
    await withSubmissionsServer(async ({ origin, store }) => {
      const response = await postSubmission(
        origin,
        makeSubmissionPayload({ status: 'approved' }),
      )
      assert.equal(response.status, 400)
      const body = await readJson<ErrorResponse>(response)
      assert.equal(body.error.code, 'VALIDATION_FAILED')
      // Nothing must have been created.
      assert.equal((await store.list()).length, 0)
    })
  })

  await t.test('409 — the same site submitted twice', async () => {
    await withSubmissionsServer(async ({ origin, store }) => {
      const payload = makeSubmissionPayload({ siteUrl: 'https://novawrite.ai' })

      const first = await postSubmission(origin, payload)
      assert.equal(first.status, 201)

      const second = await postSubmission(origin, payload)
      assert.equal(second.status, 409)
      const body = await readJson<ErrorResponse>(second)
      assert.equal(body.error.code, 'DUPLICATE_URL')
      assert.equal(body.error.message, 'That site has already been submitted.')

      // Only the first landed.
      assert.equal((await store.list()).length, 1)
    })
  })

  await t.test('409 — the same site submitted as https://WWW.Example.com/?utm_source=x', async () => {
    await withSubmissionsServer(async ({ origin, store }) => {
      const first = await postSubmission(
        origin,
        makeSubmissionPayload({ siteUrl: 'https://example.com' }),
      )
      assert.equal(first.status, 201)

      const second = await postSubmission(
        origin,
        makeSubmissionPayload({ siteUrl: 'https://WWW.Example.com/?utm_source=x' }),
      )
      assert.equal(second.status, 409)
      const body = await readJson<ErrorResponse>(second)
      assert.equal(body.error.code, 'DUPLICATE_URL')
      assert.equal(body.error.message, 'That site has already been submitted.')

      assert.equal((await store.list()).length, 1)
    })
  })

  await t.test('409 — a site already in the live catalogue', async () => {
    await withSubmissionsServer(
      async ({ origin, store }) => {
        const response = await postSubmission(
          origin,
          makeSubmissionPayload({ siteUrl: 'https://existing-tool.example.com/' }),
        )
        assert.equal(response.status, 409)
        const body = await readJson<ErrorResponse>(response)
        assert.equal(body.error.code, 'DUPLICATE_URL')
        assert.equal(body.error.message, 'That site has already been submitted.')
        // A catalogue-side duplicate must not create a submission row either.
        assert.equal((await store.list()).length, 0)
      },
      { tools: [makeTool({ url: 'https://existing-tool.example.com' })] },
    )
  })

  await t.test('500 — a store failure is logged and returns no internals', async () => {
    await withTempStore(async (store, filePath) => {
      // Corrupts the store's own file directly, before the server ever
      // touches it, so the first read inside service.submit() throws.
      await writeFile(filePath, 'not json{{{', 'utf8')

      const catalogue = fixtureCatalogue([makeTool()])
      const captured = capturingLogger('debug', 'json')
      const container = testContainer(
        undefined,
        captured.logger,
        catalogue,
        undefined,
        undefined,
        undefined,
        store,
      )

      await withServer(container, async ({ origin }) => {
        const response = await postSubmission(origin, makeSubmissionPayload())
        assert.equal(response.status, 500)

        const body = await readJson<ErrorResponse>(response)
        assert.deepEqual(body, { error: { code: 'INTERNAL', message: INTERNAL_MESSAGE } })
      })

      // Logged server-side, via the shared errorHandler like any other
      // unexpected throw...
      assert.match(captured.text(), /Unhandled request failure/)
      // ...but the corrupt-JSON detail never reached the client.
      assert.doesNotMatch(captured.text(), /not json/)
    })
  })
})
