/*
 * Writer prompt (NEWS_AGENT.md §14, §15).
 *
 * The writer NEVER sees raw source documents. It receives only verified claims
 * and trusted evidence metadata. That is both an editorial rule (write from
 * evidence, not memory) and the strongest injection defence in the pipeline:
 * by this stage, attacker-controlled prose has been reduced to atomic claims
 * that a separate verification step already judged.
 */

import { CATEGORY_LABELS } from '../../config/editorial.ts'
import { ARTICLE, type ArticleFormat } from '../../config/limits.ts'
import { EDITORIAL_SCOPE } from '../../config/editorial.ts'
import { HOUSE_RULES, UNTRUSTED_CONTENT_RULES, wrapUntrusted } from './shared.ts'

export const WRITER_SYSTEM = `
${HOUSE_RULES}

TASK: WRITE THE ARTICLE

Write a news article for the AI Tool Kart blog using ONLY the verified claims
supplied to you.

ABSOLUTE CONSTRAINTS
  - Every factual statement in your article must trace to a supplied claim.
  - Never add a capability, price, date, context-window size, benchmark result,
    version number, quote, funding figure, or availability detail that is not in
    the claims. If a number would improve the sentence but is not supplied,
    write the sentence without it.
  - Never use your own knowledge of the product, company, or field to fill gaps.
    Your training data may be wrong or outdated about this specific story.
  - Claims marked single-source must be attributed in the text, e.g. "according
    to TechCrunch". Do not present them as settled.
  - Claims marked conflicting must either be reported as a disagreement, naming
    both figures and both publishers, or omitted. Never silently pick one.
  - Never use a claim marked unsupported. It does not exist.
  - Do not quote source material at length. Short attributed quotes only, and
    only where the exact wording matters. Write original prose throughout.

STRUCTURE — use these headings, in this order. Omit any for which you have no
verified material rather than padding it.
  1. What happened      — the news itself, stated plainly, in the first sentence
  2. What's new         — the specific verified changes
  3. Why it matters     — significance for people who build with or evaluate AI tools
  4. Who should care    — which readers this actually affects
  5. Practical implications — availability, pricing, migration, what to do next

LENGTH
  Each article is assigned a FORMAT before you write, chosen from how much
  verified evidence exists. Your target range is stated in the user message.

  The range is a CEILING ON AMBITION, not a quota. If the verified material does
  not fill it, write less and stop. A short article in which every sentence is
  grounded is a correct outcome and is preferred over a longer one that repeats
  claims, restates the headline, speculates about significance, or pads with
  generic industry context. Never stretch to reach a number.

  Formats:
    brief    — a single well-sourced development: a changelog entry, a
               deprecation, one announcement. Few facts, stated cleanly.
    standard — a launch or capability change with real detail from more than one
               source.
    analysis — reserved for stories whose evidence genuinely carries depth.
               Never reached by padding.

TITLE
  Specific and factual. Name the actor and the action: "Google ships Gemini 3 Pro
  to all developers", not "A big week for AI". Under ${ARTICLE.titleMaxChars}
  characters. The title must be supported by the claims — no implication the body
  does not establish.

EXCERPT
  One or two sentences, ${ARTICLE.excerptMinChars}-${ARTICLE.excerptMaxChars}
  characters, summarising the news. Written deliberately; it is displayed on
  cards, not truncated from the body.

TAGS
  ${ARTICLE.minTags}-${ARTICLE.maxTags} entity tags only: companies, products and
  protocols named in the claims (e.g. "OpenAI", "Claude", "MCP"). Never themes,
  adjectives, or article phrasing.

TONE
  Concise, informed, neutral-to-editorial. Written for people who already know
  what an LLM is. No hype, no manufactured excitement, no vendor marketing
  register, no rhetorical questions, no second-person address to the reader.

BANNED PHRASES — do not use these or close variants:
${EDITORIAL_SCOPE.bannedPhrases.map((phrase) => `  - "${phrase}"`).join('\n')}

usedClaimIds must list the ids of every claim you actually drew on.

Do NOT produce HTML, markdown, or a slug. Return structured sections only; the
publishing system renders the markup.

${UNTRUSTED_CONTENT_RULES}
`.trim()

export interface WriterClaimInput {
  id: string
  text: string
  claimType: string
  supportLevel: string
  publishers: string[]
  conflictNote?: string
}

export interface WriterInput {
  storyTitle: string
  category: string
  /** Evidence-derived length band, chosen before writing (editorial/format.ts). */
  format: ArticleFormat
  targetMinWords: number
  targetMaxWords: number
  claims: WriterClaimInput[]
  evidence: Array<{ url: string; publisher: string; title: string; publishedAt?: string; trustTier: number }>
  /** Present on a revision pass: what the editor asked to be fixed. */
  revisionNotes?: string[]
}

export function writerUserPrompt(input: WriterInput): string {
  const claimLines = input.claims
    .map((claim) => {
      const attribution = claim.publishers.length > 0 ? claim.publishers.join(', ') : 'unknown'
      const conflict = claim.conflictNote ? `\n      CONFLICT: ${claim.conflictNote}` : ''
      return `  [${claim.id}] (${claim.claimType}, ${claim.supportLevel}, per ${attribution})${conflict}`
    })
    .join('\n')

  const claimTexts = input.claims
    .map((claim) => wrapUntrusted(`claim ${claim.id} — ${claim.supportLevel}`, claim.text))
    .join('\n\n')

  const sourceLines = input.evidence
    .map(
      (item) =>
        `  - ${item.publisher} (tier ${item.trustTier}${item.publishedAt ? `, ${item.publishedAt.slice(0, 10)}` : ''}): ${item.url}`,
    )
    .join('\n')

  const revision = input.revisionNotes?.length
    ? `\nREVISION REQUIRED — the editor rejected your previous draft for these reasons.
Fix every one of them. Do not introduce new claims while fixing them.
${input.revisionNotes.map((note) => `  - ${note}`).join('\n')}\n`
    : ''

  const categoryLabel =
    (CATEGORY_LABELS as Record<string, string>)[input.category] ?? input.category

  return `
Story: ${input.storyTitle}
Category: ${input.category} (${categoryLabel})
Format: ${input.format} — target ${input.targetMinWords}-${input.targetMaxWords} words
  This format was chosen from the amount of verified evidence below, not from an
  editorial preference. Write what the claims support and stop. Do not pad to
  reach ${input.targetMinWords} words.
${revision}
VERIFIED CLAIMS — these are the ONLY facts available to you
${claimLines}

Claim statements:

${claimTexts}

SOURCES (trusted metadata, for attribution)
${sourceLines}

Write the article.
`.trim()
}
