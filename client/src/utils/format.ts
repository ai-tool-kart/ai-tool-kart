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
