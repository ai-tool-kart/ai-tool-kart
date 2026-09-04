/*
 * Structured article -> WordPress HTML.
 *
 * THIS IS A SECURITY BOUNDARY, not a formatting helper.
 *
 * The React frontend renders post bodies with dangerouslySetInnerHTML
 * (client/src/components/blog/ArticleContent.tsx), on the stated assumption that
 * WordPress is a trusted author surface. An agent that derives content from
 * third-party websites weakens that assumption — unless the HTML reaching
 * WordPress is built here, from validated structured data, using a fixed
 * allowlist. NEWS_AGENT.md §16 and §28 both treat this as the control that keeps
 * the frontend's assumption true.
 *
 * Consequences of that, enforced below:
 *   - the model never supplies markup; it supplies text, and we emit the tags
 *   - every text node is HTML-escaped, unconditionally
 *   - the only anchors are ones we construct from validated https URLs
 *   - no attributes beyond href/rel/target on the source links we build
 *   - nothing is ever passed through from a fetched page
 */

import type { ArticleSection, Claim, SourceEvidence } from '../domain/types.ts'
import { validateExternalUrlShape } from '../utils/http.ts'
import { wordCount } from '../utils/text.ts'

/**
 * The complete set of elements this renderer can emit.
 *
 * Listed for documentation and asserted by tests; the emitters below are the
 * actual implementation. Anything not here cannot be produced.
 */
export const ALLOWED_TAGS = [
  'p',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'a',
  'strong',
  'em',
  'blockquote',
  'code',
] as const

/**
 * Escapes text for an HTML text node or attribute value.
 *
 * Applied to every string that reaches the output. Escaping quotes as well as
 * angle brackets means the same function is safe in both positions.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Returns a safe href, or undefined.
 *
 * Reuses the shape validation from the HTTP guard so that "safe to link" and
 * "safe to fetch" cannot drift apart: https only, no embedded credentials, no
 * internal hostnames. javascript:, data: and vbscript: URLs fail at the scheme
 * check before anything else runs.
 */
export function safeHref(raw: string): string | undefined {
  try {
    const url = validateExternalUrlShape(raw.trim())
    return url.href
  } catch {
    return undefined
  }
}

function paragraph(text: string): string {
  return `<p>${escapeHtml(text.trim())}</p>`
}

function heading(text: string): string {
  return `<h2>${escapeHtml(text.trim())}</h2>`
}

function list(items: string[]): string {
  const entries = items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('\n')
  return `<ul>\n${entries}\n</ul>`
}

export interface RenderSourcesInput {
  url: string
  publisher: string
  title: string
  publishedAt?: string
}

/**
 * The visible Sources block.
 *
 * Always rendered when there is at least one valid link. Attribution is both an
 * editorial obligation (§29) and what lets a human reviewer check the article
 * without leaving the WordPress editor (§30).
 */
export function renderSources(sources: RenderSourcesInput[]): string {
  const seen = new Set<string>()
  const items: string[] = []

  for (const source of sources) {
    const href = safeHref(source.url)
    if (!href || seen.has(href)) continue
    seen.add(href)

    const label = source.publisher.trim() || new URL(href).hostname.replace(/^www\./, '')
    const title = source.title.trim()
    const date = source.publishedAt ? source.publishedAt.slice(0, 10) : ''

    // rel="nofollow noopener" — these are third-party links the agent chose, and
    // we do not want to pass authority to whatever they later become.
    const anchor = `<a href="${escapeHtml(href)}" rel="nofollow noopener" target="_blank">${escapeHtml(
      title || label,
    )}</a>`
    const suffix = [label, date].filter(Boolean).join(', ')
    items.push(`<li>${anchor}${suffix ? ` — ${escapeHtml(suffix)}` : ''}</li>`)
  }

  if (items.length === 0) return ''
  return `<h2>Sources</h2>\n<ul>\n${items.join('\n')}\n</ul>`
}

export interface RenderInput {
  sections: ArticleSection[]
  sources: RenderSourcesInput[]
  /** Claims still only single-source, disclosed to the reader. */
  singleSourceClaims?: Claim[]
}

export interface RenderResult {
  html: string
  wordCount: number
}

/**
 * Renders the article body.
 *
 * The output is deliberately plain: WordPress block markup, custom classes and
 * inline styles are all omitted, because the frontend styles post content
 * through its own scoped `.article-content` rules (client/src/styles/article.css)
 * and anything else would fight it.
 */
export function renderArticleHtml(input: RenderInput): RenderResult {
  const blocks: string[] = []

  for (const section of input.sections) {
    const headingText = section.heading?.trim()
    if (headingText) blocks.push(heading(headingText))

    for (const text of section.paragraphs ?? []) {
      const trimmed = text?.trim()
      if (trimmed) blocks.push(paragraph(trimmed))
    }

    const bullets = (section.bullets ?? []).filter((bullet) => bullet?.trim())
    if (bullets.length > 0) blocks.push(list(bullets))
  }

  const sourcesHtml = renderSources(input.sources)
  if (sourcesHtml) blocks.push(sourcesHtml)

  const html = blocks.join('\n\n')

  // Word count excludes the sources block, which is metadata rather than prose,
  // so the 500-900 word target measures the article the reader actually reads.
  const proseWords = wordCount(
    input.sections
      .flatMap((section) => [...(section.paragraphs ?? []), ...(section.bullets ?? [])])
      .join(' '),
  )

  return { html, wordCount: proseWords }
}

/** Plain-text rendering of the body, for the editor pass and word counting. */
export function sectionsToPlainText(sections: ArticleSection[]): string {
  const parts: string[] = []
  for (const section of sections) {
    if (section.heading) parts.push(`## ${section.heading}`)
    for (const text of section.paragraphs ?? []) parts.push(text)
    for (const bullet of section.bullets ?? []) parts.push(`- ${bullet}`)
  }
  return parts.join('\n\n')
}

/** Evidence rows reduced to what the Sources block needs. */
export function sourcesFromEvidence(evidence: SourceEvidence[]): RenderSourcesInput[] {
  return evidence.map((item) => ({
    url: item.url,
    publisher: item.publisher,
    title: item.title,
    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
  }))
}
