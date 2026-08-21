/*
 * Article generation (NEWS_AGENT.md §15, §16).
 *
 * Turns verified claims into a validated ArticleDraft. The model contributes
 * structured text; everything with a correctness requirement — slug, HTML, tag
 * vocabulary, word count, source list — is produced by code here.
 */

import { ARTICLE, MAX_REVISION_ATTEMPTS } from '../config/limits.ts'
import { EDITORIAL_SCOPE, isEditorialCategory, type EditorialCategory } from '../config/editorial.ts'
import type { ArticleDraft, CandidateStory, Claim, SourceEvidence } from '../domain/types.ts'
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
  /** Editor feedback on a revision pass. */
  revisionNotes?: string[]
  /** Preserved across revisions so the URL never changes. */
  existingSlug?: string
  revisionCount?: number
}

/**
 * Words that look like tags but are themes, not entities (§20 forbids these).
 * Checked before the proper-noun fallback, which would otherwise let them in.
 */
const NON_ENTITY_TAGS = new Set([
  'ai', 'artificial intelligence', 'machine learning', 'llm', 'llms', 'technology',
  'news', 'update', 'updates', 'launch', 'release', 'model', 'models', 'tools',
  'ai tools', 'software', 'startup', 'innovation', 'future', 'productivity',
  'the', 'new', 'best', 'top', 'guide', 'api', 'apis',
])

/**
 * Accepts a model-proposed tag that is not in the vocabulary.
 *
 * The curated list in config/editorial.ts cannot name every vendor, and treating
 * it as exhaustive made the tag floor unsatisfiable for any company not on it —
 * which blocked publication permanently, since no amount of rewriting can invent
 * a vocabulary entry. So an unknown tag is accepted only if it behaves like a
 * proper noun the article actually discusses: capitalised, short, not a theme
 * word, and present in the text. That keeps §20's "entities, not themes" rule
 * without making it a trap.
 */
function looksLikeEntity(tag: string, haystack: string): boolean {
  const trimmed = tag.trim()
  if (trimmed.length < 2 || trimmed.length > 40) return false
  if (NON_ENTITY_TAGS.has(trimmed.toLowerCase())) return false

  const words = trimmed.split(/\s+/)
  if (words.length > 3) return false
  // Proper nouns and product names: initial capital, or internal capitals/digits
  // as in "OpenAI", "GPT-4", "Aurora 2".
  const properNoun = words.every((word) => /^[A-Z0-9][\w.+-]*$/.test(word))
  if (!properNoun) return false

  return haystack.toLowerCase().includes(trimmed.toLowerCase())
}

/**
 * Normalises model-proposed tags into entity tags.
 *
 * Curated vocabulary first, so "Open AI", "openai" and "OpenAI" collapse to one
 * canonical term and WordPress does not accumulate near-duplicate tags. Unknown
 * proposals then get the proper-noun check above.
 */
/** Whole-word (or whole-phrase) containment, so "meta" never matches "metadata". */
function containsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(haystack)
}

export function normalizeTags(proposed: string[], fallbackText: string): string[] {
  const vocabulary = EDITORIAL_SCOPE.tagEntities
  const resolved = new Set<string>()

  for (const tag of proposed) {
    const canonical = vocabulary[tag.trim().toLowerCase()]
    if (canonical) resolved.add(canonical)
  }

  for (const tag of proposed) {
    if (resolved.size >= ARTICLE.maxTags) break
    const trimmed = tag.trim()
    if (vocabulary[trimmed.toLowerCase()]) continue
    if (looksLikeEntity(trimmed, fallbackText)) resolved.add(trimmed)
  }

  /*
   * Backfill from the article text when the model proposed too few valid tags.
   *
   * Matched on word boundaries, not substrings: a plain `includes` tagged a
   * Google story with "Meta" because the body contained "metadata", and would
   * equally tag anything mentioning "parameters" with "Meta". A wrong tag is a
   * wrong factual association on a published post.
   */
  if (resolved.size < ARTICLE.minTags) {
    const haystack = fallbackText.toLowerCase()
    for (const [key, canonical] of Object.entries(vocabulary)) {
      if (resolved.size >= ARTICLE.maxTags) break
      if (containsWord(haystack, key)) resolved.add(canonical)
    }
  }

  return [...resolved].slice(0, ARTICLE.maxTags)
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

  const response = await llm.run({
    task: 'write',
    system: WRITER_SYSTEM,
    user: writerUserPrompt({
      storyTitle: input.story.title,
      category: input.category,
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
    sections: output.sections.length,
    tags: tags.length,
    claimsUsed: claimIds.length,
    model: response.model,
    attempts: response.attempts,
  })

  if (rendered.wordCount < ARTICLE.minWords) {
    log.warn('Draft is shorter than the editorial target', {
      words: rendered.wordCount,
      target: ARTICLE.minWords,
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
    schemaVersion: ARTICLE_SCHEMA_VERSION,
    confidence: 0,
    editorialStatus: 'pending',
    revisionCount: input.revisionCount ?? 0,
  }
}

export const MAX_REVISIONS = MAX_REVISION_ATTEMPTS
