/*
 * HTTP behaviour, over a real socket.
 *
 * The app is bound to an ephemeral loopback port and driven with global fetch —
 * no supertest, matching the repository's low-dependency posture. "Offline"
 * means no public network; 127.0.0.1 is the system under test, not a dependency.
 *
 * errors.test.ts proves the error mapping exhaustively as a pure function.
 * These cases prove the wiring: that the mapping is actually reached, with the
 * right status, for the failures a client can really cause.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type { ErrorBody } from '../src/http/errorHandler.ts'
import { INTERNAL_MESSAGE } from '../src/http/errorHandler.ts'
import { REQUEST_ID_HEADER } from '../src/http/requestLogger.ts'
import type { HealthResponse } from '../src/http/routes/health.ts'
import { capturingLogger, readJson, testContainer, testEnv, withServer } from './helpers.ts'

/** One parsed log line. Fields vary by call site, so values stay unknown. */
type LogLine = Record<string, unknown>

function parseLines(lines: string[]): LogLine[] {
  return lines.map((line) => JSON.parse(line) as LogLine)
}

await test('GET /api/health', async (t) => {
  await t.test('returns 200 with the documented shape', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/health`)

      assert.equal(response.status, 200)
      assert.match(response.headers.get('content-type') ?? '', /application\/json/)

      const body = await readJson<HealthResponse>(response)
      assert.equal(body.status, 'ok')
      assert.equal(body.environment, 'test')
      assert.equal(typeof body.version, 'string')
      assert.ok(body.version.length > 0)
      assert.equal(typeof body.uptimeSeconds, 'number')
    })
  })

  await t.test('reports the real package version, not a placeholder', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const body = await readJson<HealthResponse>(await fetch(`${origin}/api/health`))
      assert.match(body.version, /^\d+\.\d+\.\d+/)
      assert.notEqual(body.version, '0.0.0-unknown')
    })
  })

  await t.test('claims nothing about systems that do not exist yet', async () => {
    // Phase B has no provider and no catalogue. Reporting either would keep
    // reporting "ok" once they exist and are broken.
    await withServer(testContainer(), async ({ origin }) => {
      const body = await readJson<HealthResponse>(await fetch(`${origin}/api/health`))
      assert.deepEqual(Object.keys(body).sort(), [
        'environment',
        'status',
        'uptimeSeconds',
        'version',
      ])
    })
  })

  await t.test('exposes no secrets and no framework fingerprint', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/health`)
      assert.equal(response.headers.get('x-powered-by'), null)
      const text = await response.text()
      assert.doesNotMatch(text, /password|secret|token|apiKey/i)
    })
  })
})

await test('unmatched routes', async (t) => {
  await t.test('return 404 in the standard error shape', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/does-not-exist`)

      assert.equal(response.status, 404)
      const body = await readJson<ErrorBody>(response)
      assert.equal(body.error.code, 'NOT_FOUND')
      assert.match(body.error.message, /No route matches GET \/api\/does-not-exist/)
    })
  })

  await t.test('a path outside the API base is also a 404, not a crash', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/`)
      assert.equal(response.status, 404)
      assert.equal((await readJson<ErrorBody>(response)).error.code, 'NOT_FOUND')
    })
  })

  await t.test('routes that belong to later phases are not mounted yet', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      for (const path of ['/api/tools', '/api/taxonomy', '/api/assistant/chat']) {
        const response = await fetch(`${origin}${path}`)
        assert.equal(response.status, 404, `${path} must not exist in Phase B`)
      }
    })
  })
})

