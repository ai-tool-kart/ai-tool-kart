/** "★ 4.8" — the rating format used on cards and comparison rows. */
export function formatRating(rating: number): string {
  return `★ ${rating}`
}

/** "★ 4.8 (1204)" — used by the Compare page's editor-rating row. */
export function formatRatingWithReviews(rating: number, reviews: number): string {
  return `★ ${rating} (${reviews})`
}

/** "Writing · Freemium" — the category/model subtitle on tool cards. */
export function formatCategoryModel(cat: string, model: string): string {
  return `${cat} · ${model}`
}

/**
 * "950" · "1.2K" · "25.1K" · "1.4M" — a review count with no room for commas.
 *
 * The featured cards put the count inside a pill beside the rating, where
 * `toLocaleString()`'s "25,100" is wider than the space and reads as precision
 * the number does not need. Browse keeps the full figure; it has the width and
 * a catalogue page is where an exact count belongs.
 *
 * One decimal, and a trailing ".0" is dropped so 10,000 is "10K" rather than
 * "10.0K". Truncated rather than rounded, so the displayed figure is never
 * larger than the real one.
 */
export function formatReviewCount(reviews: number): string {
  if (reviews < 1_000) return String(reviews)
  const [value, suffix] = reviews < 1_000_000 ? [reviews / 1_000, 'K'] : [reviews / 1_000_000, 'M']
  const truncated = Math.floor(value * 10) / 10
  return `${Number.isInteger(truncated) ? truncated : truncated.toFixed(1)}${suffix}`
}

/**
 * "claude.ai" — the vendor, as the catalogue actually knows it.
 *
 * The design's Today's Pick shows "AI Chatbot · Anthropic", but the catalogue
 * records no company name; `url` is the only vendor identity it holds. The host
 * is therefore shown in that slot rather than the category being padded with a
 * second fact of a different kind, or a company name being guessed from a
 * product's name. Returns '' for a URL that will not parse, which the caller
 * renders as nothing.
 */
export function formatVendorHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
