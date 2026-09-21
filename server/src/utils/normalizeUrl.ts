/*
 * URL canonicalization — SPEC-submit-backend.md §5's 8 steps. The original
 * `siteUrl` (or a catalogue tool's `url`) is stored untouched; this is only
 * the comparison key duplicate checks compare.
 *
 * Lives in utils/, not submissions/, because both submissions/service.ts and
 * catalogue/json.ts need it: a submission's duplicate check runs against the
 * live catalogue as well as the submission store (SPEC §7 steps 5-6), and
 * catalogue/json.ts is what builds the normalized-URL index that check reads.
 * Putting this under submissions/ would make catalogue/ depend on a feature
 * built on top of it — the wrong direction — for something this low-level.
 *
 * Assumes a valid, parseable URL. Rejecting garbage is validation's job
 * (submissions/schema.ts) and happens before this is ever called on a
 * submission's siteUrl — so this throws (via `new URL()`) on unparseable
 * input rather than guessing. Every seeded catalogue tool's `url` is also
 * expected to be parseable; catalogue/json.ts treats one that somehow isn't
 * as unindexed rather than failing catalogue load over it.
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
