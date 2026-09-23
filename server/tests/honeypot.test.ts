/*
 * honeypot — SPEC-submit-backend.md §9. Unit-level, against hand-built
 * req/res/next, the same shape rateLimit.test.ts uses for its middleware —
 * no HTTP server needed to prove what this function decides.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type { NextFunction, Request, Response } from 'express'
import { honeypot } from '../src/http/middleware/honeypot.ts'

interface Call {
  nextCalled: boolean
  status: number | undefined
  body: unknown
}

function callHoneypot(body: unknown): Call {
  const call: Call = { nextCalled: false, status: undefined, body: undefined }
  const req = { body } as unknown as Request
  const res = {
    status(code: number) {
      call.status = code
      return this
    },
    json(payload: unknown) {
      call.body = payload
      return this
    },
  } as unknown as Response
  const next: NextFunction = (() => {
    call.nextCalled = true
  }) as NextFunction

  honeypot(req, res, next)
  return call
}

await test('honeypot', async (t) => {
  await t.test('untripped: absent, empty, whitespace-only, or non-string `company` calls next() and writes nothing', () => {
    for (const body of [
      {},
      { company: '' },
      { company: '   ' },
      { company: 42 },
      { company: null },
      undefined,
      null,
      'not an object',
    ]) {
      const call = callHoneypot(body)
      assert.equal(call.nextCalled, true, `expected next() for body ${JSON.stringify(body)}`)
      assert.equal(call.status, undefined)
      assert.equal(call.body, undefined)
    }
  })

  await t.test('tripped: a filled `company` answers 201 with a fresh id/status/createdAt, and never calls next()', () => {
    const call = callHoneypot({ company: 'Acme Bots Inc', siteUrl: 'not even a url' })
    assert.equal(call.nextCalled, false)
    assert.equal(call.status, 201)

    const body = call.body as { id: string; status: string; createdAt: string }
    assert.deepEqual(Object.keys(body).sort(), ['createdAt', 'id', 'status'])
    assert.equal(typeof body.id, 'string')
    assert.ok(body.id.length > 0)
    assert.equal(body.status, 'pending')
    assert.ok(!Number.isNaN(Date.parse(body.createdAt)))
  })

  await t.test('tripped: two calls generate two different ids', () => {
    const first = callHoneypot({ company: 'x' }).body as { id: string }
    const second = callHoneypot({ company: 'x' }).body as { id: string }
    assert.notEqual(first.id, second.id)
  })
})
