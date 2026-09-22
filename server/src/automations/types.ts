/*
 * Automation types — SPEC-automations.md §3.
 *
 * An automation is a task-shaped recipe, not a catalogue record. Its tools are
 * EMBEDDED, never catalogue slugs: most of the tools a client's spreadsheet
 * names ("Motion", "Bold.org", "Notability") are not among the 68 tools the
 * catalogue currently seeds, and requiring a catalogue entry for every one of
 * them would mean inventing `mono`, `pop`, `roles`, `stages` and an editorial
 * `summary` for a tool nobody vetted — curation work nobody asked for
 * (SPEC-automations.md §1, "Why tools are embedded").
 *
 * That is also why this file, and everything under automations/, never
 * imports catalogue/ or retrieval/ (SPEC-automations.md §2) — enforced by a
 * boundary.test.ts block added in a later slice, the same way stories/ and
 * savings/ are. The one exception is vocabulary: `PricingTier` and
 * `NicheName` are still catalogue/taxonomy.ts's closed lists (§5.3 — one
 * definition per vocabulary), reached here through domain/types.ts's value
 * and type re-exports rather than an import of catalogue/ itself.
 */

import type { NicheName, PricingTier } from '../domain/types.ts'

/**
 * One tool an automation names, as the client's spreadsheet describes it —
 * never a hydrated catalogue record.
 *
 * `catalogueSlug` is the one bridge to the real catalogue, and it is set only
 * when a confident match exists (the importer's job, SPEC-automations.md §8);
 * absent, it means exactly that — no match, not "not checked yet".
 */
export interface AutomationTool {
  /** Display name as the source names it, e.g. "Motion". */
  name: string
  /** The vendor's own site — the only outbound link this record can offer. */
  url: string
  /** A real catalogue tool's slug, set only on a confident importer match. */
  catalogueSlug?: string
  /** e.g. "7-day trial requires a card upfront". */
  accessNote?: string
}

/**
 * One authored step of a plan. Optional at the record level — most
 * automations have none yet, and a reader gets three DERIVED steps instead
 * (SPEC-automations.md §5, `deriveSteps` — a later slice). This type exists
 * now so the schema can accept authored content the day it arrives without a
 * later shape change.
 */
export interface AutomationStep {
  title: string
  body: string
  /** Rendered with a copy button, same as `Automation.samplePrompt`. */
  prompt?: string
  /** Free text, not an `AutomationTool` — a step names a tool, it need not
   *  repeat that tool's url/access note, which live on `Automation.tools`. */
  toolName?: string
  tip?: string
}

/**
 * The record. One automation, one task, one recipe.
 *
 * `id` and `slug` are deliberately separate fields, the same split
 * domain/types.ts's `Tool` does NOT make (there, `id` is a slug) — an
 * automation's `id` is the importer's own stable identifier (survives a
 * title edit on re-import), while `slug` is derived from `title` and is
 * what a URL and a lookup actually use.
 */
export interface Automation {
  id: string
  /** From `title`, lowercase-hyphenated — see AUTOMATION_SLUG_PATTERN in schema.ts. */
  slug: string
  niche: NicheName
  /** Free text, from the sheet's Audience/Persona column — see SPEC §4 for
   *  why this is not itself a closed vocabulary. */
  persona: string
  /** Task Title — the phrase a user would actually type. The searchable field. */
  title: string
  /** Intent Labels / Synonyms, split on ';' at import. */
  intentLabels: string[]
  tools: AutomationTool[]
  workflowSummary: string
  samplePrompt: string
  beginnerFriendly: 'yes' | 'somewhat' | 'no'
  /** Stored, never rendered (SPEC §3) — a ranking tiebreak only. */
  trustScore: 1 | 2 | 3 | 4 | 5
  /** Stored, never rendered — prices move monthly; see SPEC §6. */
  pricingNote: string
  /** Derived at import from `pricingNote`, and what the UI actually shows. */
  pricingTier: PricingTier
  /** The vendor/source page every price or capability claim links back to. */
  sourceUrl: string
  sourceType: string
  /** e.g. "Retrieved Sep 2026" — when the source was last checked. */
  freshness: string
  accessNotes?: string
  /** e.g. "Students Batch 2" — which import run produced this record. */
  batch: string
  /** Authored steps, when they exist. Overrides the derived three (§5). */
  steps?: AutomationStep[]
  status: 'active' | 'draft'
}
