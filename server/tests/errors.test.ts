/*
 * The error-to-wire mapping.
 *
 * toErrorResponse is pure, so every case is exercised directly — including the
 * ones that are hard to provoke through a real request, like an unexpected
 * throw from deep inside a future service. routes.test.ts covers the same
 * contract over an actual socket for the cases a client can reach.
 *
 * The property under test throughout: internal detail never crosses the
 * boundary.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ApiError,
  configError,
  internalError,
  invalidRequest,
  isApiError,
  notFound,
} from '../src/domain/errors.ts'
import { INTERNAL_MESSAGE, toErrorResponse } from '../src/http/errorHandler.ts'

await test('the response body always matches the documented contract', async (t) => {
  await t.test('every mapping produces { error: { code, message } }', () => {
    const cases: unknown[] = [
      invalidRequest('bad'),
      notFound('nope'),
      internalError('leaky detail'),
      configError('leaky detail'),
      new Error('unexpected'),
      'a bare string throw',
      undefined,
    ]

    for (const input of cases) {
      const { body } = toErrorResponse(input)
      assert.equal(typeof body.error, 'object')
      assert.equal(typeof body.error.code, 'string')
      assert.equal(typeof body.error.message, 'string')
      assert.ok(body.error.message.length > 0)
    }
  })
})

await test('client-safe errors keep their code, status and message', async (t) => {
  await t.test('INVALID_REQUEST', () => {
    const { status, body, unexpected } = toErrorResponse(invalidRequest('Body is not valid JSON.'))
    assert.equal(status, 400)
    assert.equal(body.error.code, 'INVALID_REQUEST')
    assert.equal(body.error.message, 'Body is not valid JSON.')
    assert.equal(unexpected, false)
  })

  await t.test('NOT_FOUND', () => {
    const { status, body } = toErrorResponse(notFound('No route matches GET /nope.'))
    assert.equal(status, 404)
    assert.equal(body.error.code, 'NOT_FOUND')
    assert.equal(body.error.message, 'No route matches GET /nope.')
  })

  await t.test('a status override is honoured', () => {
    const { status } = toErrorResponse(
      new ApiError('INVALID_REQUEST', 'too big', { status: 413 }),
    )
    assert.equal(status, 413)
  })

  await t.test('details are included when present', () => {
    const { body } = toErrorResponse(invalidRequest('bad', { path: 'message' }))
    assert.deepEqual(body.error.details, { path: 'message' })
  })

  await t.test('details are omitted entirely when empty', () => {
    const { body } = toErrorResponse(invalidRequest('bad'))
    assert.ok(!('details' in body.error))
  })
})

await test('internal detail never reaches the client', async (t) => {
  await t.test('an unexpected throw becomes a generic INTERNAL', () => {
    const { status, body, unexpected } = toErrorResponse(
      new Error('connect ECONNREFUSED 127.0.0.1:5432'),
    )
    assert.equal(status, 500)
    assert.equal(body.error.code, 'INTERNAL')
    assert.equal(body.error.message, INTERNAL_MESSAGE)
    assert.doesNotMatch(body.error.message, /ECONNREFUSED/)
    assert.equal(unexpected, true)
  })

  await t.test('an INTERNAL ApiError has its own message replaced', () => {
    const { body } = toErrorResponse(internalError('catalogue index rebuild failed at row 412'))
    assert.equal(body.error.message, INTERNAL_MESSAGE)
    assert.doesNotMatch(body.error.message, /row 412/)
  })

  await t.test('a CONFIG error is reported as INTERNAL, not as configuration', () => {
    const { body } = toErrorResponse(configError('CLIENT_ORIGIN contains "http://internal.corp"'))
    assert.equal(body.error.code, 'INTERNAL')
    assert.doesNotMatch(body.error.message, /internal\.corp/)
  })

  await t.test('a stack trace is never serialised into the body', () => {
    const error = new Error('boom')
    const { body } = toErrorResponse(error)
    assert.doesNotMatch(JSON.stringify(body), /at /)
    assert.doesNotMatch(JSON.stringify(body), /errors\.test/)
  })

  await t.test('a thrown non-Error does not crash the mapping', () => {
    for (const input of [undefined, null, 0, '', { code: 'oops' }, []]) {
      const { status, body } = toErrorResponse(input)
      assert.equal(status, 500)
      assert.equal(body.error.code, 'INTERNAL')
    }
  })
})

await test('body-parser failures are reported as client errors, not server faults', async (t) => {
  await t.test('a payload over the limit is 413 INVALID_REQUEST', () => {
    const { status, body, unexpected } = toErrorResponse({
      type: 'entity.too.large',
      status: 413,
    })
    assert.equal(status, 413)
    assert.equal(body.error.code, 'INVALID_REQUEST')
    assert.match(body.error.message, /32kb/)
    assert.equal(unexpected, false, 'a client sending a big body is not a server fault')
  })

  await t.test('unparseable JSON is 400 INVALID_REQUEST', () => {
    const { status, body } = toErrorResponse({ type: 'entity.parse.failed', status: 400 })
    assert.equal(status, 400)
    assert.equal(body.error.code, 'INVALID_REQUEST')
    assert.match(body.error.message, /not valid JSON/)
  })

  await t.test('an unsupported charset is 415', () => {
    assert.equal(toErrorResponse({ type: 'charset.unsupported' }).status, 415)
    assert.equal(toErrorResponse({ type: 'encoding.unsupported' }).status, 415)
  })

  await t.test('an unrecognised object still falls through to INTERNAL', () => {
    const { status, body } = toErrorResponse({ type: 'something.else' })
    assert.equal(status, 500)
    assert.equal(body.error.code, 'INTERNAL')
  })
})

await test('the error factories set the codes and statuses they claim', () => {
  assert.equal(invalidRequest('x').status, 400)
  assert.equal(notFound('x').status, 404)
  assert.equal(internalError('x').status, 500)
  assert.equal(configError('x').status, 500)
  assert.equal(configError('x').code, 'CONFIG')
  assert.ok(isApiError(invalidRequest('x')))
  assert.ok(!isApiError(new Error('x')))
})
