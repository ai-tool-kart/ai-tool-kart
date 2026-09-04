/*
 * Identifier and hashing helpers.
 *
 * Ids are deterministic wherever a stable identity matters across runs: a story
 * fingerprint must produce the same id when the same event is seen again, or
 * dedupe silently stops working. Random ids are used only where the entity is
 * genuinely new each time (a run).
 */

import { createHash, randomUUID } from 'node:crypto'

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Short, collision-resistant-enough digest for ids. */
export function shortHash(value: string, length = 16): string {
  return sha256(value).slice(0, length)
}

/** Stable id for a news item: one per canonical URL, forever. */
export function newsItemId(canonicalUrl: string): string {
  return `itm_${shortHash(canonicalUrl)}`
}

/** Stable id derived from a story fingerprint. */
export function storyId(fingerprint: string): string {
  return `sty_${shortHash(fingerprint)}`
}

/** Stable id for one claim, so re-extraction does not duplicate rows. */
export function claimId(evidenceUrl: string, text: string): string {
  return `clm_${shortHash(`${evidenceUrl} ${text}`)}`
}

export function evidenceId(storyKey: string, url: string): string {
  return `evd_${shortHash(`${storyKey} ${url}`)}`
}

/** Article identity follows the story: one story yields at most one article. */
export function articleId(story: string): string {
  return `art_${shortHash(story)}`
}

export function runId(now: Date = new Date()): string {
  return `run_${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomUUID().slice(0, 8)}`
}
