/*
 * Guarded HTTP for externally-derived URLs.
 *
 * The agent fetches URLs that came from third-party feeds, so every request is a
 * potential SSRF vector. This module is the only place external fetches happen,
 * and it enforces, in order:
 *
 *   scheme allowlist -> DNS resolution -> private-address rejection ->
 *   timeout -> response-size cap -> bounded manual redirects (each revalidated)
 *
 * IMPORTANT — scope. These rules apply to URLs the agent DISCOVERED. They do not
 * apply to the WordPress base URL, which the operator configured explicitly and
 * which is legitimately a loopback/.local host during development. That URL is
 * validated separately in config/env.ts and requested by wordpress/client.ts.
 * Conflating the two policies would either break local CMS development or punch
 * a hole in the SSRF guard; NEWS_AGENT.md §28 keeps them apart on purpose.
 *
 * RESIDUAL RISK — DNS rebinding. Node's fetch offers no way to pin the socket to
 * the address we validated, so a hostile resolver could answer our lookup with a
 * public address and the connection with a private one. Closing that would mean
 * hand-rolling the connection against a resolved IP with a Host header override.
 * For a pipeline that fetches a small allowlist-adjacent set of news domains the
 * tradeoff is not worth it yet; it is recorded here rather than left implicit.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { RETRY } from '../config/limits.ts'
import { AgentError, urlRejected } from '../domain/errors.ts'
import { sleep } from './time.ts'

export interface HttpOptions {
  timeoutMs: number
  maxResponseBytes: number
  userAgent: string
  accept?: string
  /** Attempts for transient failures. 1 disables retrying. */
  attempts?: number
}

export interface HttpTextResponse {
  url: string
  status: number
  contentType: string
  body: string
  bytes: number
}

/* ── URL validation ───────────────────────────────────────────────────────── */

/**
 * IPv4 ranges that must never be reachable from a discovered URL: loopback,
 * link-local (cloud metadata lives at 169.254.169.254), RFC1918, CGNAT,
 * benchmarking, multicast and reserved space.
 */
function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true // unparseable is not provably public
  }
  /*
   * Prefix lengths matter here. An earlier version of this function widened
   * three /24 reservations to /16 by only comparing the second octet, which
   * blocked real public space — 192.0.66.0/24 is Automattic, so github.blog and
   * techcrunch.com were both rejected as "private". Each range below is matched
   * at its actual prefix length.
   */
  const [a = 0, b = 0, c = 0] = parts
  if (a === 0) return true // 0.0.0.0/8 "this network"
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 192 && b === 0 && c === 0) return true // 192.0.0.0/24 IETF assignments
  if (a === 192 && b === 0 && c === 2) return true // 192.0.2.0/24 TEST-NET-1
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false
}

function isPrivateIPv6(address: string): boolean {
  const lower = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (lower === '::' || lower === '::1') return true
  // IPv4-mapped (::ffff:127.0.0.1) must be judged by its embedded v4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (mapped?.[1]) return isPrivateIPv4(mapped[1])
  const head = lower.split(':')[0] ?? ''
  if (head.startsWith('fe8') || head.startsWith('fe9') || head.startsWith('fea') || head.startsWith('feb')) {
    return true // link-local fe80::/10
  }
  if (head.startsWith('fc') || head.startsWith('fd')) return true // unique-local fc00::/7
  if (head.startsWith('ff')) return true // multicast
  return false
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return isPrivateIPv4(address)
  if (family === 6) return isPrivateIPv6(address)
  return true
}

/**
 * Syntactic checks that need no network: scheme, credentials, obvious local
 * hostnames. Split from the DNS check so it can be unit-tested offline and so
 * generated article links can be validated without resolving anything.
 */
export function validateExternalUrlShape(raw: string): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw urlRejected(`Not a valid URL: ${raw.slice(0, 200)}`)
  }

  if (parsed.protocol !== 'https:') {
    throw urlRejected(`Only https:// is allowed for external URLs (got ${parsed.protocol})`, {
      url: parsed.href,
    })
  }
  if (parsed.username || parsed.password) {
    throw urlRejected('URLs with embedded credentials are rejected', { host: parsed.hostname })
  }

  const host = parsed.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa') ||
    host === 'metadata.google.internal'
  ) {
    throw urlRejected(`Refusing to fetch internal hostname: ${host}`)
  }
  // A bare literal IP is never a legitimate news source and skips DNS policy.
  if (isIP(host) !== 0 && isPrivateAddress(host)) {
    throw urlRejected(`Refusing to fetch private address: ${host}`)
  }

  return parsed
}

