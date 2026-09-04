/*
 * Editorial validation (NEWS_AGENT.md §13, §14; §28-§30 of the implementation brief).
 *
 * Runs the Editor task and then applies deterministic policy on top. Generation
 * succeeding never means approval: a draft is publishable only when the model
 * found no blocking issue AND the deterministic checks agree AND confidence
 * clears the configured floor.
 *
 * The revision loop is bounded at MAX_REVISION_ATTEMPTS. Writer/editor ping-pong
 * is expensive and rarely converges after one pass.
 */

import { ARTICLE, MIN_APPROVAL_CONFIDENCE, MAX_REVISION_ATTEMPTS } from '../config/limits.ts'
import { EDITORIAL_SCOPE } from '../config/editorial.ts'
import type { ArticleDraft, Claim, SourceEvidence } from '../domain/types.ts'
import type { LLMClient } from '../llm/client.ts'
import { EditorialReviewSchema, type EditorialReview } from '../llm/schemas.ts'
import { EDITOR_SYSTEM, editorUserPrompt } from '../llm/prompts/index.ts'
import type { Logger } from '../utils/logger.ts'
import { sectionsToPlainText } from '../generation/render.ts'

export interface ValidationResult {
  verdict: 'approved' | 'needs-revision' | 'rejected'
  confidence: number
  issues: string[]
  blockingIssues: string[]
  /**
   * The subset of blocking issues a rewrite could actually fix.
   *
   * Requesting a revision for anything else burns two LLM calls to produce an
   * identical draft — the writer cannot change how the renderer emits HTML or
   * how many entities the story mentions.
   */
  writerFixableIssues: string[]
  notes: string
}

export interface ValidateDeps {
  llm: LLMClient
  logger: Logger
}

export interface ValidateInput {
  draft: ArticleDraft
  claims: Claim[]
  evidence: SourceEvidence[]
  /** Titles already published, for the duplication check. */
  publishedTitles: string[]
}

/**
 * Deterministic checks the model is not asked to perform.
 *
 * These are properties that can be decided exactly — tag counts, banned phrases,
 * whether the source list is present — so leaving them to a model would be both
 * slower and less reliable.
 */
export interface DeterministicIssues {
  /** Must never reach WordPress. */
  blocking: string[]
  /** Worth telling the human reviewer, but not worth withholding the draft. */
  advisory: string[]
  /** Blocking issues a rewrite could plausibly resolve. */
  writerFixable: string[]
}

export function deterministicChecks(draft: ArticleDraft, claims: Claim[]): DeterministicIssues {
  const blocking: string[] = []
  const advisory: string[] = []
  const writerFixable: string[] = []
  const bodyText = sectionsToPlainText(draft.sections).toLowerCase()

  /*
   * Tag count is ADVISORY, not blocking. Tags degrade gracefully in the React
   * frontend — unlike the category, which the card design depends on — and the
   * tag vocabulary is partly curated, so a story about an unlisted vendor can
   * legitimately end up with one tag. Blocking on it would withhold a sound
   * article over a metadata nicety no rewrite can fix.
   */
  if (draft.tags.length < ARTICLE.minTags) {
    advisory.push(`too-few-tags (${draft.tags.length} < ${ARTICLE.minTags})`)
  }
  if (draft.tags.length > ARTICLE.maxTags) {
    blocking.push(`too-many-tags (${draft.tags.length} > ${ARTICLE.maxTags})`)
  }
  if (!draft.excerpt || draft.excerpt.length < ARTICLE.excerptMinChars) {
    blocking.push('excerpt-too-short')
    writerFixable.push('excerpt-too-short')
  }
  if (draft.sourceUrls.length === 0) {
    blocking.push('no-source-urls')
  }
  if (!draft.content.includes('<h2>Sources</h2>')) {
    blocking.push('missing-sources-section')
  }
  if (draft.claimIds.length === 0 && claims.length > 0) {
    blocking.push('no-claim-traceability')
    writerFixable.push('no-claim-traceability: cite the claim ids you used')
  }

  for (const phrase of EDITORIAL_SCOPE.bannedPhrases) {
    if (bodyText.includes(phrase)) {
      const issue = `banned-phrase:"${phrase}"`
      blocking.push(issue)
      writerFixable.push(issue)
    }
  }

  /*
   * Any HTML tag in the rendered content that is not one this renderer emits
   * would mean model markup leaked through. It cannot happen by construction —
   * every text node is escaped — but the check is cheap and this is the boundary
   * protecting the frontend's dangerouslySetInnerHTML (§16).
   */
  const emitted = [...draft.content.matchAll(/<\/?([a-z][a-z0-9]*)\b/gi)].map((match) =>
    (match[1] ?? '').toLowerCase(),
  )
  const allowed = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'blockquote', 'code'])
  const disallowed = [...new Set(emitted)].filter((tag) => !allowed.has(tag))
  if (disallowed.length > 0) {
    blocking.push(`disallowed-html-tags:${disallowed.join(',')}`)
  }

  return { blocking, advisory, writerFixable }
}

