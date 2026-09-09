import type { BlogPost, WpPost } from '@/types/blog'
import { normalizePost } from '@/utils/blog'

/*
 * WordPress REST client.
 *
 * The base URL comes from VITE_WORDPRESS_API_URL (see client/.env.local) and is
 * read in exactly one place. Every function returns the normalized `BlogPost`
 * model rather than raw WordPress JSON, so no component ever learns the shape of
 * the CMS payload.
 *
 * `_embed` is requested wherever a view needs the featured image, author or
 * terms — it saves three round trips per post.
 */

const API_BASE = import.meta.env.VITE_WORDPRESS_API_URL

/** Thrown for every failure mode so callers can render one error state. */
export class WordPressError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WordPressError'
  }
}

interface RequestOptions {
  signal?: AbortSignal
  params?: Record<string, string | number>
}

async function request<T>(path: string, { signal, params }: RequestOptions = {}): Promise<T> {
  if (!API_BASE) {
    throw new WordPressError(
      'VITE_WORDPRESS_API_URL is not set. Add it to client/.env.local and restart the dev server.',
    )
  }

  const url = new URL(`${API_BASE.replace(/\/$/, '')}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value))
  }

  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (cause) {
    // Network-level failure: the CMS host is down, DNS does not resolve, CORS
    // rejected the request. `fetch` gives no detail, so the message says what
    // the reader can act on.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new WordPressError(`Could not reach WordPress at ${API_BASE}.`, { cause })
  }

  if (!response.ok) {
    throw new WordPressError(
      `WordPress responded ${response.status} ${response.statusText} for ${path}.`,
    )
  }

  try {
    return (await response.json()) as T
  } catch (cause) {
    throw new WordPressError(`WordPress returned an unreadable response for ${path}.`, { cause })
  }
}

/** WordPress returns `[]` for an empty collection, but guard against anything else. */
function toPosts(payload: unknown): BlogPost[] {
  if (!Array.isArray(payload)) return []
  return (payload as WpPost[]).filter((post) => post && typeof post.id === 'number').map(normalizePost)
}

/**
 * The most recent published posts, newest first.
 *
 * Used by the Home "Blog & Insights" section, which takes the first as its
 * featured story and the next two as secondary cards.
 *
 * `status`, `orderby` and `order` are WordPress's own defaults for this
 * collection, and they are sent explicitly anyway: the ordering IS the
 * section's editorial rule — the newest post is the featured one — so it should
 * be stated in the request rather than inherited from whatever the CMS is
 * currently configured to default to. An unauthenticated caller may only ask
 * for `publish`, which is exactly what we want here.
 */
export async function getLatestPosts(limit = 3, signal?: AbortSignal): Promise<BlogPost[]> {
  const payload = await request<unknown>('/posts', {
    signal,
    params: { per_page: limit, status: 'publish', orderby: 'date', order: 'desc', _embed: 1 },
  })
  return toPosts(payload)
}

/**
 * Every published post, newest first.
 *
 * Capped at WordPress's own `per_page` maximum of 100. Pagination is not worth
 * building while the catalog is this small; when it matters, page through
 * `X-WP-TotalPages` here rather than in the page component.
 */
export async function getAllPosts(signal?: AbortSignal): Promise<BlogPost[]> {
  const payload = await request<unknown>('/posts', {
    signal,
    params: { per_page: 100, _embed: 1 },
  })
  return toPosts(payload)
}

/**
 * A single post by slug, or `null` when no published post carries that slug.
 *
 * WordPress has no /posts/{slug} endpoint, so this filters server-side via
 * `?slug=` — one request, not a full fetch-and-search.
 */
export async function getPostBySlug(slug: string, signal?: AbortSignal): Promise<BlogPost | null> {
  if (!slug) return null
  const payload = await request<unknown>('/posts', {
    signal,
    params: { slug, per_page: 1, _embed: 1 },
  })
  return toPosts(payload)[0] ?? null
}
