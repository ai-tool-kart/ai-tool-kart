import test from 'node:test'
import assert from 'node:assert/strict'
import { createWordPressClient } from '../src/wordpress/client.ts'
import { createTaxonomyResolver } from '../src/wordpress/taxonomy.ts'
import { isPublishingBlocked } from '../src/wordpress/publish.ts'
import { loadEnv } from '../src/config/env.ts'
import { clearSecrets, createLogger } from '../src/utils/logger.ts'
import { mockWordPress, testLogger } from './helpers.ts'

/*
 * The WordPress client is tested against a mock transport, never a live CMS.
 * These cases cover the status codes the pipeline actually branches on.
 */

interface MockResponse {
  status: number
  body?: unknown
  text?: string
}

function transportFor(handler: (url: string, init: RequestInit) => MockResponse) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const transport = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init: init ?? {} })
    const result = handler(url, init ?? {})
    const body = result.text ?? JSON.stringify(result.body ?? {})
    return new Response(body, {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return { transport, calls }
}

function client(handler: (url: string, init: RequestInit) => MockResponse, logger = testLogger()) {
  const { transport, calls } = transportFor(handler)
  return {
    calls,
    wp: createWordPressClient({
      credentials: {
        apiUrl: 'https://cms.test/wp-json/wp/v2',
        username: 'aitoolkart-news-agent',
        appPassword: 'abcdEFGHijklMNOPqrstUVWX',
        createTerms: true,
      },
      logger,
      timeoutMs: 2000,
      userAgent: 'test-agent/0.1',
      transport,
    }),
  }
}

const DRAFT_PAYLOAD = {
  title: 'A title',
  slug: 'a-title',
  content: '<p>Body</p>',
  excerpt: 'An excerpt',
  status: 'draft' as const,
  categories: [7],
  tags: [10],
}

test('createPost sends Basic auth and a draft status', async () => {
  const { wp, calls } = client(() => ({ status: 201, body: { id: 42, slug: 'a-title', status: 'draft' } }))

  const post = await wp.createPost(DRAFT_PAYLOAD)
  assert.equal(post.id, 42)
  assert.equal(post.status, 'draft')

  const headers = calls[0]!.init.headers as Record<string, string>
  assert.ok(headers.authorization?.startsWith('Basic '), 'Basic auth must be sent')
  assert.equal(
    headers.authorization,
    `Basic ${Buffer.from('aitoolkart-news-agent:abcdEFGHijklMNOPqrstUVWX').toString('base64')}`,
  )

  const body = JSON.parse(String(calls[0]!.init.body))
  assert.equal(body.status, 'draft')
})

test('the client refuses to send any status other than draft', async () => {
  const { wp, calls } = client(() => ({ status: 201, body: { id: 1, slug: 's', status: 'publish' } }))
  await assert.rejects(
    () => wp.createPost({ ...DRAFT_PAYLOAD, status: 'publish' as never }),
    /other than draft/,
  )
  assert.equal(calls.length, 0, 'the request must never leave the process')
})

test('401 is a non-retried auth failure that blocks publishing', async () => {
  const { wp, calls } = client(() => ({
    status: 401,
    body: { code: 'incorrect_password', message: 'The password is incorrect.' },
  }))

  await assert.rejects(
    () => wp.createPost(DRAFT_PAYLOAD),
    (error: Error) => {
      assert.match(error.message, /rejected the credentials/)
      assert.match(error.message, /incorrect_password/, 'the WordPress code should surface')
      assert.equal(isPublishingBlocked(error), true, 'auth failure must stop publishing')
      return true
    },
  )
  assert.equal(calls.length, 1, 'auth failures must not be retried')
})

test('403 is treated the same as 401', async () => {
  const { wp, calls } = client(() => ({ status: 403, body: { message: 'Sorry, you are not allowed.' } }))
  await assert.rejects(() => wp.createPost(DRAFT_PAYLOAD), /rejected the credentials/)
  assert.equal(calls.length, 1)
})

test('5xx is retried, then reported', async () => {
  let attempts = 0
  const { wp } = client(() => {
    attempts += 1
    return { status: 503, body: { message: 'Service unavailable' } }
  })

  await assert.rejects(() => wp.createPost(DRAFT_PAYLOAD), /503/)
  assert.ok(attempts >= 2, `expected retries, saw ${attempts} attempts`)
  assert.equal(isPublishingBlocked(new Error('x')), false)
})

test('a transient 5xx that recovers succeeds', async () => {
  let attempts = 0
  const { wp } = client(() => {
    attempts += 1
    if (attempts === 1) return { status: 500, body: { message: 'oops' } }
    return { status: 201, body: { id: 7, slug: 'a-title', status: 'draft' } }
  })

  const post = await wp.createPost(DRAFT_PAYLOAD)
  assert.equal(post.id, 7)
  assert.equal(attempts, 2)
})

test('a malformed response is an error, not a silent success', async () => {
  const { wp } = client(() => ({ status: 201, text: 'this is not JSON' }))
  await assert.rejects(() => wp.createPost(DRAFT_PAYLOAD), /unreadable/)
})

test('an HTML error page is truncated, not echoed wholesale', async () => {
  const { wp } = client(() => ({
    status: 400,
    text: `<html><body>${'x'.repeat(5000)}</body></html>`,
  }))
  await assert.rejects(() => wp.createPost(DRAFT_PAYLOAD), (error: Error) => {
    assert.ok(error.message.length < 400, `error message was ${error.message.length} chars`)
    return true
  })
})

test('credentials never appear in logs', async () => {
  clearSecrets()
  const lines: string[] = []
  const logger = createLogger({ level: 'debug', format: 'json', write: (line) => lines.push(line) })

  const { wp } = client(
    () => ({ status: 401, body: { message: 'The password for the user is incorrect.' } }),
    logger,
  )

  await wp.createPost(DRAFT_PAYLOAD).catch(() => {})
  await wp.checkConnection()

  const combined = lines.join('\n')
  assert.ok(!combined.includes('abcdEFGHijklMNOPqrstUVWX'), 'the app password must never be logged')
  assert.ok(!combined.toLowerCase().includes('authorization'), 'the auth header must never be logged')
  clearSecrets()
})

/* ── Taxonomy ─────────────────────────────────────────────────────────────── */

test('categories resolve by slug and are cached for the run', async () => {
  const wp = mockWordPress()
  let lookups = 0
  const counting = {
    ...wp,
    findTerm: async (taxonomy: 'categories' | 'tags', slug: string) => {
      lookups += 1
      return wp.findTerm(taxonomy, slug)
    },
  }

  const taxonomy = createTaxonomyResolver({ client: counting, logger: testLogger(), createMissing: true })

  const first = await taxonomy.resolveCategory('ai-models')
  const second = await taxonomy.resolveCategory('ai-models')

  assert.equal(first, second, 'the same category must resolve to the same id')
  assert.equal(lookups, 1, 'the second resolution must come from the cache')
  assert.equal(wp.terms[0]?.slug, 'ai-models', 'the term is keyed on the internal slug')
  assert.equal(wp.terms[0]?.name, 'AI Models', 'the display name comes from the label map')
})

test('term creation can be disabled', async () => {
  const wp = mockWordPress()
  const taxonomy = createTaxonomyResolver({ client: wp, logger: testLogger(), createMissing: false })

  await assert.rejects(() => taxonomy.resolveCategory('mcp'), /does not exist/)
  assert.equal(wp.terms.length, 0)
})

test('a tag that cannot be resolved is skipped, not fatal', async () => {
  const wp = mockWordPress()
  const failing = {
    ...wp,
    createTerm: async (taxonomy: 'categories' | 'tags', name: string, slug: string) => {
      if (name === 'Broken') throw new Error('term creation failed')
      return wp.createTerm(taxonomy, name, slug)
    },
  }

  const taxonomy = createTaxonomyResolver({ client: failing, logger: testLogger(), createMissing: true })
  const ids = await taxonomy.resolveTags(['OpenAI', 'Broken', 'Claude'])

  assert.equal(ids.length, 2, 'the working tags must still resolve')
})

/* ── Env validation for the WordPress path ────────────────────────────────── */

test('partial WordPress configuration is rejected at startup', () => {
  assert.throws(
    () =>
      loadEnv({
        WORDPRESS_API_URL: 'https://cms.test/wp-json/wp/v2',
        WORDPRESS_USERNAME: 'agent',
        // password missing
      } as NodeJS.ProcessEnv),
    /partially configured/i,
  )
})

test('plain http is rejected for a public host but allowed for LocalWP', () => {
  assert.throws(
    () =>
      loadEnv({
        WORDPRESS_API_URL: 'http://cms.example.com/wp-json/wp/v2',
        WORDPRESS_USERNAME: 'agent',
        WORDPRESS_APP_PASSWORD: 'abcd efgh ijkl mnop',
      } as NodeJS.ProcessEnv),
    /must use https/i,
  )

  const local = loadEnv({
    WORDPRESS_API_URL: 'http://ai-tool-kart-cms.local/wp-json/wp/v2',
    WORDPRESS_USERNAME: 'agent',
    WORDPRESS_APP_PASSWORD: 'abcd efgh ijkl mnop',
  } as NodeJS.ProcessEnv)

  assert.ok(local.env.wordpress)
  assert.equal(local.env.wordpress?.appPassword, 'abcdefghijklmnop', 'spaces must be stripped')
  assert.ok(
    local.warnings.some((warning) => warning.includes('Application Passwords')),
    'the LocalWP caveat must be surfaced as a warning',
  )
  clearSecrets()
})

test('the agent refuses to start with auto-publish enabled', () => {
  assert.throws(
    () => loadEnv({ AGENT_AUTO_PUBLISH: 'true' } as NodeJS.ProcessEnv),
    /not implemented in this MVP/,
  )
})

test('auto-publish is false in the loaded config regardless', () => {
  const { env } = loadEnv({ AGENT_AUTO_PUBLISH: 'false' } as NodeJS.ProcessEnv)
  assert.equal(env.autoPublish, false)
})

test('a non-mock provider without a key is rejected', () => {
  assert.throws(
    () => loadEnv({ LLM_PROVIDER: 'some-vendor' } as NodeJS.ProcessEnv),
    /LLM_API_KEY is empty/,
  )
})
