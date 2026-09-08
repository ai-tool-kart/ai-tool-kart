import type { Tool } from '@/types/tool'

/*
 * An AI setup: several catalogue tools, in an order, for one job.
 *
 * This is the domain object behind the homepage's "AI for Your Work" section,
 * and it is deliberately NOT homepage-shaped. The final design also has a
 * Workflows screen, a setup detail view and an assistant entry that all describe
 * the same thing, so the type carries the setup itself rather than the section's
 * rendering of it — no colour strings the card happens to want, no pre-joined
 * "3 tools · 1 workflow · 4 prompts" line. Those are derived where they are
 * drawn. See utils/aiSetups.ts.
 *
 * ── The line between editorial and catalogue ─────────────────────────────────
 *
 * A setup is EDITORIAL: a curator's claim that these tools, in this order, do
 * this job well. Nothing in it is derivable from the catalogue, which is why it
 * lives in a data file rather than behind an endpoint.
 *
 * What it must never carry is TOOL data. `toolSlugs` are references — the same
 * slugs `GET /api/tools/:slug` answers to — and every name, monogram, category
 * and price shown on a card is resolved from the live catalogue at render time.
 * A setup that stored `{ name: 'Claude', pricing: '…' }` would be a second
 * catalogue: correct on the day it was written, and quietly wrong afterwards.
 *
 * Source of the setups themselves: the final Claude Design handoff
 * (ai-tool-kart-pre-final-design — `AI_SETUPS`).
 */

/**
 * The setup library's own filter vocabulary.
 *
 * Ten product groupings from the handoff's `SETUP_CATS`. They are NOT the
 * catalogue's ten `ToolCategoryName`s and must not be conflated with them:
 * "Coding & Dev" is broader than `Code`, "Business" and "Productivity" have no
 * catalogue category at all, and these labels never reach the API. They classify
 * editorial setups, so they are defined with the editorial content — the one
 * runtime export in this directory, and it earns its place by being the closed
 * vocabulary the `SetupCategory` type is derived from.
 *
 * (The server does publish a `categoryGroups` mapping from labels like these to
 * tool categories, for the assistant's setup builder. It is not used here: these
 * chips filter a list already in the browser and never build a query.)
 */
export const SETUP_CATEGORIES = [
  'Writing & Content',
  'Coding & Dev',
  'Image Generation',
  'Video',
  'SEO & Marketing',
  'Business',
  'Research',
  'Audio & Voice',
  'Assistants',
  'Productivity',
] as const

export type SetupCategory = (typeof SETUP_CATEGORIES)[number]

/** The tone rotation the handoff assigns per setup. Keys `SETUP_TONES`. */
export type SetupToneName = 'violet' | 'sky' | 'pink' | 'blue' | 'sand'

export interface AiSetup {
  /** Stable key. Used as the React key and as the setup's future URL segment. */
  id: string
  title: string
  description: string
  /** Exactly one, as in the handoff. See `setupsForCategory`. */
  category: SetupCategory
  /**
   * Catalogue slugs, in the order the setup runs them.
   *
   * References only. Resolution happens against the live catalogue, and a slug
   * that no longer resolves costs the card one tile rather than breaking it.
   */
  toolSlugs: string[]
  /** The workflow strip, e.g. ['Research', 'Outline', 'Draft', 'Edit']. */
  stages: string[]
  /**
   * A setup-level editorial flag ("Most used", "Recommended", "Best for teams").
   *
   * Nothing to do with the catalogue's tool badge, which is derived from a
   * tool's own `badge`/`pop` (components/catalogue/toolCardTone.ts). This one is
   * a claim about the setup, and most setups have none.
   */
  badge?: string
  /**
   * Shown under the "All" chip.
   *
   * The handoff's `star`. "All" is a curated six, not the whole library — the
   * prototype's own filter is `wcat === "All" ? AI_SETUPS.filter(s => s.star)`.
   */
  featured?: boolean
  /** Editorial. Absent where the handoff's meta line omits it. */
  workflowCount?: number
  /** Editorial. Standing agents the setup runs, where the handoff names them. */
  agentCount?: number
  /** Editorial. The prompt pack the setup ships with. */
  promptCount: number
  tone: SetupToneName
}

/**
 * A setup with its tool references resolved against the live catalogue.
 *
 * `tools` holds only what actually resolved, so `tools.length` can be smaller
 * than `setup.toolSlugs.length` — which is precisely why the card's tool count
 * is read from here and never from the editorial definition.
 */
export interface ResolvedSetup {
  setup: AiSetup
  tools: Tool[]
  /** Slugs the catalogue had no record for. Empty in a healthy catalogue. */
  missingSlugs: string[]
}
