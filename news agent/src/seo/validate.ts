/*
 * Deterministic SEO validation.
 *
 * This is the module that makes the SEO layer safe. The prompt ASKS the model
 * not to overstate; this file ENFORCES it, in code, against the verified claim
 * set. Anything the pipeline actually relies on is checked here rather than
 * trusted to instructions.
 *
 * ── The one-way rule ─────────────────────────────────────────────────────────
 *
 * SEO validation can only ADD issues. It can never clear one, never raise a
 * verdict, and never turn a factually-rejected draft into an approved one.
 * Search performance is not a reason to publish something untrue, so the
 * factual editor's verdict is a ceiling that SEO can lower and never lift.
 * `mergeSeoIntoVerdict` below is the only place the two meet, and it is
 * deliberately monotonic.
 */

import {
  SEO,
  SEO_BY_FORMAT,
  UNSUPPORTED_SUPERLATIVES,
  type ArticleFormat,
} from '../config/limits.ts'
import type { Claim, SeoBrief } from '../domain/types.ts'
import { slugify } from '../generation/slug.ts'
import { containsWord } from '../editorial/tags.ts'

export interface SeoValidationInput {
  seo: SeoBrief
  /** The article as it will be published. */
  title: string
  excerpt: string
  headings: string[]
  bodyText: string
  format: ArticleFormat
  /** Verified claims — the grounding corpus for every SEO assertion. */
  claims: Claim[]
  storyTitle: string
}

export interface SeoValidationResult {
  /** Materially misleading. These prevent approval. */
  blocking: string[]
  /** Worth a reviewer's attention; never prevents approval on its own. */
  advisory: string[]
}

/** Everything the story is allowed to assert, lowercased for matching. */
function groundingCorpus(claims: Claim[], storyTitle: string): string {
  return [storyTitle, ...claims.map((claim) => claim.text)].join(' ').toLowerCase()
}

/** Tokens worth grounding. Stopwords would match everything and prove nothing. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'is', 'are',
  'was', 'were', 'be', 'by', 'at', 'from', 'as', 'it', 'its', 'this', 'that', 'new',
  'now', 'how', 'what', 'why', 'who', 'when', 'update', 'updates', 'news',
])

function significantTokens(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9.+-]+/)
    .map((token) => token.replace(/^[.+-]+|[.+-]+$/g, ''))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token))
}

/**
 * Is this phrase actually about the story?
 *
 * Requires a MAJORITY of significant tokens to appear in the verified material.
 * Requiring all of them would reject reasonable paraphrases ("deprecation" for
 * "deprecated"); requiring one would let "best ai tools 2026" pass on the word
 * "ai" alone.
 */
function isGrounded(phrase: string, corpus: string): boolean {
  const tokens = significantTokens(phrase)
  if (tokens.length === 0) return false
  const present = tokens.filter((token) => corpus.includes(token)).length
  return present * 2 >= tokens.length
}

/** Superlatives are permitted only where the source itself used the word. */
function unsupportedSuperlatives(text: string, corpus: string): string[] {
  const lower = text.toLowerCase()
  return UNSUPPORTED_SUPERLATIVES.filter(
    (word) => containsWord(lower, word) && !containsWord(corpus, word),
  )
}

