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
 * imports catalogue/ or retrieval/ (SPEC-automations.md §2) — enforced by
 * boundary.test.ts's automations block, the same way stories/ and savings/
 * are. The one exception is vocabulary: `PricingTier`, `NicheName`
 * and `CatalogueKind` are still catalogue/taxonomy.ts's closed lists (§5.3 — one
 * definition per vocabulary), reached here through domain/types.ts's value
 * and type re-exports rather than an import of catalogue/ itself.
 */

import type { CatalogueKind, NicheName, PricingTier } from '../domain/types.ts'

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
  /**
   * The row's Source URL — set on the first tool only. The sheet has one
   * Source URL per row and it belongs to the first tool named; a later tool
   * keeps its name and has no link rather than borrowing someone else's.
   */
  url?: string
  /** A real catalogue tool's slug, set only on a confident importer match. */
  catalogueSlug?: string
  /** e.g. "7-day trial requires a card upfront". */
  accessNote?: string
}

/**
 * A link a guide hands the reader — a prompt file, a template, a tutorial.
 * `kind` only picks the label and icon; the url is what matters.
 */
export interface GuideResource {
  title: string
  url: string
  kind?: GuideResourceKind
  description?: string
}

export const GUIDE_RESOURCE_KINDS = [
  'prompt',
  'template',
  'example',
  'tutorial',
  'reference',
  'checklist',
] as const
export type GuideResourceKind = (typeof GUIDE_RESOURCE_KINDS)[number]

/** A tool as ONE STEP uses it — `AutomationTool` plus why this step needs it. */
export interface StepTool extends AutomationTool {
  /** Why this tool, for this step. The sentence that makes a tool list a workflow. */
  why?: string
}

/**
 * One step of a guide — authored, or one of the three deriveSteps.ts builds.
 *
 * The first five fields are the original shape and are all a derived step
 * ever sets. Everything after them is EDITORIAL: optional, set only by a
 * person writing the guide, and never derived or guessed. Order is the array
 * order — there is no step-number field to fall out of step with it.
 */
export interface AutomationStep {
  title: string
  /**
   * The step's short description. Optional on the TYPE because derived step 2
   * ("Use this prompt") has none; AutomationStepSchema still requires it on
   * AUTHORED steps: an editor writing a step should write one.
   */
  body?: string
  /** Rendered with a copy button, same as `Automation.samplePrompt`. */
  prompt?: string
  /** A derived step's pointer into `Automation.tools`. Authored steps use `tools`. */
  toolName?: string
  /** A derived step's single note. Authored steps use `tips`. */
  tip?: string

  /** Detailed instructions, one action per entry, in order. */
  instructions?: string[]
  /** The tools this step uses, each with the reason it is here. */
  tools?: StepTool[]
  /** What the reader should have when the step is done. */
  expectedOutcome?: string
  tips?: string[]
  resources?: GuideResource[]
  /** One outbound action for the step, e.g. "Open the template". */
  cta?: { label: string; url: string }
  /** Other tools that can do this step instead. */
  alternatives?: StepTool[]
  /**
   * Article prose about the step — why it matters, what to watch for. Read in
   * the page's written walkthrough; `instructions` are what to DO in it.
   */
  explanation?: string[]
}

/** One "Before you start" item. */
export interface GuideRequirement {
  title: string
  description?: string
  resource?: GuideResource
}

export interface GuideIssue {
  problem: string
  solution: string
}

/** A curated link to another guide. Niche and slug: slugs repeat across niches. */
export interface GuideRef {
  niche: NicheName
  slug: string
}

/**
 * The editorial layer — everything a person writes ON TOP of an imported
 * record. Every field is optional, and a guide with none of them renders
 * exactly as before (deriveSteps.ts, and the client's fallback).
 *
 * These fields are NOT stored in the imported data files — the importer
 * rewrites those wholesale. They live in one overlay file per guide under
 * automations/editorial/, keyed by `Automation.id`, and json.ts merges them
 * on load. See editorial/README.md.
 */
export interface AutomationEditorial {
  /** The page's H1 and title, when the record's search-phrased title is not the best headline. */
  headline?: string
  /** <meta name="description">, written for the result page rather than derived. */
  metaDescription?: string
  /** One or two sentences under the H1. */
  lede?: string
  /** When a person last reviewed the guide — YYYY-MM-DD. Shown, and used as dateModified. */
  updatedAt?: string
  /** Paragraphs: why this workflow matters — the reader's problem, and what the guide gets them to. */
  intro?: string[]
  learningOutcomes?: string[]
  beforeYouStart?: GuideRequirement[]
  /** Authored steps. Override the derived three (SPEC-automations.md §5). */
  steps?: AutomationStep[]
  tips?: string[]
  commonIssues?: GuideIssue[]
  resources?: GuideResource[]
  /** Curated first; the server fills the rest from the niche. */
  relatedGuides?: GuideRef[]
  /** What the reader has at the end, and how to check it. */
  expectedResult?: { summary: string; checklist?: string[] }
  /** The closing call to action's heading and paragraph. */
  closing?: { title: string; body: string }
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
export interface Automation extends AutomationEditorial {
  id: string
  /** From `title`, lowercase-hyphenated — see AUTOMATION_SLUG_PATTERN in schema.ts. */
  slug: string
  /** Which directory lists it: the workflow catalogue or the MCP servers page. */
  kind: CatalogueKind
  /** The source folder — the reliable niche. See `sector` for the sheet's own cell. */
  niche: NicheName
  /**
   * The row's Niche/Industry cell, verbatim. Often more specific than the
   * folder ("Pest control" under Contractors & Home Services) or worded
   * differently ("Small Business Owners (generic)"), so it is kept as free
   * text beside `niche` rather than replacing it.
   */
  sector?: string
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
  /** The Beginner-Friendly cell after its leading word, when there is more. */
  beginnerNote?: string
  /** Stored, never rendered (SPEC §3) — a ranking tiebreak only. */
  trustScore: 1 | 2 | 3 | 4 | 5
  /** Stored, never rendered — prices move monthly; see SPEC §6. */
  pricingNote: string
  /** Derived at import from `pricingNote`, and what the UI actually shows. */
  pricingTier: PricingTier
  /**
   * Whether a pricing rule recognised the note ('matched') or nothing did and
   * the importer fell back to 'paid' ('default'). The API omits a defaulted
   * tier: a missing badge is better than a guessed one.
   */
  pricingTierSource: 'matched' | 'default'
  /** The vendor/source page every price or capability claim links back to. */
  sourceUrl: string
  sourceType: string
  /** e.g. "Retrieved Sep 2026" — when the source was last checked. */
  freshness: string
  accessNotes?: string
  /** e.g. "Students Batch 2" — which import run produced this record. */
  batch: string
  status: 'active' | 'draft'
}
