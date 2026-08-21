/*
 * Classifier prompt (NEWS_AGENT.md §13).
 *
 * Narrow job: score one candidate story and assign a category. It decides
 * nothing — the pipeline combines this output with deterministic signals, hard
 * gates and cost caps before anything is written.
 */

import { CATEGORY_LABELS, EDITORIAL_CATEGORIES, EDITORIAL_SCOPE } from '../../config/editorial.ts'
import { HOUSE_RULES, UNTRUSTED_CONTENT_RULES, wrapUntrusted } from './shared.ts'

const categoryList = EDITORIAL_CATEGORIES.map((id) => `  ${id} — ${CATEGORY_LABELS[id]}`).join('\n')

export const CLASSIFIER_SYSTEM = `
${HOUSE_RULES}

TASK: TRIAGE

You are triaging one candidate news story for the AI Tool Kart blog. Score it on
three axes and assign the single best category.

SCORING (0-10 each)

relevance — Would an AI Tool Kart reader care? The test is behavioural: would a
  developer or designer who uses AI tools daily do something differently after
  reading this? Score 8+ only if the answer is clearly yes.

importance — How significant is the development itself? A new flagship model or
  a major capability change is high. A minor version bump, a blog post about a
  customer, or a conference recap is low.

novelty — Is this a genuinely new development, or a rehash? Coverage of an event
  that was already widely reported days ago is low novelty even if important.

IN SCOPE
${EDITORIAL_SCOPE.includedTopics.map((rule) => `  - ${rule.id}`).join('\n')}

OUT OF SCOPE — score these low
  - generic tech news with no AI-product angle
  - stock movements, earnings, and market commentary
  - speculation and rumours ("reportedly", "sources say", "could launch")
  - personality-driven commentary and industry drama
  - opinion with no underlying factual development
  - listicles, tips roundups, and SEO filler
  - funding news that does not change a product our readers use

CATEGORIES — choose exactly one
${categoryList}

recommendation: "proceed" if this is worth investigating further, "skip"
otherwise. This is advice; the pipeline makes the actual decision.

reasoning: one sentence, under 300 characters, explaining the scores.

${UNTRUSTED_CONTENT_RULES}
`.trim()

export interface ClassifierInput {
  title: string
  summaries: Array<{ publisher: string; text: string }>
  publishers: string[]
  ageHours: number
  bestTier: number
}

export function classifierUserPrompt(input: ClassifierInput): string {
  const sourceBlocks = input.summaries
    .map((entry) => wrapUntrusted(entry.publisher, entry.text))
    .join('\n\n')

  /*
   * Publisher names, tier and age are OUR metadata, derived from the source
   * registry rather than from fetched content, so they sit outside the untrusted
   * region. The headline and summaries came from the feed and go inside it.
   */
  return `
Candidate story metadata (from our own source registry, trusted):
  publishers: ${input.publishers.join(', ') || 'unknown'}
  best source tier: ${input.bestTier} (1 = official/primary, 2 = reputable press, 3 = signal only)
  age: ${Number.isFinite(input.ageHours) ? `${Math.round(input.ageHours)} hours` : 'unknown'}

Headline and summaries as published by the sources:

${wrapUntrusted('headline', input.title)}

${sourceBlocks || '(no summaries available)'}

Score this candidate story.
`.trim()
}
