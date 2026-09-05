/*
 * Environment loading.
 *
 * loadEnv() takes its source as an argument, so every case here is a plain
 * object — no test mutates process.env, and none can leak into another.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { describeEnv, loadEnv } from '../src/config/env.ts'
import { isApiError } from '../src/domain/errors.ts'
import { capturingLogger } from './helpers.ts'

function expectConfigError(source: NodeJS.ProcessEnv): Error {
  try {
    loadEnv(source)
  } catch (error) {
    assert.ok(isApiError(error), 'a configuration failure must be an ApiError')
    assert.equal(error.code, 'CONFIG')
    return error
  }
  assert.fail('expected loadEnv to throw')
}

test('an empty environment yields working development defaults', () => {
  const { env, warnings } = loadEnv({})

  assert.equal(env.environment, 'development')
  assert.equal(env.isProduction, false)
  assert.equal(env.http.host, '127.0.0.1')
  assert.equal(env.http.port, 3001)
  assert.deepEqual(env.cors.allowedOrigins, [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ])
  assert.equal(env.log.format, 'pretty')
  assert.equal(env.log.level, 'info')
  assert.deepEqual(warnings, [])
})

test('values are parsed into the domain shape, not passed through raw', () => {
  const { env } = loadEnv({
    NODE_ENV: 'production',
    PORT: '8080',
    HOST: '0.0.0.0',
    CLIENT_ORIGIN: 'https://aitoolkart.com',
    SERVER_LOG_FORMAT: 'json',
    SERVER_LOG_LEVEL: 'warn',
  })

  assert.equal(env.environment, 'production')
  assert.equal(env.isProduction, true)
  assert.equal(env.http.port, 8080)
  assert.equal(typeof env.http.port, 'number', 'PORT must be coerced, not left a string')
  assert.equal(env.http.host, '0.0.0.0')
  assert.deepEqual(env.cors.allowedOrigins, ['https://aitoolkart.com'])
  assert.equal(env.log.format, 'json')
  assert.equal(env.log.level, 'warn')
})

test('an empty variable is treated as unset, not as an empty string', () => {
  const { env } = loadEnv({ PORT: '', HOST: '  ', SERVER_LOG_LEVEL: '' })

  assert.equal(env.http.port, 3001)
  assert.equal(env.http.host, '127.0.0.1')
  assert.equal(env.log.level, 'info')
})

await test('a non-numeric PORT fails fast rather than silently binding the default', async (t) => {
  await t.test('rejects', () => {
    const error = expectConfigError({ PORT: 'not-a-port' })
    assert.match(error.message, /Invalid server environment/)
    assert.match(error.message, /PORT/)
  })

  await t.test('the message says what to do about it', () => {
    const error = expectConfigError({ PORT: 'not-a-port' })
    assert.match(error.message, /integer between 1 and 65535/)
    assert.match(error.message, /server\/\.env\.example/)
  })

  await t.test('an out-of-range port is rejected too', () => {
    for (const value of ['0', '70000', '-1', '3001.5']) {
      const error = expectConfigError({ PORT: value })
      assert.match(error.message, /PORT/, `PORT=${value} should be rejected`)
    }
  })
})

await test('CLIENT_ORIGIN is validated entry by entry', async (t) => {
  await t.test('a list is split, trimmed and de-duplicated', () => {
    const { env } = loadEnv({
      CLIENT_ORIGIN: ' http://localhost:5173 , https://aitoolkart.com,http://localhost:5173 ',
    })
    assert.deepEqual(env.cors.allowedOrigins, [
      'http://localhost:5173',
      'https://aitoolkart.com',
    ])
  })

  await t.test('an explicitly empty value disables CORS rather than failing', () => {
    const { env, warnings } = loadEnv({ CLIENT_ORIGIN: '' })
    assert.deepEqual(env.cors.allowedOrigins, [])
    assert.deepEqual(warnings, [], 'no warning outside production')
  })

  await t.test('absent falls back to the development defaults; empty does not', () => {
    assert.equal(loadEnv({}).env.cors.allowedOrigins.length, 2)
    assert.equal(loadEnv({ CLIENT_ORIGIN: '' }).env.cors.allowedOrigins.length, 0)
  })

  await t.test('an unparseable entry is rejected, never silently dropped', () => {
    const error = expectConfigError({ CLIENT_ORIGIN: 'not a url at all' })
    assert.match(error.message, /not a valid origin/)
  })

  await t.test('a bare host:port is rejected — it parses, but not as http', () => {
    // new URL('localhost:5173') succeeds with protocol "localhost:", so this
    // lands on the scheme check rather than the parse check. Either way it must
    // not reach the allowlist.
    const error = expectConfigError({ CLIENT_ORIGIN: 'localhost:5173' })
    assert.match(error.message, /must use http or https/)
  })

  await t.test('an origin carrying a path is rejected', () => {
    const error = expectConfigError({ CLIENT_ORIGIN: 'http://localhost:5173/app' })
    assert.match(error.message, /origin only/)
  })

  await t.test('a non-http scheme is rejected', () => {
    const error = expectConfigError({ CLIENT_ORIGIN: 'ftp://example.com' })
    assert.match(error.message, /must use http or https/)
  })
})

await test('unrecognised values for tolerant variables fall back and warn', async (t) => {
  await t.test('NODE_ENV', () => {
    const { env, warnings } = loadEnv({ NODE_ENV: 'staging' })
    assert.equal(env.environment, 'development')
    assert.equal(warnings.length, 1)
    assert.match(warnings[0] as string, /NODE_ENV="staging"/)
    assert.match(warnings[0] as string, /Falling back to "development"/)
  })

  await t.test('log format and level', () => {
    const { env, warnings } = loadEnv({
      SERVER_LOG_FORMAT: 'xml',
      SERVER_LOG_LEVEL: 'trace',
    })
    assert.equal(env.log.format, 'pretty')
    assert.equal(env.log.level, 'info')
    assert.equal(warnings.length, 2)
  })

  await t.test('the fallback is never silent', () => {
    const { warnings } = loadEnv({ NODE_ENV: 'staging' })
    assert.ok(warnings.length > 0, 'a tolerated value must still produce a warning')
  })
})

await test('production-only warnings', async (t) => {
  await t.test('explicitly disabled CORS in production is called out', () => {
    const { warnings } = loadEnv({ NODE_ENV: 'production', CLIENT_ORIGIN: '' })
    assert.ok(warnings.some((warning) => /CLIENT_ORIGIN is empty in production/.test(warning)))
  })

  await t.test('unset CORS in production warns that dev defaults are in use', () => {
    const { warnings } = loadEnv({ NODE_ENV: 'production' })
    assert.ok(
      warnings.some((warning) => /localhost development defaults/.test(warning)),
      'production must not silently allow localhost origins',
    )
  })

  await t.test('a plain-http origin in production is called out', () => {
    const { warnings } = loadEnv({
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'http://aitoolkart.com',
    })
    assert.ok(warnings.some((warning) => /plain-http origin in production/.test(warning)))
  })

  await t.test('neither fires outside production', () => {
    const { warnings } = loadEnv({ NODE_ENV: 'development', CLIENT_ORIGIN: 'http://x.test' })
    assert.deepEqual(warnings, [])
  })
})

await test('describeEnv reports shape, never raw values that could be secret', async (t) => {
  await t.test('reports the fields it does know', () => {
    const { env } = loadEnv({ PORT: '4000', HOST: '0.0.0.0', NODE_ENV: 'production' })
    const described = describeEnv(env)

    assert.equal(described.environment, 'production')
    assert.equal(described.address, '0.0.0.0:4000')
    assert.equal(described.logLevel, 'info')
  })

  await t.test('says "disabled" rather than printing an empty list', () => {
    const { env } = loadEnv({ CLIENT_ORIGIN: '' })
    assert.equal(describeEnv(env).corsOrigins, 'disabled')
  })

  await t.test('the serialised summary contains no unexpected keys', () => {
    const { env } = loadEnv({})
    assert.deepEqual(Object.keys(describeEnv(env)).sort(), [
      'address',
      'corsOrigins',
      'environment',
      'llmApiKey',
      'llmProvider',
      'logFormat',
      'logLevel',
    ])
  })

  await t.test('the API key is reported by presence, never by value', () => {
    const secret = 'sk-test-not-a-real-key-000111222'
    const { env } = loadEnv({ LLM_PROVIDER: 'some-vendor', LLM_API_KEY: secret })
    const described = describeEnv(env)

    assert.equal(described.llmApiKey, 'set')
    assert.equal(described.llmProvider, 'some-vendor')
    assert.equal(JSON.stringify(described).includes(secret), false)
  })

  await t.test('an absent key is reported as absent, not omitted', () => {
    // Omitting the field would make "no key configured" and "this build does not
    // report keys" look identical in a startup log.
    assert.equal(describeEnv(loadEnv({}).env).llmApiKey, 'absent')
  })
})

/* ─── Phase D — the LLM configuration ──────────────────────────────────────── */

