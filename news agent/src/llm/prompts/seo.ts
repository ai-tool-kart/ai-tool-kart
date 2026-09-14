/*
 * SEO brief prompt (Part A of the SEO + automation milestone).
 *
 * Runs AFTER verification and BEFORE writing, which is the whole point of its
 * position: by the time this task sees the story, the facts are already settled,
 * so SEO can shape how the article is FOUND without any power to change what it
 * SAYS.
 *
 * Like the writer, this task never sees raw source documents — only verified
 * claims. It therefore cannot be steered by attacker-controlled prose, and it
 * cannot "discover" a selling point the verifier rejected.
 */

import { CATEGORY_LABELS } from '../../config/editorial.ts'
import { SEO, UNSUPPORTED_SUPERLATIVES, type ArticleFormat } from '../../config/limits.ts'
import { HOUSE_RULES, UNTRUSTED_CONTENT_RULES, wrapUntrusted } from './shared.ts'

export const SEO_SYSTEM = `
${HOUSE_RULES}

TASK: SEO BRIEF

You are preparing search guidance for one article that has ALREADY been fact
checked. The verified claims below are the complete set of facts. Your job is to
decide how this article should be found, not what it should assert.

THE RULE THAT OVERRIDES EVERYTHING ELSE

  SEO shapes structure and wording. SEO does not invent facts.

  If a keyword would only be accurate for an article making a claim that is not
  in the verified set, it is the wrong keyword. Choose a narrower one that is
  true over a broader one that is not.

PRIMARY KEYWORD
  The single query a reader would type to find exactly this story. Concrete and
  specific: "github copilot mai-code-1-flash deprecation", not "ai coding tools".
  It must be recognisably about THIS story, and every word of it must be
  supported by the claims or the story title.

SECONDARY KEYWORDS
  At most ${SEO.maxSecondaryKeywords}, fewer is usually better, and zero is a
  valid answer. Genuine alternate phrasings a reader might search. Not synonyms
  padded out, not the primary keyword sliced into fragments, not a list of every
  company mentioned.

SEARCH INTENT
  informational — the reader wants to understand what happened
  commercial    — the reader is evaluating or choosing a tool
  navigational  — the reader is looking for a specific product or page
  mixed         — genuinely more than one of the above
  Pick the one that matches what THIS article actually delivers. Claiming
  commercial intent for a changelog note is misleading and will be rejected.

SEO TITLE
  Under ${SEO.seoTitleMaxChars} characters where possible. Lead with the specific
  actor and action. It must be factually accurate and supported by the claims —
  a title is the most-read part of the article and the easiest place to overstate.

META DESCRIPTION
  ${SEO.metaDescriptionMinChars}-${SEO.metaDescriptionMaxChars} characters, one or
  two natural sentences describing what the reader will learn. Write it for a
  person. Do not stuff keywords into it. Do not end with a call to action that
  the article does not deliver on.

SUGGESTED SLUG
  Lowercase words separated by hyphens. It will be normalised by application code
  afterwards, so do not worry about punctuation — worry about it being
  descriptive and short.

SUGGESTED HEADINGS
  Section headings that map to material the verified claims ACTUALLY support.
  Never suggest a heading the article would have to invent content to fill. If
  the claims support three sections, suggest three.

INTERNAL LINK TARGETS
  Choose ONLY from the list of site routes supplied in the user message, copied
  exactly. Do not invent a path, do not guess a URL, do not modify one. If none
  is genuinely relevant, return an empty array — an irrelevant link is worse than
  no link.

FORBIDDEN LANGUAGE
  Do not use comparative or superlative claims unless that exact word appears in
  a verified claim. This includes:
${UNSUPPORTED_SUPERLATIVES.map((word) => `    "${word}"`).join('\n')}

  We have not benchmarked this product against its competitors. Asserting a
  ranking would be inventing a fact about every other tool on the market.

  Also avoid: invented comparisons ("better than X"), urgency that the story does
  not support ("act now"), and clickbait framing ("you won't believe").

${UNTRUSTED_CONTENT_RULES}
`.trim()

export interface SeoPromptInput {
  storyTitle: string
  category: string
  format: ArticleFormat
  /** Shape limits for this article's format, so SEO cannot inflate a brief. */
  maxHeadings: number
  maxSecondaryKeywords: number
  claims: Array<{ id: string; text: string; supportLevel: string }>
  entities: string[]
  evidence: Array<{ publisher: string; trustTier: number }>
  /** The only internal link targets that may be chosen. */
  availableRoutes: Array<{ path: string; label: string; description: string }>
}

export function seoUserPrompt(input: SeoPromptInput): string {
  const claimTexts = input.claims
    .map((claim) => wrapUntrusted(`claim ${claim.id} — ${claim.supportLevel}`, claim.text))
    .join('\n\n')

  const routeLines = input.availableRoutes
    .map((route) => `  ${route.path}  — ${route.description}`)
    .join('\n')

  const categoryLabel =
    (CATEGORY_LABELS as Record<string, string>)[input.category] ?? input.category

  const publishers = [...new Set(input.evidence.map((item) => item.publisher))].join(', ')

  return `
Story: ${input.storyTitle}
Category: ${input.category} (${categoryLabel})
Article format: ${input.format}
  This format was chosen from how much verified evidence exists. Keep the SEO
  shape proportionate to it: at most ${input.maxHeadings} suggested heading(s)
  and at most ${input.maxSecondaryKeywords} secondary keyword(s). Do not propose
  structure the evidence cannot fill.

Entities named in this story (trusted, from our own extraction):
${input.entities.length > 0 ? input.entities.map((entity) => `  - ${entity}`).join('\n') : '  (none identified)'}

Publishers backing this story: ${publishers || 'unknown'}

VERIFIED CLAIMS — the complete set of facts available
${input.claims.map((claim) => `  [${claim.id}] (${claim.supportLevel})`).join('\n')}

Claim statements:

${claimTexts}

SITE ROUTES YOU MAY LINK TO — copy a path exactly, or return none
${routeLines || '  (no routes available — return an empty array)'}

Produce the SEO brief.
`.trim()
}
