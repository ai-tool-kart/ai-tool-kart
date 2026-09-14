/*
 * Structured output schemas for the five LLM tasks (NEWS_AGENT.md §13).
 *
 * Every model response in the pipeline is validated against one of these. A
 * closed schema is also the structural half of the prompt-injection defence
 * (§28): injected text can try to change what the model SAYS, but it cannot make
 * a response validate against a shape it does not fit, and anything off-schema is
 * rejected rather than acted on.
 *
 * `.strict()` everywhere is deliberate — an unexpected key is a signal that the
 * model went off-contract, not something to quietly ignore.
 */

import { z } from 'zod'
import { EDITORIAL_CATEGORIES } from '../config/editorial.ts'
import { ARTICLE, SEO } from '../config/limits.ts'

/** Bumped when a schema changes shape; persisted with each draft. */
export const ARTICLE_SCHEMA_VERSION = 1

const score = z.number().min(0).max(10)

/* ── 1. Classifier ────────────────────────────────────────────────────────── */

export const ClassificationSchema = z
  .object({
    relevance: score,
    importance: score,
    novelty: score,
    category: z.enum(EDITORIAL_CATEGORIES),
    reasoning: z.string().min(1).max(400),
    recommendation: z.enum(['proceed', 'skip']),
  })
  .strict()

export type Classification = z.infer<typeof ClassificationSchema>

/* ── 2. Fact extractor ────────────────────────────────────────────────────── */

export const CLAIM_TYPES = [
  'launch',
  'capability',
  'pricing',
  'date',
  'benchmark',
  'quote',
  'funding',
  'other',
] as const

export const ExtractedClaimSchema = z
  .object({
    /** One atomic factual statement. Not a summary, not a conclusion. */
    text: z.string().min(10).max(400),
    claimType: z.enum(CLAIM_TYPES),
    /** Verbatim span from the source that supports the claim. */
    supportingQuote: z.string().max(400).optional(),
  })
  .strict()

export const ExtractionSchema = z
  .object({
    claims: z.array(ExtractedClaimSchema).max(25),
    /** Set when the source contained instructions aimed at the model (§28). */
    containsInstructions: z.boolean(),
  })
  .strict()

export type Extraction = z.infer<typeof ExtractionSchema>

/* ── 3. Verifier ──────────────────────────────────────────────────────────── */

export const VerifiedClaimSchema = z
  .object({
    claimId: z.string().min(1).max(64),
    supportLevel: z.enum(['verified', 'single-source', 'unsupported', 'conflicting']),
    /** URLs from the supplied evidence that support this claim. */
    supportingUrls: z.array(z.string()).max(10),
    /** Required when supportLevel is 'conflicting'. */
    conflictNote: z.string().max(400).optional(),
  })
  .strict()

export const VerificationSchema = z
  .object({
    claims: z.array(VerifiedClaimSchema).max(30),
    /** The single most important claim the story rests on. */
    coreClaimId: z.string().max(64).optional(),
    summary: z.string().max(400),
  })
  .strict()

export type Verification = z.infer<typeof VerificationSchema>

/* ── 3b. SEO brief ────────────────────────────────────────────────────────── */

export const SEARCH_INTENTS = ['informational', 'commercial', 'navigational', 'mixed'] as const

/**
 * Structured SEO guidance produced AFTER verification and BEFORE writing.
 *
 * Structured rather than free prose on purpose: every field below is checked
 * deterministically in seo/validate.ts against the verified claim set. A blob of
 * "SEO advice" could not be checked at all, and would become an unauditable
 * channel through which the model could suggest a headline the evidence does not
 * support.
 *
 * Note what is NOT here: no word-count target (that is the article format's job,
 * chosen from evidence) and no keyword density. Both are ways SEO turns into
 * padding.
 */
