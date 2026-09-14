/*
 * SEO brief production.
 *
 * Sits between verification and writing. Everything the model returns passes
 * through application-level normalisation here before anything downstream sees
 * it: the slug is re-derived deterministically, internal links are filtered
 * against the route registry, and per-format shape limits are applied.
 *
 * Failure is never fatal to the story. An article without an SEO brief is an
 * article that ranks less well; an article blocked because SEO was unavailable
 * is a factual story lost to a cosmetic concern. So a failed brief degrades to
 * `undefined` and the writer proceeds without it.
 */

import { SEO_BY_FORMAT, type ArticleFormat } from '../config/limits.ts'
import type { Claim, SeoBrief, SourceEvidence } from '../domain/types.ts'
import { slugify } from '../generation/slug.ts'
import type { LLMClient } from '../llm/client.ts'
import { SeoBriefSchema } from '../llm/schemas.ts'
import { SEO_SYSTEM, seoUserPrompt } from '../llm/prompts/index.ts'
import type { Logger } from '../utils/logger.ts'
import { buildLinkRegistry, retainKnownRoutes, type InternalRoute } from './routes.ts'

export interface SeoBriefInput {
  storyTitle: string
  category: string
  format: ArticleFormat
  claims: Claim[]
  evidence: SourceEvidence[]
  /** Entity names already derived by the pipeline (tag vocabulary). */
  entities: string[]
  /** Slugs of our own published articles — the only verifiable blog links. */
  publishedArticles?: Array<{ slug: string; title: string }>
}

export interface SeoBriefDeps {
  llm: LLMClient
  logger: Logger
}

export async function buildSeoBrief(
  input: SeoBriefInput,
  deps: SeoBriefDeps,
): Promise<SeoBrief | undefined> {
  const { llm, logger } = deps
  const log = logger.child({ step: 'seo' })

  // Only verified claims ground the brief. Single-source material can appear in
  // the article with attribution, but it must not be what a headline rests on.
  const verified = input.claims.filter((claim) => claim.supportLevel === 'verified')
  if (verified.length === 0) {
    log.info('Skipping SEO brief: no verified claims to ground it')
    return undefined
  }

  const shape = SEO_BY_FORMAT[input.format] ?? SEO_BY_FORMAT.standard
  const registry: InternalRoute[] = buildLinkRegistry({
    ...(input.publishedArticles ? { publishedSlugs: input.publishedArticles } : {}),
  })

  let output
  try {
    const response = await llm.run({
      task: 'seo',
      system: SEO_SYSTEM,
      user: seoUserPrompt({
        storyTitle: input.storyTitle,
        category: input.category,
        format: input.format,
        maxHeadings: shape.maxHeadings,
        maxSecondaryKeywords: shape.maxSecondaryKeywords,
        claims: verified.map((claim) => ({
          id: claim.id,
          text: claim.text,
          supportLevel: claim.supportLevel,
        })),
        entities: input.entities,
        evidence: input.evidence.map((item) => ({
          publisher: item.publisher,
          trustTier: item.trustTier,
        })),
        availableRoutes: registry,
      }),
      schema: SeoBriefSchema,
      schemaName: 'SeoBrief',
      temperature: 0.2,
    })
    output = { data: response.data, model: `${llm.providerId}:${response.model}` }
  } catch (error) {
    /*
     * Degrade, do not fail. The story is factually complete by this point; SEO
     * is an enhancement, and losing a verified article because a metadata call
     * timed out would be the wrong trade.
     */
    log.warn('SEO brief unavailable; continuing without one', {
      err: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }

  const raw = output.data

  // The model proposes a slug; application code decides it. Same normalisation
  // the article URL uses, so the two can never disagree about what is legal.
  const suggestedSlug = slugify(raw.suggestedSlug)

  const { kept, dropped } = retainKnownRoutes(
    raw.internalLinkTargets,
    registry,
    shape.maxInternalLinks,
  )
  if (dropped.length > 0) {
    log.info('Dropped internal link suggestions that name no known route', {
      dropped: dropped.slice(0, 4),
    })
  }

  const brief: SeoBrief = {
    primaryKeyword: raw.primaryKeyword.trim(),
    // Trim to the format's shape rather than the schema maximum, so a brief
    // cannot be handed a standard article's keyword spread.
    secondaryKeywords: raw.secondaryKeywords
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .slice(0, shape.maxSecondaryKeywords),
    searchIntent: raw.searchIntent,
    seoTitle: raw.seoTitle.trim(),
    metaDescription: raw.metaDescription.trim(),
    suggestedSlug,
    suggestedHeadings: raw.suggestedHeadings
      .map((heading) => heading.trim())
      .filter(Boolean)
      .slice(0, shape.maxHeadings),
    internalLinkTargets: kept,
    ...(dropped.length > 0 ? { droppedLinkTargets: dropped } : {}),
    model: output.model,
  }

  log.info('SEO brief created', {
    format: input.format,
    primaryKeyword: brief.primaryKeyword,
    secondaryKeywords: brief.secondaryKeywords.length,
    intent: brief.searchIntent,
    headings: brief.suggestedHeadings.length,
    internalLinks: brief.internalLinkTargets.length,
    model: output.model,
  })

  return brief
}