export function validateSeo(input: SeoValidationInput): SeoValidationResult {
  const blocking: string[] = []
  const advisory: string[] = []
  const { seo } = input
  const corpus = groundingCorpus(input.claims, input.storyTitle)
  const shape = SEO_BY_FORMAT[input.format] ?? SEO_BY_FORMAT.standard

  /* ── Blocking: anything materially misleading ───────────────────────────── */

  // 1. A keyword that is not about this story sends the wrong readers here and
  //    misrepresents the article in results.
  if (!isGrounded(seo.primaryKeyword, corpus)) {
    blocking.push(
      `seo-ungrounded-keyword: primary keyword "${seo.primaryKeyword}" is not supported by the verified claims`,
    )
  }

  // 2. Superlatives assert a ranking over competitors we never evaluated.
  for (const [field, text] of [
    ['seoTitle', seo.seoTitle],
    ['metaDescription', seo.metaDescription],
    ['primaryKeyword', seo.primaryKeyword],
  ] as const) {
    const found = unsupportedSuperlatives(text, corpus)
    if (found.length > 0) {
      blocking.push(
        `seo-unsupported-superlative: ${field} claims ${found.map((word) => `"${word}"`).join(', ')} with no verified basis`,
      )
    }
  }
  for (const keyword of seo.secondaryKeywords) {
    const found = unsupportedSuperlatives(keyword, corpus)
    if (found.length > 0) {
      blocking.push(
        `seo-unsupported-superlative: secondary keyword "${keyword}" asserts ${found.map((w) => `"${w}"`).join(', ')}`,
      )
    }
  }

  // 3. An SEO title that the claims do not support is the highest-impact place
  //    to overstate, because it is what most readers see.
  if (!isGrounded(seo.seoTitle, corpus)) {
    blocking.push(
      `seo-misleading-title: SEO title is not supported by the verified claims`,
    )
  }

  // 4. Required metadata.
  if (!seo.metaDescription.trim()) {
    blocking.push('seo-missing-meta-description')
  }
  if (!seo.primaryKeyword.trim()) {
    blocking.push('seo-missing-primary-keyword')
  }

  // 5. A malformed slug is a broken URL.
  const normalized = slugify(seo.suggestedSlug)
  if (!normalized || normalized === 'ai-tool-kart-news') {
    blocking.push(`seo-malformed-slug: "${seo.suggestedSlug}" does not normalise to a usable slug`)
  }

  // 6. Intent that misrepresents what the article delivers. A commercial promise
  //    over a changelog note is a bait-and-switch in search results.
  if (seo.searchIntent === 'commercial' && input.format === 'brief') {
    advisory.push(
      'seo-intent-mismatch: commercial intent declared for a brief; verify the article supports an evaluation decision',
    )
  }

  // 7. Stuffing, measured as repeats rather than density.
  const primary = seo.primaryKeyword.toLowerCase()
  const surfaces = [input.title, seo.seoTitle, seo.metaDescription, ...input.headings]
    .join(' ')
    .toLowerCase()
  const repeats = primary ? surfaces.split(primary).length - 1 : 0
  if (repeats > SEO.maxPrimaryKeywordRepeats) {
    blocking.push(
      `seo-keyword-stuffing: primary keyword appears ${repeats} times across title, headings and meta (max ${SEO.maxPrimaryKeywordRepeats})`,
    )
  }

  const duplicateSecondaries = seo.secondaryKeywords.filter(
    (keyword: string) => keyword.trim().toLowerCase() === primary,
  )
  if (duplicateSecondaries.length > 0) {
    blocking.push('seo-keyword-stuffing: a secondary keyword repeats the primary keyword verbatim')
  }

  /* ── Advisory: worth a look, never a reason to reject good journalism ───── */

  if (seo.metaDescription.length < SEO.metaDescriptionMinChars) {
    advisory.push(`seo-meta-description-short (${seo.metaDescription.length} chars)`)
  }
  if (seo.metaDescription.length > SEO.metaDescriptionMaxChars) {
    advisory.push(`seo-meta-description-long (${seo.metaDescription.length} chars)`)
  }
  if (seo.seoTitle.length > SEO.seoTitleMaxChars) {
    advisory.push(
      `seo-title-long (${seo.seoTitle.length} chars, truncated in results beyond ${SEO.seoTitleMaxChars})`,
    )
  }

  // Placement is a quality signal, not a correctness one.
  const inTitle = input.title.toLowerCase().includes(primary) || isGrounded(primary, input.title.toLowerCase())
  if (!inTitle) {
    advisory.push('seo-keyword-not-in-title: the primary keyword does not appear in the headline')
  }
  const inHeadings = input.headings.some((heading) => isGrounded(primary, heading.toLowerCase()))
  if (!inHeadings && input.format !== 'brief') {
    advisory.push('seo-keyword-not-in-heading: no heading reflects the primary keyword')
  }
  const introduction = input.bodyText.slice(0, 600).toLowerCase()
  if (!isGrounded(primary, introduction)) {
    advisory.push('seo-keyword-not-in-intro: the primary keyword is absent from the opening')
  }

  // Headings the article cannot fill are how SEO becomes padding.
  const ungroundedHeadings = seo.suggestedHeadings.filter(
    (heading: string) => !isGrounded(heading, corpus),
  )
  if (ungroundedHeadings.length > 0) {
    advisory.push(
      `seo-heading-not-grounded: suggested heading(s) ${ungroundedHeadings.map((h) => `"${h}"`).join(', ')} have no verified material`,
    )
  }

  if (seo.suggestedHeadings.length > shape.maxHeadings) {
    advisory.push(
      `seo-too-many-headings (${seo.suggestedHeadings.length} suggested, ${input.format} allows ${shape.maxHeadings})`,
    )
  }
  if (seo.secondaryKeywords.length > shape.maxSecondaryKeywords) {
    advisory.push(
      `seo-too-many-secondary-keywords (${seo.secondaryKeywords.length}, ${input.format} allows ${shape.maxSecondaryKeywords})`,
    )
  }

  return { blocking, advisory }
}

/**
 * Folds SEO findings into the factual verdict, in one direction only.
 *
 * An SEO problem can hold back a factually sound article; a clean SEO brief can
 * never advance a draft the editor did not approve. Written as an explicit
 * function so the asymmetry is testable rather than incidental.
 */
export function mergeSeoIntoVerdict(
  factualVerdict: 'approved' | 'needs-revision' | 'rejected',
  seoBlocking: string[],
): 'approved' | 'needs-revision' | 'rejected' {
  if (factualVerdict !== 'approved') return factualVerdict
  return seoBlocking.length > 0 ? 'needs-revision' : 'approved'
}
