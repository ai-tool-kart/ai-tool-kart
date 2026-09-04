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
    assert.equal(warnings.length, 1)
    assert.match(warnings[0] as string, /CLIENT_ORIGIN is empty in production/)
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
    assert.equal(warnings.length, 1)
    assert.match(warnings[0] as string, /plain-http origin in production/)
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
      'logFormat',
      'logLevel',
    ])
  })
})
