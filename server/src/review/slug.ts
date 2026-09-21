/*
 * Slug generation for the review script.
 *
 * Nothing server-side generated a slug before this — the catalogue's seed
 * data was authored by hand, and the only slugify anywhere in the repo is
 * client/src/types/submit.ts's, used purely for the Submit page's own live
 * preview and never sent to the server. `slugify` below is a straight port:
 * verified against real records (`"Notion AI"` → `notion-ai`, `"GitHub
 * Copilot"` → `github-copilot`, `"v0"` → `v0`), it reproduces the existing
 * catalogue's own convention exactly.
 *
 * The catalogue schema's own slug rule (catalogue/schema.ts): lowercase
 * alphanumeric words joined by single hyphens, max 64 characters. Nothing
 * here enforces uniqueness by itself — `parseCatalogue` does, at write time
 * (catalogue/json.ts's `create()`) — but `uniqueSlug` exists so the review
 * script can propose a slug that is *already* unique against what it knows,
 * rather than relying on that check to reject the first guess every time a
 * name collides.
 */

const MAX_SLUG_LENGTH = 64

/** Lowercase, non-alphanumeric runs collapsed to single hyphens, no leading/trailing hyphen. */
export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'untitled'
}

/**
 * Cuts `slug` down to at most `maxLength` characters, preferring to cut at a
 * hyphen so a word is never chopped in half. Falls back to a hard cut only
 * when no hyphen exists within the limit (a single very long word).
 */
export function truncateSlug(slug: string, maxLength: number = MAX_SLUG_LENGTH): string {
  if (slug.length <= maxLength) return slug
  const cut = slug.slice(0, maxLength)
  const lastHyphen = cut.lastIndexOf('-')
  const truncated = lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut
  return truncated.replace(/-+$/, '') || cut
}

/**
 * `base`, truncated to fit, or `base-2`/`base-3`/… — whichever is the first
 * candidate not already in `existingSlugs` — truncated so the suffixed form
 * still fits within `maxLength`.
 */
export function uniqueSlug(
  base: string,
  existingSlugs: ReadonlySet<string>,
  maxLength: number = MAX_SLUG_LENGTH,
): string {
  const truncatedBase = truncateSlug(base, maxLength)
  if (!existingSlugs.has(truncatedBase)) return truncatedBase

  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const candidate = truncateSlug(base, maxLength - suffix.length) + suffix
    if (!existingSlugs.has(candidate)) return candidate
  }
}
