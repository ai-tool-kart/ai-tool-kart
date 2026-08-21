/*
 * Slug generation.
 *
 * Deterministic and generated in application code, never by the model. A retry
 * or a revision pass must not change an article's URL, so the slug is derived
 * from the story's own title and stays put once persisted.
 *
 * The React frontend routes /blog/:slug and looks posts up by slug
 * (client/src/pages/BlogArticlePage.tsx), so an unstable or unsafe slug is a
 * broken link, not a cosmetic problem.
 */

const MAX_SLUG_LENGTH = 72

/** Characters that survive transliteration to a URL-safe ASCII slug. */
function transliterate(input: string): string {
  return input
    .normalize('NFKD')
    // Strip combining marks so "é" becomes "e" rather than being dropped.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ß]/g, 'ss')
    .replace(/[æ]/gi, 'ae')
    .replace(/[ø]/gi, 'o')
    .replace(/[đ]/gi, 'd')
    .replace(/[ł]/gi, 'l')
}

export function slugify(title: string): string {
  const slug = transliterate(title)
    .toLowerCase()
    // Ampersands read better as a word than as a dropped character.
    .replace(/&/g, ' and ')
    // Keep digits and dots inside version numbers readable: "gpt-4.5" -> "gpt-4-5".
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!slug) return 'ai-tool-kart-news'

  if (slug.length <= MAX_SLUG_LENGTH) return slug

  // Truncate on a word boundary so the slug does not end mid-word.
  const cut = slug.slice(0, MAX_SLUG_LENGTH)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > MAX_SLUG_LENGTH * 0.6 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '')
}

/**
 * Resolves a slug collision by appending a numeric suffix.
 *
 * `isTaken` is supplied by the caller (the article repository), so this stays a
 * pure function and the database is not consulted from generation code.
 */
export function uniqueSlug(title: string, isTaken: (slug: string) => boolean): string {
  const base = slugify(title)
  if (!isTaken(base)) return base

  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!isTaken(candidate)) return candidate
  }

  // Fall back to a time-based suffix rather than looping forever.
  return `${base}-${Date.now().toString(36)}`
}