export async function validateDraft(
  input: ValidateInput,
  deps: ValidateDeps,
): Promise<ValidationResult> {
  const { llm, logger } = deps
  const log = logger.child({ step: 'editorial', storyId: input.draft.storyId })

  const publishersByUrl = new Map(input.evidence.map((item) => [item.url, item.publisher]))
  const usableClaims = input.claims.filter((claim) => claim.supportLevel !== 'unsupported')

  let review: EditorialReview
  try {
    const response = await llm.run({
      task: 'edit',
      system: EDITOR_SYSTEM,
      user: editorUserPrompt({
        title: input.draft.title,
        excerpt: input.draft.excerpt,
        category: input.draft.category,
        tags: input.draft.tags,
        bodyText: sectionsToPlainText(input.draft.sections),
        wordCount: input.draft.wordCount,
        claims: usableClaims.map((claim) => ({
          id: claim.id,
          text: claim.text,
          supportLevel: claim.supportLevel,
          publishers: claim.evidenceUrls
            .map((url) => publishersByUrl.get(url))
            .filter((publisher): publisher is string => Boolean(publisher)),
        })),
        publishedTitles: input.publishedTitles,
      }),
      schema: EditorialReviewSchema,
      schemaName: 'EditorialReview',
      temperature: 0,
    })
    review = response.data
  } catch (error) {
    /*
     * If the editor cannot run, the draft is not approved. Failing open here
     * would mean an unreviewed article reaching WordPress, which is precisely
     * what this step exists to prevent.
     */
    log.warn('Editorial review failed; treating draft as rejected', {
      err: error instanceof Error ? error.message : String(error),
    })
    return {
      verdict: 'rejected',
      confidence: 0,
      issues: ['editorial-review-unavailable'],
      blockingIssues: ['editorial-review-unavailable'],
      writerFixableIssues: [],
      notes: 'The editorial validation step could not complete, so the draft was not approved.',
    }
  }

  const modelBlocking = review.issues
    .filter((issue) => issue.severity === 'blocking')
    .map((issue) => `${issue.kind}: ${issue.detail}`)
  const modelMinor = review.issues
    .filter((issue) => issue.severity !== 'blocking')
    .map((issue) => `${issue.kind}: ${issue.detail}`)

  const deterministic = deterministicChecks(input.draft, input.claims)

  /*
   * Word count is reported, not enforced as blocking. A short article built from
   * thin but genuine evidence is better than a padded one, and §15 says as much;
   * the human reviewer sees the note.
   */
  const advisory: string[] = [...deterministic.advisory]
  if (input.draft.wordCount < ARTICLE.minWords) {
    advisory.push(`short-article (${input.draft.wordCount} words, target ${ARTICLE.minWords})`)
  }
  if (input.draft.wordCount > ARTICLE.maxWords) {
    advisory.push(`long-article (${input.draft.wordCount} words, target ${ARTICLE.maxWords})`)
  }

  const blockingIssues = [...modelBlocking, ...deterministic.blocking]
  // Everything the model called blocking is by definition about the prose, so a
  // rewrite is worth attempting; deterministic issues are only sometimes.
  const writerFixableIssues = [...modelBlocking, ...deterministic.writerFixable]
  const allIssues = [...blockingIssues, ...modelMinor, ...advisory]

  let verdict: ValidationResult['verdict'] = review.verdict
  if (blockingIssues.length > 0 && verdict === 'approved') {
    // Deterministic checks override an over-generous model verdict.
    verdict = 'needs-revision'
  }
  if (verdict === 'approved' && review.confidence < MIN_APPROVAL_CONFIDENCE) {
    verdict = 'needs-revision'
    allIssues.push(
      `low-confidence (${review.confidence.toFixed(2)} < ${MIN_APPROVAL_CONFIDENCE})`,
    )
  }

  log.info('Editorial review complete', {
    verdict,
    confidence: review.confidence,
    blocking: blockingIssues.length,
    minor: modelMinor.length,
  })

  return {
    verdict,
    confidence: review.confidence,
    issues: allIssues,
    blockingIssues,
    writerFixableIssues,
    notes: review.notes,
  }
}

/** Whether another writer pass is permitted (§29 of the implementation brief). */
export function canRevise(revisionCount: number): boolean {
  return revisionCount < MAX_REVISION_ATTEMPTS
}