await test('request bodies are bounded and validated', async (t) => {
  await t.test('malformed JSON is a 400, not a 500', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/health`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ "not": valid json',
      })

      assert.equal(response.status, 400)
      const body = await readJson<ErrorBody>(response)
      assert.equal(body.error.code, 'INVALID_REQUEST')
      assert.match(body.error.message, /not valid JSON/)
    })
  })

  await t.test('a body over the limit is refused with 413', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const oversized = JSON.stringify({ message: 'x'.repeat(64 * 1024) })
      const response = await fetch(`${origin}/api/health`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: oversized,
      })

      assert.equal(response.status, 413)
      const body = await readJson<ErrorBody>(response)
      assert.equal(body.error.code, 'INVALID_REQUEST')
      assert.match(body.error.message, /32kb/)
    })
  })

  await t.test('a body just under the limit is accepted by the parser', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const body = JSON.stringify({ message: 'x'.repeat(16 * 1024) })
      const response = await fetch(`${origin}/api/health`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      // No POST route exists yet, so the parser passing means a 404 — not a 413.
      assert.equal(response.status, 404)
    })
  })
})

await test('CORS', async (t) => {
  await t.test('an allowed origin is echoed back exactly', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/health`, {
        headers: { origin: 'http://localhost:5173' },
      })

      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
      assert.equal(response.headers.get('vary'), 'Origin')
    })
  })

  await t.test('an unlisted origin gets no CORS headers at all', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/health`, {
        headers: { origin: 'https://evil.example' },
      })

      assert.equal(response.status, 200)
      assert.equal(response.headers.get('access-control-allow-origin'), null)
      assert.equal(response.headers.get('vary'), 'Origin', 'Vary must be set either way')
    })
  })

  await t.test('a wildcard is never sent', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/health`, {
        headers: { origin: 'http://localhost:5173' },
      })
      assert.notEqual(response.headers.get('access-control-allow-origin'), '*')
    })
  })

  await t.test('a preflight is answered with 204 and the allowed methods', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/health`, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
        },
      })

      assert.equal(response.status, 204)
      assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/)
    })
  })

  await t.test('an empty allowlist disables CORS for every origin', async () => {
    const container = testContainer(testEnv({ cors: { allowedOrigins: [] } }))
    await withServer(container, async ({ origin }) => {
      const response = await fetch(`${origin}/api/health`, {
        headers: { origin: 'http://localhost:5173' },
      })
      assert.equal(response.headers.get('access-control-allow-origin'), null)
    })
  })
})

await test('every response carries a correlation id', async () => {
  await withServer(testContainer(), async ({ origin }) => {
    const ok = await fetch(`${origin}/api/health`)
    const missing = await fetch(`${origin}/api/nope`)

    for (const response of [ok, missing]) {
      const id = response.headers.get(REQUEST_ID_HEADER.toLowerCase())
      assert.ok(id && id.length > 0, 'X-Request-Id must be set on success and on failure')
    }

    assert.notEqual(
      ok.headers.get(REQUEST_ID_HEADER.toLowerCase()),
      missing.headers.get(REQUEST_ID_HEADER.toLowerCase()),
      'each request gets its own id',
    )
  })
})

await test('the logged path is the full path, not the router-relative one', async (t) => {
  /*
   * Regression guard. Express rewrites req.url on entry to a mounted router, so
   * reading req.path inside the 'finish' handler reports "/" for
   * GET /api/health. That both mislabels the line and silently defeats the
   * health-check log suppression below.
   */
  await t.test('a mounted route logs its real path', async () => {
    const captured = capturingLogger('debug', 'json')
    await withServer(testContainer(testEnv(), captured.logger), async ({ origin }) => {
      await fetch(`${origin}/api/health`)
    })
    await new Promise((resolve) => setImmediate(resolve))

    const line = parseLines(captured.lines).find((entry) => entry.msg === 'Request completed')

    assert.ok(line, 'a completion line must be emitted')
    assert.equal(line.path, '/api/health')
    assert.notEqual(line.path, '/', 'req.path was read after the router rewrote req.url')
  })

  await t.test('health checks are logged at debug, so a probe cannot flood the log', async () => {
    const captured = capturingLogger('info', 'json')
    await withServer(testContainer(testEnv(), captured.logger), async ({ origin }) => {
      await fetch(`${origin}/api/health`)
      await fetch(`${origin}/api/nope`)
    })
    await new Promise((resolve) => setImmediate(resolve))

    const completed = parseLines(captured.lines).filter(
      (entry) => entry.msg === 'Request completed',
    )

    assert.equal(completed.length, 1, 'only the non-health request should log at info')
    assert.equal(completed[0]?.path, '/api/nope')
  })

  await t.test('a query string is not logged as part of the path', async () => {
    const captured = capturingLogger('debug', 'json')
    await withServer(testContainer(testEnv(), captured.logger), async ({ origin }) => {
      await fetch(`${origin}/api/health?probe=1`)
    })
    await new Promise((resolve) => setImmediate(resolve))

    const line = parseLines(captured.lines).find((entry) => entry.msg === 'Request completed')
    assert.equal(line?.path, '/api/health')
  })
})

await test('server logs record the outcome without leaking the body', async () => {
  const captured = capturingLogger('debug', 'json')
  const container = testContainer(testEnv(), captured.logger)

  await withServer(container, async ({ origin }) => {
    await fetch(`${origin}/api/health`)
    await fetch(`${origin}/api/nope`)
  })

  // 'finish' fires asynchronously; give the event loop one turn to drain it.
  await new Promise((resolve) => setImmediate(resolve))

  const text = captured.text()
  assert.match(text, /"status":200/)
  assert.match(text, /"status":404/)
  assert.match(text, /Request rejected/, 'a 404 is logged as a rejection, not an error')
  assert.doesNotMatch(text, new RegExp(INTERNAL_MESSAGE), 'no 500 should have occurred')
})
