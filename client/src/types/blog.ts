/*
 * Blog types.
 *
 * Two layers live here on purpose:
 *
 *  1. `Wp*` — the subset of the WordPress REST payload we actually read. These
 *     exist so the service layer can parse the response without `any`; nothing
 *     outside `services/wordpress.ts` and `utils/blog.ts` should import them.
 *  2. `BlogPost` — the clean internal model every component receives. It is flat,
 *     already decoded, and carries no WordPress-shaped optionality.
 *
 * Everything in the Wp layer is optional beyond the fields WordPress always
 * returns, because `_embed` silently omits branches (no featured image, no
 * terms, restricted author) and a missing branch must not crash a layout.
 */

export interface WpRendered {
  rendered: string
}

export interface WpMedia {
  id: number
  source_url?: string
  alt_text?: string
}

export interface WpTerm {
  id: number
  name: string
  slug: string
  taxonomy?: string
}

export interface WpAuthor {
  id: number
  name?: string
}

export interface WpEmbedded {
  'wp:featuredmedia'?: WpMedia[]
  /** One array per taxonomy attached to the post (categories, tags, …). */
  'wp:term'?: WpTerm[][]
  author?: WpAuthor[]
}

export interface WpPost {
  id: number
  slug: string
  date: string
  modified: string
  title: WpRendered
  excerpt: WpRendered
  content: WpRendered
  featured_media: number
  _embedded?: WpEmbedded
}

/** The normalized post every blog component consumes. */
export interface BlogPost {
  id: number
  slug: string
  /** Plain text — entities decoded, markup stripped. */
  title: string
  /** Plain text, trimmed of WordPress's "[…]" continuation marker. */
  excerpt: string
  /** Trusted CMS HTML, rendered inside the scoped `.article-content` styles. */
  content: string
  publishedAt: string
  updatedAt: string
  featuredImage?: string
  featuredImageAlt: string
  category?: string
  author?: string
  /** Estimated from the word count of `content` — WordPress exposes no such field. */
  readingMinutes: number
}
