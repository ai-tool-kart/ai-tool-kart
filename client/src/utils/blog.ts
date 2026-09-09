import type { BlogPost, WpPost } from '@/types/blog'

/*
 * WordPress → BlogPost normalization plus the small text helpers the blog views
 * need. Kept out of the service so the service stays about transport, and out of
 * the components so no component ever touches raw WordPress JSON.
 */

/** Average adult reading speed; the middle of the usual 200–250 wpm range. */
const WORDS_PER_MINUTE = 225

/**
 * Strips markup and decodes HTML entities in one pass.
 *
 * WordPress double-encodes plenty of titles ("Hello &#038; welcome"), so the
 * naive `replace(/<[^>]*>/g, '')` leaves visible entity codes. Parsing is the
 * only correct way to resolve them, and the input never reaches the DOM.
 */
export function htmlToText(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Word-count estimate, floored at one minute so nothing reads "0 min read". */
export function estimateReadingMinutes(html: string): number {
  const words = htmlToText(html).split(' ').filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

/** "12 Aug 2026" — the article header's published date. */
export function formatPostDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "Aug 2026" — the compact form used in card metadata, as in the design. */
export function formatPostMonth(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

/** "8 min read · Aug 2026", collapsing gracefully if the date is unparseable. */
export function formatPostMeta(post: BlogPost, withDate = false): string {
  const readingTime = `${post.readingMinutes} min read`
  if (!withDate) return readingTime
  const month = formatPostMonth(post.publishedAt)
  return month ? `${readingTime} · ${month}` : readingTime
}

/**
 * The label a card shows for a post's category.
 *
 * "Journal" stands in when the post carries none (or only WordPress's
 * "Uncategorized", which `normalizePost` already discards). Shared so the /blog
 * cards and Home's Blog & Insights cards cannot drift onto two different words
 * for the same empty field.
 */
export function blogCategoryLabel(category?: string): string {
  return category ?? 'Journal'
}

/** WordPress appends a "[…]" continuation marker to auto-generated excerpts. */
function cleanExcerpt(html: string): string {
  return htmlToText(html)
    .replace(/\s*\[[….]+\]\s*$/u, '')
    .trim()
}

/**
 * Picks the first category from `_embedded['wp:term']`.
 *
 * `wp:term` is an array of arrays — one per taxonomy, in the order WordPress
 * lists them — so the categories branch is found by taxonomy name rather than
 * by index. "Uncategorized" is a WordPress default rather than editorial intent,
 * so it is treated as no category at all.
 */
function pickCategory(post: WpPost): string | undefined {
  const groups = post._embedded?.['wp:term'] ?? []
  const terms = groups.find((group) => group?.[0]?.taxonomy === 'category') ?? []
  const name = terms[0]?.name
  if (!name || name.toLowerCase() === 'uncategorized') return undefined
  return htmlToText(name)
}

/** Maps one raw WordPress post onto the internal model. */
export function normalizePost(post: WpPost): BlogPost {
  const media = post._embedded?.['wp:featuredmedia']?.[0]
  const title = htmlToText(post.title?.rendered ?? '')
  const content = post.content?.rendered ?? ''

  return {
    id: post.id,
    slug: post.slug,
    title: title || 'Untitled',
    excerpt: cleanExcerpt(post.excerpt?.rendered ?? ''),
    content,
    publishedAt: post.date,
    updatedAt: post.modified,
    featuredImage: media?.source_url,
    // Falling back to the title keeps the image described when the editor left
    // the alt field empty, which is the common case in practice.
    featuredImageAlt: htmlToText(media?.alt_text ?? '') || title,
    category: pickCategory(post),
    author: htmlToText(post._embedded?.author?.[0]?.name ?? '') || undefined,
    readingMinutes: estimateReadingMinutes(content),
  }
}
