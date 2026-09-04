/*
 * URL canonicalization — the level-2 dedupe key (NEWS_AGENT.md §10).
 *
 * This is the highest-value pure function in the codebase: if it is wrong, the
 * agent either re-drafts stories it already published (too strict, keys differ)
 * or silently drops distinct stories (too loose, keys collide). It is therefore
 * deterministic, dependency-free, and covered by a large table-driven test.
 *
 * Canonicalization is intentionally conservative. Anything that could change
 * WHICH document a URL points at is preserved; only parameters that are known
 * to be presentational or analytical are removed.
 */

/** Analytics and campaign parameters, none of which select a document. */
const TRACKING_PARAMS = new Set([
  'ref',
  'ref_src',
  'referrer',
  'source',
  'src',
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'yclid',
  'twclid',
  'ttclid',
  '_hsenc',
  '_hsmi',
  'hsa_cam',
  'vero_id',
  'vero_conv',
  'oly_anon_id',
  'oly_enc_id',
  'spm',
  'scid',
  'trk',
  'trkCampaign',
  'sh',
  'guccounter',
  'guce_referrer',
  'guce_referrer_sig',
  'at_medium',
  'at_campaign',
  'cmpid',
  'ncid',
  'sr_share',
  'share',
  'smid',
  'partner',
  'campaign_id',
  'ck_subscriber_id',
])

/** Prefixes: utm_*, and the Piwik/Matomo pk_* family. */
const TRACKING_PREFIXES = ['utm_', 'pk_', 'piwik_', 'matomo_', 'mtm_', 'hsa_', '__hs']

/**
 * Hosts whose URLs merely wrap a real destination. When the wrapped target is
 * recoverable from a query parameter, the destination is what gets deduped.
 */
const REDIRECT_WRAPPERS: Record<string, string[]> = {
  'news.google.com': ['url'],
  'www.google.com': ['url', 'q'],
  'l.facebook.com': ['u'],
  'out.reddit.com': ['url'],
  't.umblr.com': ['z'],
  'href.li': [],
  'link.medium.com': [],
}

/** Path suffixes that name a format, not a document. */
const STRIPPABLE_SUFFIXES = ['/amp', '/amp/', '.amp', '/index.html', '/index.htm', '/index.php']

function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase()
  if (TRACKING_PARAMS.has(lower)) return true
  return TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

/**
 * Reduces a URL to a stable identity string.
 *
 * Returns the trimmed input unchanged when it cannot be parsed: an unparseable
 * URL still deserves a dedupe key, and using the raw string keeps it distinct
 * from everything else rather than colliding on an empty value.
 */
export function canonicalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return trimmed
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return trimmed

  // Unwrap known redirectors before doing anything else, so the destination is
  // canonicalized rather than the wrapper.
  const wrapperParams = REDIRECT_WRAPPERS[url.hostname.toLowerCase()]
  if (wrapperParams) {
    for (const param of wrapperParams) {
      const target = url.searchParams.get(param)
      if (target && /^https?:\/\//i.test(target)) {
        // One level of unwrapping only — wrappers do not legitimately nest, and
        // recursing on attacker-supplied input invites a loop.
        return canonicalizeUrl(target)
      }
    }
  }

  // Scheme: http and https serve the same document often enough that treating
  // them as distinct would duplicate stories whenever a feed lags a TLS change.
  const scheme = 'https'

  let host = url.hostname.toLowerCase()
  if (host.startsWith('www.')) host = host.slice(4)
  if (host.startsWith('m.')) host = host.slice(2)
  if (host.startsWith('amp.')) host = host.slice(4)
  host = host.replace(/\.$/, '') // trailing root dot

  // Default ports carry no meaning.
  const port = url.port === '80' || url.port === '443' ? '' : url.port

  let path = url.pathname
  try {
    path = decodeURI(path)
  } catch {
    // Malformed percent-encoding: keep the raw path rather than throwing.
  }
  path = path.replace(/\/{2,}/g, '/')
  for (const suffix of STRIPPABLE_SUFFIXES) {
    if (path.toLowerCase().endsWith(suffix)) {
      path = path.slice(0, path.length - suffix.length)
      break
    }
  }
  if (path.length > 1) path = path.replace(/\/+$/, '')
  if (path === '') path = '/'
  path = path.toLowerCase()

  const kept: Array<[string, string]> = []
  for (const [key, value] of url.searchParams) {
    if (isTrackingParam(key)) continue
    kept.push([key.toLowerCase(), value])
  }
  // Sorted so parameter order cannot create two keys for one document.
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
  const query = kept.map(([key, value]) => `${key}=${value}`).join('&')

  // Fragments never select a different document from the server.
  return `${scheme}://${host}${port ? `:${port}` : ''}${path}${query ? `?${query}` : ''}`
}

/** Registrable-ish host for "is this the same publisher?" comparisons. */
export function urlHost(raw: string): string {
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return ''
  }
}

/**
 * Collapses a host to its likely registrable domain.
 *
 * Deliberately naive — no public-suffix list dependency. It exists to answer
 * "are these two sources independent publishers?", where treating
 * blog.example.com and example.com as one publisher is the correct outcome and
 * an occasional mistake on a multi-part TLD is harmless.
 */
export function registrableDomain(raw: string): string {
  const host = urlHost(raw)
  if (!host) return ''
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const twoPartTlds = ['co.uk', 'com.au', 'co.jp', 'co.in', 'com.br', 'co.nz', 'org.uk', 'ac.uk']
  const lastTwo = parts.slice(-2).join('.')
  if (twoPartTlds.includes(lastTwo)) return parts.slice(-3).join('.')
  return lastTwo
}

export function isBannedDomain(raw: string, bannedDomains: string[]): boolean {
  const host = urlHost(raw)
  if (!host) return false
  return bannedDomains.some((banned) => host === banned || host.endsWith(`.${banned}`))
}
