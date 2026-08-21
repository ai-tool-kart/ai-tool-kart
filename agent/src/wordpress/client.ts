/*
 * Authenticated WordPress REST client (NEWS_AGENT.md §17).
 *
 * Entirely separate from client/src/services/wordpress.ts, which is the
 * browser's READ path and must never gain write capability or see a credential.
 * The two share only a base URL, duplicated as configuration on purpose.
 *
 * Credential handling:
 *   - Application Password over HTTP Basic, built per request, never stored
 *     anywhere but the config object
 *   - the Authorization header is never logged, and the password is registered
 *     with the logger's redactor at startup
 *   - 401/403 stops publishing for the whole run rather than retrying (§25)
 *
 * URL policy: the base URL was validated in config/env.ts, where plain http is
 * permitted for loopback/.local development hosts. The SSRF guard in
 * utils/http.ts deliberately does NOT apply here — it governs URLs the agent
 * discovered, not the one the operator configured.
 */

import { RETRY } from '../config/limits.ts'
import type { WordPressCredentials } from '../config/env.ts'
import { AgentError, wordPressAuthError } from '../domain/errors.ts'
import type { Logger } from '../utils/logger.ts'
import { sleep } from '../utils/time.ts'

export interface WordPressPost {
  id: number
  slug: string
  status: string
  link?: string
}

export interface WordPressTerm {
  id: number
  name: string
  slug: string
}

export interface CreatePostPayload {
  title: string
  slug: string
  content: string
  excerpt: string
  /**
   * Draft only. Typed as the literal so no call site can pass 'publish':
   * automatic publishing is Phase I and unimplemented (§18/§19).
   */
  status: 'draft'
  categories: number[]
  tags: number[]
}

export interface WordPressClient {
  readonly baseUrl: string
  createPost(payload: CreatePostPayload): Promise<WordPressPost>
  getPost(id: number): Promise<WordPressPost | undefined>
  findTerm(taxonomy: 'categories' | 'tags', slug: string): Promise<WordPressTerm | undefined>
  createTerm(taxonomy: 'categories' | 'tags', name: string, slug: string): Promise<WordPressTerm>
  /** Verifies credentials and reachability before the pipeline spends anything. */
  checkConnection(): Promise<{ ok: true } | { ok: false; reason: string }>
}

export interface WordPressClientOptions {
  credentials: WordPressCredentials
  logger: Logger
  timeoutMs: number
  userAgent: string
  /** Test seam: replaced with a mock transport in tests. */
  transport?: typeof fetch
}

interface RequestOptions {
  method: 'GET' | 'POST'
  path: string
  query?: Record<string, string | number>
  body?: unknown
  /** Attempts for transient failures. Auth failures never retry. */
  attempts?: number
}

