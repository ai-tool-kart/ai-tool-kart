/*
 * Article-text extraction and claim extraction.
 *
 * Two jobs:
 *   1. extractArticleText — HTML to readable plain text, safely
 *   2. extractClaims      — one LLM call per source, producing atomic claims
 *
 * Claim extraction is per-source on purpose. A claim's origin must be
 * unambiguous for verification to mean anything, and mixing sources in one call
 * would let the model blur which document said what.
 */

import type { Claim, SourceEvidence } from '../domain/types.ts'
import type { LLMClient } from '../llm/client.ts'
import { ExtractionSchema } from '../llm/schemas.ts'
import { EXTRACTOR_SYSTEM, extractorUserPrompt } from '../llm/prompts/index.ts'
import { claimId } from '../utils/ids.ts'
import type { Logger } from '../utils/logger.ts'
import { errorFields } from '../utils/logger.ts'
import { collapseWhitespace, detectInjectionMarkers, htmlToText } from '../utils/text.ts'

/**
 * Narrows HTML to the article body before stripping tags.
 *
 * Boilerplate (nav, footers, related-article rails, cookie banners) otherwise
 * dominates the extracted text and gives the extractor nothing but menu labels
 * to work with. This is a heuristic, and a wrong guess degrades text quality
 * rather than creating a safety issue — the output is plain text either way.
 */
export function extractArticleText(html: string): string {
  if (!html) return ''

  // Prefer a semantic container when the page provides one.
  const containers = [
    /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i,
    /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i,
    /<div\b[^>]*(?:class|id)="[^"]*(?:post-content|entry-content|article-body|article__body|post-body)[^"]*"[^>]*>([\s\S]*?)<\/div\s*>/i,
  ]

  let body = html
  for (const pattern of containers) {
    const match = pattern.exec(html)
    if (match?.[1] && match[1].length > 400) {
      body = match[1]
      break
    }
  }

  // Structural chrome that survives inside article containers.
  body = body
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav\s*>/gi, ' ')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header\s*>/gi, ' ')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer\s*>/gi, ' ')
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside\s*>/gi, ' ')
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure\s*>/gi, ' ')

  const text = htmlToText(body)

  // Drop lines that are obviously navigation residue rather than prose.
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length < 3) return false
      if (/^(share|subscribe|sign in|log in|menu|skip to|cookie|accept all|advertisement)\b/i.test(line))
        return false
      return true
    })

  return collapseWhitespace(lines.join('\n'))
}

export interface ExtractDeps {
  llm: LLMClient
  logger: Logger
}

export interface ExtractionOutcome {
  claims: Claim[]
  /** Evidence entries whose extraction failed; the story can still proceed. */
  failedSources: number
  injectionFlagged: boolean
  /** Claims dropped because they carried instruction-like text. */
  injectedClaimsDropped: number
}

/**
 * Rejects an extracted "claim" that is actually an instruction aimed at a model.
 *
 * The structural defences (source text confined to the user turn, closed output
 * schemas, writer fed only claims) stop injected text from changing what the
 * pipeline DOES. They do not stop it from being extracted as a purported fact
 * and then paraphrased into an article — the writer would be faithfully
 * reporting what the document said.
 *
 * So instruction-shaped claims are dropped here, deterministically, rather than
 * relying on the extractor model to decline to emit them. NEWS_AGENT.md §28 asks
 * for such sources to be logged and flagged; dropping the claim is the same
 * judgement applied one step earlier.
 */
export function isInjectedClaim(text: string): boolean {
  return detectInjectionMarkers(text).length > 0
}

/**
 * Extracts claims from every piece of evidence.
 *
 * One source failing costs that source's claims, not the story: the remaining
 * evidence may still support publication, and verification decides that later.
 */
export async function extractClaims(
  evidence: SourceEvidence[],
  deps: ExtractDeps,
): Promise<ExtractionOutcome> {
  const { llm, logger } = deps
  const claims: Claim[] = []
  let failedSources = 0
  let injectionFlagged = false
  let injectedClaimsDropped = 0

  for (const source of evidence) {
    const log = logger.child({ step: 'extract' })
    try {
      const response = await llm.run({
        task: 'extract',
        system: EXTRACTOR_SYSTEM,
        user: extractorUserPrompt({
          publisher: source.publisher,
          url: source.url,
          title: source.title,
          ...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
          trustTier: source.trustTier,
          text: source.cleanedText,
        }),
        schema: ExtractionSchema,
        schemaName: 'Extraction',
        temperature: 0,
      })

      if (response.data.containsInstructions) {
        injectionFlagged = true
        log.warn('Extractor reported instruction-like text in source', {
          url: source.url,
          publisher: source.publisher,
        })
      }

      for (const extracted of response.data.claims) {
        if (isInjectedClaim(extracted.text)) {
          injectedClaimsDropped += 1
          injectionFlagged = true
          log.warn('Dropped an extracted claim containing instruction-like text', {
            url: source.url,
            publisher: source.publisher,
          })
          continue
        }
        claims.push({
          id: claimId(source.url, extracted.text),
          text: extracted.text,
          evidenceUrls: [source.url],
          // Support is decided by the verifier, never by the extractor.
          supportLevel: 'unsupported',
          claimType: extracted.claimType,
          bestTier: source.trustTier,
        })
      }

      log.debug('Claims extracted', { url: source.url, count: response.data.claims.length })
    } catch (error) {
      failedSources += 1
      log.warn('Claim extraction failed for source', { url: source.url, ...errorFields(error) })
    }
  }

  if (injectedClaimsDropped > 0) {
    logger.warn('Source produced instruction-like claims', {
      step: 'extract',
      dropped: injectedClaimsDropped,
    })
  }

  return {
    claims: mergeDuplicateClaims(claims),
    failedSources,
    injectionFlagged,
    injectedClaimsDropped,
  }
}

/**
 * Collapses identical claims extracted from different sources.
 *
 * Two sources stating the same fact should become one claim backed by two URLs —
 * that is precisely the corroboration signal the verifier needs, and leaving
 * them separate would hide it.
 */
export function mergeDuplicateClaims(claims: Claim[]): Claim[] {
  const byKey = new Map<string, Claim>()

  for (const claim of claims) {
    const key = normalizeClaimText(claim.text)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...claim, evidenceUrls: [...claim.evidenceUrls] })
      continue
    }
    for (const url of claim.evidenceUrls) {
      if (!existing.evidenceUrls.includes(url)) existing.evidenceUrls.push(url)
    }
    if (claim.bestTier !== undefined) {
      existing.bestTier =
        existing.bestTier === undefined
          ? claim.bestTier
          : (Math.min(existing.bestTier, claim.bestTier) as Claim['bestTier'])
    }
  }

  return [...byKey.values()]
}

function normalizeClaimText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
