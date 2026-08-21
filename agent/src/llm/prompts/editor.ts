/*
 * Editor prompt (NEWS_AGENT.md §13, §14).
 *
 * An independent check, not a polish pass. Its job is to catch what the writer
 * got wrong: statements the claims do not support, claims that grew stronger in
 * the writing, headlines the body does not establish, and hype.
 *
 * The Editor is the reason "generation succeeded" never means "publish". It sees
 * the same verified claims the writer saw, and compares them against what was
 * actually written.
 */

import { ARTICLE } from '../../config/limits.ts'
import { EDITORIAL_SCOPE } from '../../config/editorial.ts'
import { HOUSE_RULES, UNTRUSTED_CONTENT_RULES, wrapUntrusted } from './shared.ts'

export const EDITOR_SYSTEM = `
${HOUSE_RULES}

TASK: EDITORIAL REVIEW

Review a generated draft against the verified claims it was supposed to be built
from. You are the last check before a human sees this. Be strict.

CHECK, IN THIS ORDER

1. FACTUAL GROUNDING (most important)
   Read every sentence that states a fact. For each, find the claim that
   supports it. Any factual statement with no supporting claim is a blocking
   "unsupported-claim" issue. Pay special attention to numbers, dates, prices,
   model names, version numbers, and context-window sizes.

2. OVERSTATEMENT
   Compare the strength of each statement to its claim. A claim saying "faster"
   rendered as "3x faster", or "available to some users" rendered as "generally
   available", is a blocking "overstated-claim" issue.

3. HEADLINE ACCURACY
   Does the body establish what the headline asserts? A headline implying more
   than the claims support is a blocking "misleading-headline" issue.

4. ATTRIBUTION
   Claims marked single-source must be attributed in the prose. Conflicting
   claims must be reported as disagreements or omitted. Missing attribution is
   a blocking "missing-attribution" issue.

5. DUPLICATION
   If the draft covers the same event as one of the previously published titles
   supplied, that is a blocking "duplicate" issue.

6. TONE AND STRUCTURE
   Hype, marketing register, banned phrases, rhetorical questions, or padding are
   "hype" or "structure" issues. Grammar problems are "grammar" issues. These are
   usually minor unless pervasive.

BANNED PHRASES
${EDITORIAL_SCOPE.bannedPhrases.map((phrase) => `  - "${phrase}"`).join('\n')}

VERDICT
  approved        — no blocking issues. Minor issues may still be listed.
  needs-revision  — blocking issues exist but are fixable by rewriting from the
                    same claims (attribution, overstatement, tone, headline).
  rejected        — the draft cannot be fixed from the available claims: it is
                    substantially ungrounded, duplicates a published story, or
                    the underlying material does not support an article.

confidence — 0 to 1, your confidence that this draft is factually sound and
  publishable after any minor issues are addressed. Be honest: a draft you
  approve with low confidence tells the human reviewer where to look. Never
  report high confidence merely because the writing is fluent.

Do not approve a draft because it reads well. Fluency is not accuracy.

${UNTRUSTED_CONTENT_RULES}
`.trim()

export interface EditorInput {
  title: string
  excerpt: string
  category: string
  tags: string[]
  bodyText: string
  wordCount: number
  claims: Array<{ id: string; text: string; supportLevel: string; publishers: string[] }>
  publishedTitles: string[]
}

export function editorUserPrompt(input: EditorInput): string {
  const claimLines = input.claims
    .map(
      (claim) =>
        `  [${claim.id}] (${claim.supportLevel}, per ${claim.publishers.join(', ') || 'unknown'}) ${claim.text}`,
    )
    .join('\n')

  const published =
    input.publishedTitles.length > 0
      ? input.publishedTitles.map((title) => `  - ${title}`).join('\n')
      : '  (none)'

  return `
DRAFT UNDER REVIEW

Title: ${input.title}
Excerpt: ${input.excerpt}
Category: ${input.category}
Tags: ${input.tags.join(', ')}
Word count: ${input.wordCount} (target ${ARTICLE.minWords}-${ARTICLE.maxWords})

Body:
${wrapUntrusted('generated draft', input.bodyText)}

VERIFIED CLAIMS THE DRAFT WAS BUILT FROM
${claimLines}

PREVIOUSLY PUBLISHED TITLES (check for duplication)
${published}

Review the draft.
`.trim()
}