/** Full validation: shape plus DNS resolution against the private-range rules. */
export async function assertSafeExternalUrl(raw: string): Promise<URL> {
  const parsed = validateExternalUrlShape(raw)
  const host = parsed.hostname

  if (isIP(host) !== 0) return parsed // literal, already checked

  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(host, { all: true })
  } catch (cause) {
    throw urlRejected(`Could not resolve host: ${host}`, { cause: String(cause) })
  }

  if (addresses.length === 0) throw urlRejected(`Host resolved to no addresses: ${host}`)

  // Every answer must be public. One private answer is enough to be a rebinding
  // attempt or a misconfiguration, and neither deserves a connection.
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw urlRejected(`Host ${host} resolves to a private address`, { address })
    }
  }

  return parsed
}

/* ── Fetching ─────────────────────────────────────────────────────────────── */

function isTransientStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

async function readCapped(response: Response, maxBytes: number): Promise<{ text: string; bytes: number }> {
  const body = response.body
  if (!body) return { text: '', bytes: 0 }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new AgentError('HTTP', `Response exceeded ${maxBytes} byte cap`, {
          details: { bytes: total },
        })
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock?.()
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(merged), bytes: total }
}

/**
 * One guarded request, following redirects manually so each hop is revalidated.
 * `redirect: 'manual'` matters: the platform's automatic following would happily
 * chase a 302 into 169.254.169.254 after our checks passed on the first URL.
 */
async function fetchOnce(startUrl: string, options: HttpOptions): Promise<HttpTextResponse> {
  let current = await assertSafeExternalUrl(startUrl)

  for (let hop = 0; hop <= RETRY.maxRedirects; hop += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)

    let response: Response
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': options.userAgent,
          accept: options.accept ?? '*/*',
          'accept-language': 'en',
        },
      })
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === 'AbortError'
      throw new AgentError('HTTP', aborted ? `Request timed out after ${options.timeoutMs}ms` : 'Request failed', {
        cause,
        retryable: true,
        details: { url: current.href },
      })
    } finally {
      clearTimeout(timer)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        throw new AgentError('HTTP', `Redirect ${response.status} without Location header`, {
          details: { url: current.href },
        })
      }
      if (hop === RETRY.maxRedirects) {
        throw new AgentError('HTTP', `Exceeded ${RETRY.maxRedirects} redirects`, {
          details: { url: current.href },
        })
      }
      // Resolve relative Locations against the current URL, then revalidate.
      current = await assertSafeExternalUrl(new URL(location, current).href)
      continue
    }

    if (!response.ok) {
      throw new AgentError('HTTP', `HTTP ${response.status} ${response.statusText}`, {
        retryable: isTransientStatus(response.status),
        details: { url: current.href, status: response.status },
      })
    }

    const { text, bytes } = await readCapped(response, options.maxResponseBytes)
    return {
      url: current.href,
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      body: text,
      bytes,
    }
  }

  throw new AgentError('HTTP', 'Redirect loop', { details: { url: startUrl } })
}

/**
 * Guarded GET with bounded exponential backoff and jitter.
 *
 * Only failures marked retryable are retried, so a 404 or an SSRF rejection
 * fails immediately instead of being attempted three times.
 */
export async function fetchText(url: string, options: HttpOptions): Promise<HttpTextResponse> {
  const attempts = options.attempts ?? RETRY.httpAttempts
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchOnce(url, options)
    } catch (error) {
      lastError = error
      const retryable = error instanceof AgentError && error.retryable
      if (!retryable || attempt === attempts) break
      const backoff = Math.min(RETRY.httpBaseDelayMs * 2 ** (attempt - 1), RETRY.httpMaxDelayMs)
      await sleep(backoff + Math.random() * 200)
    }
  }

  throw lastError
}