await test('LLM configuration', async (t) => {
  await t.test('defaults to the offline mock with no configuration at all', () => {
    const { env, warnings } = loadEnv({})
    assert.equal(env.llm.provider, 'mock')
    assert.equal(env.llm.apiKey, undefined)
    assert.deepEqual(warnings, [], 'a bare environment must boot cleanly')
  })

  await t.test('the mock never requires a key', () => {
    const { warnings } = loadEnv({ LLM_PROVIDER: 'mock' })
    assert.equal(
      warnings.some((warning) => /LLM_API_KEY/.test(warning)),
      false,
    )
  })

  await t.test('a real provider without a key warns at boot, not on first request', () => {
    const { warnings } = loadEnv({ LLM_PROVIDER: 'some-vendor' })
    assert.ok(warnings.some((warning) => /LLM_API_KEY is not/.test(warning)))
  })

  await t.test('the mock in production is called out', () => {
    // It would otherwise serve deterministic offline plans from a server that
    // looks entirely healthy.
    const { warnings } = loadEnv({ NODE_ENV: 'production', LLM_PROVIDER: 'mock' })
    assert.ok(warnings.some((warning) => /"mock" in production/.test(warning)))
  })

  await t.test('an empty value means unset, not the empty string', () => {
    const { env } = loadEnv({ LLM_PROVIDER: '', LLM_API_KEY: '   ' })
    assert.equal(env.llm.provider, 'mock')
    assert.equal(env.llm.apiKey, undefined)
  })

  await t.test('a too-short key is rejected rather than accepted as a typo', () => {
    assert.throws(() => loadEnv({ LLM_API_KEY: 'abc' }), /LLM_API_KEY/)
  })

  await t.test('an out-of-range timeout fails to boot with a hint', () => {
    assert.throws(() => loadEnv({ LLM_TIMEOUT_MS: '10' }), /LLM_TIMEOUT_MS/)
    assert.throws(() => loadEnv({ LLM_TIMEOUT_MS: 'soon' }), /LLM_TIMEOUT_MS/)
  })

  await t.test('the key is registered for redaction the moment it is parsed', () => {
    const secret = 'sk-test-not-a-real-key-333444555'
    loadEnv({ LLM_API_KEY: secret })

    const captured = capturingLogger('debug', 'json')
    captured.logger.info('a line that should not carry it', { note: secret })
    assert.equal(captured.text().includes(secret), false)
  })
})
