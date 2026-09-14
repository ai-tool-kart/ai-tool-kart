/*
 * Article generation (NEWS_AGENT.md §15, §16).
 *
 * Turns verified claims into a validated ArticleDraft. The model contributes
 * structured text; everything with a correctness requirement — slug, HTML, tag
 * vocabulary, word count, source list — is produced by code here.
 */

import { ARTICLE, MAX_REVISION_ATTEMPTS, type ArticleFormat } from '../config/limits.ts'
import { isEditorialCategory, type EditorialCategory } from '../config/editorial.ts'
import type { ArticleDraft, CandidateStory, Claim, SourceEvidence } from '../domain/types.ts'
// Tag vocabulary, normalisation and validation live in one module (§20), shared
// with the WordPress taxonomy layer so both sides agree on what a tag is.
import { normalizeTags } from '../editorial/tags.ts'
import { formatRange } from '../editorial/format.ts'
import { storyError } from '../domain/errors.ts'
import type { LLMClient } from '../llm/client.ts'
import { ARTICLE_SCHEMA_VERSION, ArticleDraftSchema } from '../llm/schemas.ts'
import { WRITER_SYSTEM, writerUserPrompt } from '../llm/prompts/index.ts'
import { articleId as makeArticleId } from '../utils/ids.ts'
import type { Logger } from '../utils/logger.ts'
import { nowIso } from '../utils/time.ts'
import { renderArticleHtml, sectionsToPlainText, sourcesFromEvidence } from './render.ts'
import { uniqueSlug } from './slug.ts'

export interface WriteDeps {
  llm: LLMClient
  logger: Logger
  /** Slug collision check, supplied by the article repository. */
  isSlugTaken: (slug: string) => boolean
}

export interface WriteInput {
  story: CandidateStory
  claims: Claim[]
  evidence: SourceEvidence[]
  category: EditorialCategory
  /**
   * Evidence-derived length band, decided by editorial/format.ts before writing.
   * Passed in rather than computed here so the writer and the editor judge the
   * same draft against the same range, and so a revision cannot drift into a
   * different format.
   */
  format: ArticleFormat
  /** Editor feedback on a revision pass. */
  revisionNotes?: string[]
  /** Preserved across revisions so the URL never changes. */
  existingSlug?: string
  revisionCount?: number
}

export async function writeArticle(input: WriteInput, deps: WriteDeps): Promise<ArticleDraft> {
  const { llm, logger, isSlugTaken } = deps
  const log = logger.child({ step: 'write', storyId: input.story.id })

  const usable = input.claims.filter(
    (claim) => claim.supportLevel === 'verified' || claim.supportLevel === 'single-source',
  )
  const conflicting = input.claims.filter((claim) => claim.supportLevel === 'conflicting')

  if (usable.length === 0) {
    throw storyError('VERIFICATION_FAILED', 'No usable claims to write from', {
      storyId: input.story.id,
    })
  }

  const publishersByUrl = new Map(input.evidence.map((item) => [item.url, item.publisher]))
  const claimInputs = [...usable, ...conflicting].map((claim) => ({
    id: claim.id,
    text: claim.text,
    claimType: claim.claimType,
    supportLevel: claim.supportLevel,
    publishers: claim.evidenceUrls
      .map((url) => publishersByUrl.get(url))
      .filter((publisher): publisher is string => Boolean(publisher)),
    ...(claim.conflictNote ? { conflictNote: claim.conflictNote } : {}),
  }))

  const range = formatRange(input.format)

  const response = await llm.run({
    task: 'write',
    system: WRITER_SYSTEM,
    user: writerUserPrompt({
      storyTitle: input.story.title,
      category: input.category,
      format: input.format,
      targetMinWords: range.minWords,
      targetMaxWords: range.maxWords,
      claims: claimInputs,
      evidence: input.evidence.map((item) => ({
        url: item.url,
        publisher: item.publisher,
        title: item.title,
        ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
        trustTier: item.trustTier,
      })),
      ...(input.revisionNotes?.length ? { revisionNotes: input.revisionNotes } : {}),
    }),
    schema: ArticleDraftSchema,
    schemaName: 'ArticleDraft',
    temperature: 0.3,
  })

  const output = response.data

  // Category: the writer may refine it, but only within the closed vocabulary.
  const category = isEditorialCategory(output.category) ? output.category : input.category

  const plainText = sectionsToPlainText(output.sections)
  const tags = normalizeTags(output.tags, `${output.title} ${plainText}`)

  const sources = sourcesFromEvidence(input.evidence)
  const rendered = renderArticleHtml({ sections: output.sections, sources })

  /*
   * A runaway draft is a bug, not an article. The soft target is enforced by the
   * prompt and reported by the editor; only the hard ceiling rejects outright.
   */
  if (rendered.wordCount > ARTICLE.hardMaxWords) {
    throw storyError(
      'EDITORIAL_REJECTED',
      `Draft exceeded the hard word ceiling (${rendered.wordCount} > ${ARTICLE.hardMaxWords})`,
      { storyId: input.story.id },
    )
  }

  const articleId = makeArticleId(input.story.id)
  // The slug is fixed on first generation and reused on every revision, so a
  // rewrite never changes the article's URL.
  const slug =
    input.existingSlug ?? uniqueSlug(output.title, (candidate) => isSlugTaken(candidate))

  // Only claims that actually exist count toward traceability.
  const knownClaimIds = new Set(input.claims.map((claim) => claim.id))
  const claimIds = output.usedClaimIds.filter((id) => knownClaimIds.has(id))

  log.info('Draft generated', {
    words: rendered.wordCount,
    format: input.format,
    target: `${range.minWords}-${range.maxWords}`,
    sections: output.sections.length,
    tags: tags.length,
    claimsUsed: claimIds.length,
    model: response.model,
    attempts: response.attempts,
  })

  /*
   * Reported against the ASSIGNED format, not a global minimum. A brief coming
   * in at 200 words is on target, not short; the previous version logged every
   * such article as a failure to reach 500 words it was never asked for.
   */
  if (rendered.wordCount < range.minWords) {
    log.info('Draft is below its format target', {
      words: rendered.wordCount,
      format: input.format,
      target: range.minWords,
      note: 'Expected when the verified claims run out first; padding is not an acceptable fix.',
    })
  }

  return {
    id: articleId,
    storyId: input.story.id,
    title: output.title.trim(),
    slug,
    excerpt: output.excerpt.trim(),
    sections: output.sections,
    content: rendered.html,
    category,
    tags,
    sourceUrls: input.evidence.map((item) => item.url),
    claimIds,
    wordCount: rendered.wordCount,
    generatedAt: nowIso(),
    model: `${llm.providerId}:${response.model}`,
    format: input.format,
    schemaVersion: ARTICLE_SCHEMA_VERSION,
    confidence: 0,
    editorialStatus: 'pending',
    revisionCount: input.revisionCount ?? 0,
  }
}

export const MAX_REVISIONS = MAX_REVISION_ATTEMPTS
