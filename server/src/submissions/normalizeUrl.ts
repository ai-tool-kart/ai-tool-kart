/*
 * URL canonicalization for the duplicate-submission check —
 * SPEC-submit-backend.md §5. The original `siteUrl` is stored untouched;
 * this is only the comparison key.
 *
 * Assumes a valid, parseable URL. Rejecting garbage is validation's job
 * (schema.ts, a later slice) and happens before this is ever called — so
 * this throws (via `new URL()`) on unparseable input rather than guessing.
 */

const STRIPPED_QUERY_PARAMS = new Set(['ref', 'fbclid', 'gclid'])

function isStrippedParam(key: string): boolean {
  return key.startsWith('utm_') || STRIPPED_QUERY_PARAMS.has(key)
}

export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl.trim())

  let hostname = url.hostname.toLowerCase()
  if (hostname.startsWith('www.')) {
    hostname = hostname.slice(4)
  }
  // A non-default port is a different origin, not a formatting quirk, so it
  // stays in the key. Not one of §5's numbered steps — added because the URL
  // parser already clears `url.port` when it equals the scheme's own default
  // (443 for https, 80 for http; verified empirically), so this only ever
  // reintroduces a port for a genuinely non-standard one. Silently dropping
  // it would collide a public site with, say, its own :8080 admin panel.
  const host = url.port ? `${hostname}:${url.port}` : hostname

  const params = new URLSearchParams(url.search)
  for (const key of [...params.keys()]) {
    if (isStrippedParam(key)) params.delete(key)
  }
  // Sorted by key so ?a=1&b=2 and ?b=2&a=1 normalize identically — the
  // original query's order carries no meaning, but string equality would
  // otherwise treat the two as different comparison keys. Plain ordinal
  // (`<`/`>`) comparison, not localeCompare: this key must be stable
  // regardless of the runtime's locale.
  const sortedEntries = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const query = new URLSearchParams(sortedEntries).toString()

  // Path case is PRESERVED, not lowercased. A hostname is safe to fold
  // because DNS names are case-insensitive by definition; a path has no such
  // guarantee — plenty of servers (and client-side routers) treat /Tools and
  // /tools as different resources. Lowercasing here would risk folding two
  // genuinely different pages into one false duplicate, which is worse than
  // occasionally missing a real duplicate that differs only in path case.
  const path = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname

  return `${host}${path}${query ? `?${query}` : ''}`
}