export const SeoBriefSchema = z
  .object({
    /** The one query this article should answer. Must be grounded in the story. */
    primaryKeyword: z.string().min(2).max(80),
    secondaryKeywords: z.array(z.string().min(2).max(60)).max(SEO.maxSecondaryKeywords),
    searchIntent: z.enum(SEARCH_INTENTS),
    /** Headline tuned for search. Still bound by the facts. */
    seoTitle: z.string().min(10).max(SEO.seoTitleHardMaxChars),
    metaDescription: z
      .string()
      .min(SEO.metaDescriptionMinChars)
      .max(SEO.metaDescriptionMaxChars),
    /** Normalised by slugify() afterwards; the model never sets the final URL. */
    suggestedSlug: z.string().min(3).max(120),
    /** Must map to material the verified claims actually support. */
    suggestedHeadings: z.array(z.string().min(2).max(80)).max(SEO.maxSuggestedHeadings),
    /**
     * Chosen from a supplied allowlist of real site routes. The model picks from
     * a menu; it never composes a URL (§7 of the SEO brief).
     */
    internalLinkTargets: z.array(z.string().max(200)).max(SEO.maxInternalLinks),
  })
  .strict()

export type SeoBriefOutput = z.infer<typeof SeoBriefSchema>

/* ── 4. Writer ────────────────────────────────────────────────────────────── */

/**
 * A section is prose or bullets, never HTML. The renderer turns this into
 * allowlisted markup; the model is never asked for markup at all (§16).
 */
export const ArticleSectionSchema = z
  .object({
    heading: z.string().min(2).max(80),
    paragraphs: z.array(z.string().min(20).max(1500)).max(8).optional(),
    bullets: z.array(z.string().min(5).max(400)).max(10).optional(),
  })
  .strict()
  .refine(
    (section) => (section.paragraphs?.length ?? 0) + (section.bullets?.length ?? 0) > 0,
    { message: 'section must contain at least one paragraph or bullet' },
  )

export const ArticleDraftSchema = z
  .object({
    title: z.string().min(10).max(ARTICLE.titleMaxChars),
    excerpt: z.string().min(ARTICLE.excerptMinChars).max(ARTICLE.excerptMaxChars),
    category: z.enum(EDITORIAL_CATEGORIES),
    /** Entity tags. Filtered against the closed vocabulary after validation. */
    tags: z.array(z.string().min(2).max(40)).min(1).max(8),
    sections: z.array(ArticleSectionSchema).min(3).max(9),
    /** Claim ids the draft actually used, for the traceability record. */
    usedClaimIds: z.array(z.string().max(64)).max(30),
  })
  .strict()

export type WriterOutput = z.infer<typeof ArticleDraftSchema>

/*
 * Slug is NOT in the writer schema on purpose. Slugs are generated
 * deterministically in application code (generation/slug.ts) so a retry cannot
 * produce a different URL for the same story.
 */

/* ── 5. Editor ────────────────────────────────────────────────────────────── */

export const EditorialIssueSchema = z
  .object({
    severity: z.enum(['blocking', 'minor']),
    kind: z.enum([
      'unsupported-claim',
      'overstated-claim',
      'misleading-headline',
      'missing-attribution',
      'hype',
      'duplicate',
      'structure',
      'grammar',
    ]),
    detail: z.string().min(5).max(400),
  })
  .strict()

export const EditorialReviewSchema = z
  .object({
    verdict: z.enum(['approved', 'needs-revision', 'rejected']),
    confidence: z.number().min(0).max(1),
    issues: z.array(EditorialIssueSchema).max(20),
    notes: z.string().max(800),
  })
  .strict()

export type EditorialReview = z.infer<typeof EditorialReviewSchema>

/**
 * Renders a schema as JSON Schema for the prompt.
 *
 * The model is told the exact shape rather than being asked to infer it, which
 * is what makes a repair retry meaningful when validation fails.
 */
export function describeSchema(schema: z.ZodType<unknown>): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema, { io: 'output' }), null, 2)
  } catch {
    return '{}'
  }
}
