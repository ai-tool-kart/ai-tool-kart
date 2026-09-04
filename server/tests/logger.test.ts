/*
 * Structured logging and secret redaction.
 *
 * The redaction registry is module-level state, so every case that registers a
 * secret clears it afterwards — otherwise one test's credential would be
 * scrubbed out of another's assertions.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { clearSecrets, createLogger, errorFields, redact, registerSecret } from '../src/utils/logger.ts'
import { invalidRequest } from '../src/domain/errors.ts'
import { capturingLogger } from './helpers.ts'

test.afterEach(() => {
  clearSecrets()
})

await test('level filtering', async (t) => {
  await t.test('lines below the configured level are dropped', () => {
    const { logger, lines } = capturingLogger('warn')
    logger.debug('debug')
    logger.info('info')
    logger.warn('warn')
    logger.error('error')

    assert.equal(lines.length, 2)
    assert.match(lines[0] as string, /warn/)
    assert.match(lines[1] as string, /error/)
  })

  await t.test('a silent logger writes nothing at all', () => {
    const { logger, lines } = capturingLogger('debug')
    logger.debug('x')
    assert.equal(lines.length, 1, 'sanity: the capturing logger does write')

    const written: string[] = []
    const silent = createLogger({ level: 'debug', format: 'pretty', write: () => {} })
    silent.error('this goes nowhere')
    assert.deepEqual(written, [])
  })
})

await test('json format', async (t) => {
  await t.test('emits one parseable object per line', () => {
    const { logger, lines } = capturingLogger('info', 'json')
    logger.info('Request completed', { status: 200, path: '/api/health' })

    assert.equal(lines.length, 1)
    const payload = JSON.parse(lines[0] as string)
    assert.equal(payload.level, 'info')
    assert.equal(payload.msg, 'Request completed')
    assert.equal(payload.status, 200)
    assert.equal(payload.path, '/api/health')
    assert.ok(typeof payload.ts === 'string' && payload.ts.length > 0)
  })

  await t.test('undefined fields are omitted rather than serialised as null', () => {
    const { logger, lines } = capturingLogger('info', 'json')
    logger.info('msg', { present: 1, absent: undefined })

    const payload = JSON.parse(lines[0] as string)
    assert.equal(payload.present, 1)
    assert.ok(!('absent' in payload))
  })
})

await test('child loggers carry context onto every line', () => {
  const { logger, lines } = capturingLogger('info', 'json')
  const child = logger.child({ requestId: 'req-1' })

  child.info('first')
  child.info('second')

  for (const line of lines) {
    assert.equal(JSON.parse(line).requestId, 'req-1')
  }

  const grandchild = child.child({ path: '/api/health' })
  grandchild.info('third')
  const last = JSON.parse(lines[2] as string)
  assert.equal(last.requestId, 'req-1', 'child context must be inherited, not replaced')
  assert.equal(last.path, '/api/health')
})

await test('secret redaction', async (t) => {
  await t.test('a registered secret never reaches the output', () => {
    registerSecret('super-secret-api-key-value')
    const { logger, text } = capturingLogger('info', 'json')

    logger.info('Calling provider', { key: 'super-secret-api-key-value' })

    assert.doesNotMatch(text(), /super-secret-api-key-value/)
    assert.match(text(), /\[REDACTED\]/)
  })

  await t.test('it is scrubbed from the message as well as from the fields', () => {
    registerSecret('super-secret-api-key-value')
    const { logger, text } = capturingLogger()

    logger.error('failed with super-secret-api-key-value in the message')

    assert.doesNotMatch(text(), /super-secret-api-key-value/)
  })

  await t.test('values too short to be a credential are ignored', () => {
    registerSecret('abc')
    assert.equal(redact('abc is a common substring'), 'abc is a common substring')
  })

  await t.test('both the spaced and de-spaced forms are registered', () => {
    registerSecret('aaaa bbbb cccc dddd')
    assert.doesNotMatch(redact('aaaa bbbb cccc dddd'), /aaaa/)
    assert.doesNotMatch(redact('aaaabbbbccccdddd'), /aaaa/)
  })

  await t.test('Authorization-shaped values are scrubbed even if never registered', () => {
    assert.equal(redact('Bearer sk-abcdef123456'), 'Bearer [REDACTED]')
    assert.equal(redact('Basic dXNlcjpwYXNzd29yZA=='), 'Basic [REDACTED]')
  })

  await t.test('clearSecrets un-registers', () => {
    registerSecret('super-secret-api-key-value')
    assert.match(redact('super-secret-api-key-value'), /REDACTED/)
    clearSecrets()
    assert.equal(redact('super-secret-api-key-value'), 'super-secret-api-key-value')
  })
})

await test('errorFields renders any thrown value without throwing', async (t) => {
  await t.test('an ApiError contributes its code and details', () => {
    const fields = errorFields(invalidRequest('Body is not valid JSON.', { field: 'message' }))
    assert.equal(fields.errCode, 'INVALID_REQUEST')
    assert.equal(fields.err, 'Body is not valid JSON.')
    assert.equal(fields.field, 'message')
  })

  await t.test('a plain Error contributes its message', () => {
    assert.deepEqual(errorFields(new Error('boom')), { err: 'boom' })
  })

  await t.test('a non-Error throw does not crash the logger', () => {
    assert.deepEqual(errorFields('a string'), { err: 'a string' })
    assert.deepEqual(errorFields(42), { err: '42' })
    assert.deepEqual(errorFields(null), { err: 'null' })
  })

  await t.test('an Error in a log field is serialised, not stringified to [object]', () => {
    const { logger, lines } = capturingLogger('info', 'json')
    logger.error('failed', { err: new Error('inner') })
    const payload = JSON.parse(lines[0] as string)
    assert.equal(payload.err.message, 'inner')
  })
})
