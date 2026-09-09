import type { Tool } from '@/types/tool'

/*
 * The usage-story contract.
 *
 * `UsageStory` mirrors the server's own record (server/src/domain/types.ts)
 * FIELD FOR FIELD. The server is authoritative; if the two ever disagree, this
 * file is the one that is wrong. Nothing is stripped on the way out — a story
 * has no internal editorial field a client should not see.
 *
 * ── What these records are ───────────────────────────────────────────────────
 *
 * ILLUSTRATIVE PRODUCT-DEMO CONTENT, not testimonials. The names, locations and
 * outcome figures are written rather than collected: nobody was interviewed and
 * no metric was measured. They come from the design handoff so the section could
 * be built, and they live in one seed file so replacing them with real, sourced
 * stories is a data change and nothing else.
 *
 * The section says so where a reader can see it. That is not decoration: a
 * directory printing invented endorsements as verified ones is the single thing
 * it must not do.
 *
 * ── Tools are references ─────────────────────────────────────────────────────
 *
 * `toolSlugs` holds catalogue slugs and nothing more. A story never carries a
 * tool's name, monogram, category or pricing — those belong to the catalogue,
 * they change, and a copy here would be wrong the day a tool is renamed. See
 * utils/usageStories.ts for the resolution, which runs against the catalogue
 * index the page has already read.
 */

export interface UsageStory {
  id: string
  /** The person's job. The card's headline; always present. */
  role: string
  /** Display name, e.g. "Maya R.". Optional — a story may be anonymous. */
  personName?: string
  /** City or region. Optional. */
  location?: string
  /** What they were trying to do, in one sentence. */
  task: string
  /** Catalogue slugs, in the order the person used them. Never tool objects. */
  toolSlugs: string[]
  /** The outcome, emphasised on the card. */
  resultHeadline: string
  /** A supporting line under the headline. Optional. */
  resultDetail?: string
  /** Portrait URL. Absent across the seed; the card falls back to initials. */
  avatarUrl?: string
  /** Editorial sequence, ascending. Distinct per story. */
  order: number
}

/**
 * A story with its tool references resolved against the live catalogue.
 *
 * `tools` holds only the slugs that RESOLVED. `unresolvedSlugs` holds the rest,
 * kept rather than discarded so the section can report them instead of a chip
 * quietly failing to appear — a missing tool is a content bug worth seeing, and
 * inventing a name for it would be worse than showing nothing.
 */
export interface ResolvedUsageStory {
  story: UsageStory
  tools: Tool[]
  unresolvedSlugs: string[]
}