export function createWordPressClient(options: WordPressClientOptions): WordPressClient {
  const { credentials, logger, timeoutMs, userAgent } = options
  const transport = options.transport ?? fetch
  const log = logger.child({ step: 'wordpress' })

  const authorization = `Basic ${Buffer.from(
    `${credentials.username}:${credentials.appPassword}`,
    'utf8',
  ).toString('base64')}`

  async function request<T>(requestOptions: RequestOptions): Promise<T> {
    const url = new URL(`${credentials.apiUrl}${requestOptions.path}`)
    for (const [key, value] of Object.entries(requestOptions.query ?? {})) {
      url.searchParams.set(key, String(value))
    }

    const attempts = requestOptions.attempts ?? RETRY.wordpressAttempts
    let lastError: unknown

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      let response: Response
      try {
        response = await transport(url, {
          method: requestOptions.method,
          signal: controller.signal,
          headers: {
            // Never logged. See the redaction note at the top of this file.
            authorization,
            'content-type': 'application/json',
            accept: 'application/json',
            'user-agent': userAgent,
          },
          ...(requestOptions.body !== undefined
            ? { body: JSON.stringify(requestOptions.body) }
            : {}),
        })
      } catch (cause) {
        const aborted = cause instanceof Error && cause.name === 'AbortError'
        lastError = new AgentError(
          'WORDPRESS',
          aborted ? `WordPress request timed out after ${timeoutMs}ms` : 'Could not reach WordPress',
          { cause, retryable: true, details: { path: requestOptions.path } },
        )
        log.warn('WordPress request failed', { path: requestOptions.path, attempt })
        if (attempt < attempts) {
          await sleep(RETRY.httpBaseDelayMs * 2 ** (attempt - 1))
          continue
        }
        throw lastError
      } finally {
        clearTimeout(timer)
      }

      if (response.status === 401 || response.status === 403) {
        /*
         * An operator problem, not a transient one. Retrying cannot fix a wrong
         * password and repeated failures invite a lockout, so this stops
         * publishing for the rest of the run.
         */
        const detail = await safeErrorDetail(response)
        throw wordPressAuthError(
          `WordPress rejected the credentials (HTTP ${response.status}). ${detail}`,
          { path: requestOptions.path, status: response.status },
        )
      }

      if (response.status >= 500 || response.status === 429) {
        lastError = new AgentError('WORDPRESS', `WordPress responded ${response.status}`, {
          retryable: true,
          details: { path: requestOptions.path, status: response.status },
        })
        if (attempt < attempts) {
          await sleep(RETRY.httpBaseDelayMs * 2 ** (attempt - 1))
          continue
        }
        throw lastError
      }

      if (!response.ok) {
        const detail = await safeErrorDetail(response)
        throw new AgentError('WORDPRESS', `WordPress responded ${response.status}. ${detail}`, {
          details: { path: requestOptions.path, status: response.status },
        })
      }

      try {
        return (await response.json()) as T
      } catch (cause) {
        throw new AgentError('WORDPRESS', 'WordPress returned an unreadable response', {
          cause,
          details: { path: requestOptions.path },
        })
      }
    }

    throw lastError ?? new AgentError('WORDPRESS', 'WordPress request exhausted attempts')
  }

  /** Extracts a WordPress error message without echoing an entire HTML page. */
  async function safeErrorDetail(response: Response): Promise<string> {
    try {
      const text = await response.text()
      if (!text) return ''
      try {
        const parsed = JSON.parse(text) as { message?: string; code?: string }
        if (parsed.message) return `${parsed.code ? `[${parsed.code}] ` : ''}${parsed.message}`
      } catch {
        // Not JSON — fall through to the truncated text.
      }
      return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
    } catch {
      return ''
    }
  }

  return {
    baseUrl: credentials.apiUrl,

    async createPost(payload) {
      // status is typed as the literal 'draft', but assert it at the boundary
      // too: this is the last line of defence against accidental publishing.
      if (payload.status !== 'draft') {
        throw new AgentError('WORDPRESS', 'Refusing to create a post with a status other than draft')
      }
      const post = await request<WordPressPost>({
        method: 'POST',
        path: '/posts',
        body: payload,
        attempts: RETRY.wordpressAttempts,
      })
      log.info('WordPress draft created', { wpPostId: post.id, slug: post.slug, status: post.status })
      return post
    },

    async getPost(id) {
      try {
        return await request<WordPressPost>({
          method: 'GET',
          path: `/posts/${id}`,
          query: { context: 'edit' },
          attempts: 1,
        })
      } catch (error) {
        if (error instanceof AgentError && error.code === 'WORDPRESS') return undefined
        throw error
      }
    },

    async findTerm(taxonomy, slug) {
      const terms = await request<WordPressTerm[]>({
        method: 'GET',
        path: `/${taxonomy}`,
        query: { slug, per_page: 1 },
      })
      return Array.isArray(terms) ? terms[0] : undefined
    },

    async createTerm(taxonomy, name, slug) {
      return request<WordPressTerm>({
        method: 'POST',
        path: `/${taxonomy}`,
        body: { name, slug },
      })
    },

    async checkConnection() {
      try {
        // /users/me is the cheapest authenticated endpoint that proves the
        // credentials work rather than merely that the host is up.
        await request<{ id: number }>({ method: 'GET', path: '/users/me', attempts: 1 })
        return { ok: true }
      } catch (error) {
        if (error instanceof AgentError) {
          return { ok: false, reason: error.message }
        }
        return { ok: false, reason: String(error) }
      }
    },
  }
}
