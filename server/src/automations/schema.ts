/*
 * Automation validation — SPEC-automations.md §3.
 *
 * Strict per-record validation, throw-collected exactly like
 * catalogue/schema.ts's `parseCatalogue`: every bad record is found before
 * the process throws once, naming every offending record and field path, so
 * an importer run (or a boot) reports the whole list of problems in one pass
 * rather than one-fix-at-a-time.
 *
 * `.strict()` throughout, nested objects included (`AutomationToolSchema`,
 * `AutomationStepSchema`) — an unknown key is a typo or a half-finished field
 * rename, and either way it needs to be seen at validation time, not ignored.
 *
 * Two helpers below (`nonEmpty`, `httpUrl`) restate catalogue/schema.ts's own
 * — not imported, because automations/ never imports catalogue/
 * (SPEC-automations.md §2; types.ts's header explains why). Duplicating a
 * five-line helper costs less than the import would.
 */

import { z } from 'zod'
import { AUTOMATIONS } from '../config/limits.ts'
import { configError } from '../domain/errors.ts'
import { CATALOGUE_KINDS, NICHES, PRICING_TIERS } from '../domain/types.ts'
import { GUIDE_RESOURCE_KINDS, type Automation, type AutomationEditorial } from './types.ts'

const nonEmpty = (max: number) => z.string().trim().min(1).max(max)

/** Same rule as catalogue/schema.ts's `httpUrl` — http(s), no embedded credentials. */
const httpUrl = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => {
      let url: URL
      try {
        url = new URL(value)
      } catch {
        return false
      }
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        url.username === '' &&
        url.password === ''
      )
    },
    { message: 'must be an http(s) URL with no embedded credentials' },
  )

/**
 * Lowercase, hyphen-separated, no leading/trailing/doubled hyphens.
 * The same shape as catalogue/schema.ts's SLUG_PATTERN, restated for the
 * same "no catalogue/ import" reason as the helpers above.
 */
const AUTOMATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const slug = z
  .string()
  .regex(AUTOMATION_SLUG_PATTERN, 'must be lowercase alphanumeric words joined by single hyphens')
  .max(AUTOMATIONS.slugMaxChars)

export const AutomationToolSchema = z
  .object({
    name: nonEmpty(AUTOMATIONS.toolNameMaxChars),
    url: httpUrl.optional(),
    catalogueSlug: slug.optional(),
    accessNote: nonEmpty(AUTOMATIONS.toolAccessNoteMaxChars).optional(),
  })
  .strict()

export const GuideResourceSchema = z
  .object({
    title: nonEmpty(AUTOMATIONS.resourceTitleMaxChars),
    url: httpUrl,
    kind: z.enum(GUIDE_RESOURCE_KINDS).optional(),
    description: nonEmpty(AUTOMATIONS.resourceDescriptionMaxChars).optional(),
  })
  .strict()

/** A tool as one step uses it: the imported tool shape, plus `why`. */
export const StepToolSchema = AutomationToolSchema.extend({
  why: nonEmpty(AUTOMATIONS.toolWhyMaxChars).optional(),
}).strict()

const listOf = (max: number, maxItems: number = AUTOMATIONS.maxListItems) =>
  z.array(nonEmpty(max)).min(1).max(maxItems)

/**
 * One AUTHORED step. `body` is required here (an editor writing a step
 * writes its description); the editorial fields after `tip` are all optional.
 */
export const AutomationStepSchema = z
  .object({
    title: nonEmpty(AUTOMATIONS.stepTitleMaxChars),
    body: nonEmpty(AUTOMATIONS.stepBodyMaxChars),
    prompt: nonEmpty(AUTOMATIONS.stepPromptMaxChars).optional(),
    toolName: nonEmpty(AUTOMATIONS.stepToolNameMaxChars).optional(),
    tip: nonEmpty(AUTOMATIONS.stepTipMaxChars).optional(),
    instructions: listOf(AUTOMATIONS.listItemMaxChars, AUTOMATIONS.maxInstructions).optional(),
    tools: z.array(StepToolSchema).min(1).max(AUTOMATIONS.maxStepTools).optional(),
    expectedOutcome: nonEmpty(AUTOMATIONS.listItemMaxChars).optional(),
    tips: listOf(AUTOMATIONS.stepTipMaxChars).optional(),
    resources: z.array(GuideResourceSchema).min(1).max(AUTOMATIONS.maxResources).optional(),
    cta: z
      .object({ label: nonEmpty(AUTOMATIONS.ctaLabelMaxChars), url: httpUrl })
      .strict()
      .optional(),
    alternatives: z.array(StepToolSchema).min(1).max(AUTOMATIONS.maxStepTools).optional(),
    explanation: listOf(AUTOMATIONS.paragraphMaxChars, AUTOMATIONS.maxExplanationParagraphs).optional(),
  })
  .strict()

/** A real calendar date, YYYY-MM-DD — "2026-02-30" is rejected, not rolled over. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date written YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, 'is not a real calendar date')

/**
 * The editorial layer — automations/types.ts `AutomationEditorial`. Every
 * field optional; an empty list is rejected rather than meaning "none", so
 * "absent" has exactly one spelling.
 */
export const AutomationEditorialSchema = z
  .object({
    headline: nonEmpty(AUTOMATIONS.headlineMaxChars).optional(),
    metaDescription: nonEmpty(AUTOMATIONS.metaDescriptionMaxChars).optional(),
    lede: nonEmpty(AUTOMATIONS.ledeMaxChars).optional(),
    updatedAt: isoDate.optional(),
    intro: listOf(AUTOMATIONS.paragraphMaxChars, AUTOMATIONS.maxIntroParagraphs).optional(),
    learningOutcomes: listOf(AUTOMATIONS.listItemMaxChars).optional(),
    beforeYouStart: z
      .array(
        z
          .object({
            title: nonEmpty(AUTOMATIONS.listItemMaxChars),
            description: nonEmpty(AUTOMATIONS.listItemMaxChars).optional(),
            resource: GuideResourceSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(AUTOMATIONS.maxListItems)
      .optional(),
    steps: z.array(AutomationStepSchema).min(1).max(AUTOMATIONS.maxEditorialSteps).optional(),
    tips: listOf(AUTOMATIONS.listItemMaxChars).optional(),
    commonIssues: z
      .array(
        z
          .object({
            problem: nonEmpty(AUTOMATIONS.listItemMaxChars),
            solution: nonEmpty(AUTOMATIONS.paragraphMaxChars),
          })
          .strict(),
      )
      .min(1)
      .max(AUTOMATIONS.maxListItems)
      .optional(),
    resources: z.array(GuideResourceSchema).min(1).max(AUTOMATIONS.maxResources).optional(),
    relatedGuides: z
      .array(z.object({ niche: z.enum(NICHES), slug }).strict())
      .min(1)
      .max(AUTOMATIONS.maxRelatedGuides)
      .optional(),
    expectedResult: z
      .object({
        summary: nonEmpty(AUTOMATIONS.paragraphMaxChars),
        checklist: listOf(AUTOMATIONS.listItemMaxChars).optional(),
      })
      .strict()
      .optional(),
    closing: z
      .object({ title: nonEmpty(AUTOMATIONS.headlineMaxChars), body: nonEmpty(AUTOMATIONS.paragraphMaxChars) })
      .strict()
      .optional(),
  })
  .strict()

/**
 * One overlay file under automations/editorial/: the editorial fields, plus
 * the `automationId` they belong to. The id — not the slug — because the id
 * survives a title edit on re-import and the slug does not.
 */
export const EditorialOverlaySchema = AutomationEditorialSchema.extend({
  automationId: nonEmpty(AUTOMATIONS.idMaxChars),
}).strict()

export interface EditorialOverlay extends AutomationEditorial {
  automationId: string
}

export const AutomationSchema = z
  .object({
    id: nonEmpty(AUTOMATIONS.idMaxChars),
    slug,
    kind: z.enum(CATALOGUE_KINDS),
    niche: z.enum(NICHES),
    sector: nonEmpty(AUTOMATIONS.sectorMaxChars).optional(),
    persona: nonEmpty(AUTOMATIONS.personaMaxChars),
    title: nonEmpty(AUTOMATIONS.titleMaxChars),
    intentLabels: z
      .array(nonEmpty(AUTOMATIONS.intentLabelMaxChars))
      .min(1)
      .max(AUTOMATIONS.maxIntentLabels),
    tools: z.array(AutomationToolSchema).min(1).max(AUTOMATIONS.maxTools),
    workflowSummary: nonEmpty(AUTOMATIONS.workflowSummaryMaxChars),
    samplePrompt: nonEmpty(AUTOMATIONS.samplePromptMaxChars),
    /*
     * A domain-fixed literal set, not a configurable cap — same precedent as
     * catalogue/schema.ts's inline `rating: z.number().min(0).max(5)`.
     */
    beginnerFriendly: z.enum(['yes', 'somewhat', 'no']),
    beginnerNote: nonEmpty(AUTOMATIONS.beginnerNoteMaxChars).optional(),
    trustScore: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    pricingNote: nonEmpty(AUTOMATIONS.pricingNoteMaxChars),
    pricingTier: z.enum(PRICING_TIERS),
    pricingTierSource: z.enum(['matched', 'default']),
    sourceUrl: httpUrl,
    sourceType: nonEmpty(AUTOMATIONS.sourceTypeMaxChars),
    freshness: nonEmpty(AUTOMATIONS.freshnessMaxChars),
    accessNotes: nonEmpty(AUTOMATIONS.accessNotesMaxChars).optional(),
    batch: nonEmpty(AUTOMATIONS.batchMaxChars),
    steps: z.array(AutomationStepSchema).min(1).max(AUTOMATIONS.maxSteps).optional(),
    status: z.enum(['active', 'draft']),
  })
  .strict()

export type AutomationRecord = z.infer<typeof AutomationSchema>

export interface ValidationSource {
  /** Where the records came from, for the error message. Never a secret. */
  origin: string
}

/**
 * Validates a whole automations file.
 *
 * Collects every failure before throwing rather than stopping at the first —
 * the same rule catalogue/schema.ts's `parseCatalogue` follows, and for the
 * same reason: one import run should report the full repair list, not one
 * record per attempt. No record is dropped silently.
 */
export function parseAutomations(records: unknown, source: ValidationSource): Automation[] {
  if (!Array.isArray(records)) {
    throw configError(
      `Automations at ${source.origin} must be a JSON array of records, got ` +
        `${records === null ? 'null' : typeof records}.`,
    )
  }

  const problems: string[] = []
  const automations: Automation[] = []

  records.forEach((record, index) => {
    const parsed = AutomationSchema.safeParse(record)
    if (parsed.success) {
      automations.push(parsed.data as Automation)
      return
    }

    const label = describeRecord(record, index)
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(record)'
      problems.push(`  ${label} — ${path}: ${issue.message}`)
    }
  })

  problems.push(...findDuplicates(automations, 'id', (a) => a.id))
  // Slugs are unique within a niche only — the importer assigns them per
  // niche, and two niches can share one.
  problems.push(
    ...findDuplicates(automations, 'slug', (a) => `${a.niche}\u0000${a.slug}`, (a) => `${a.niche}/${a.slug}`),
  )

  if (problems.length > 0) {
    throw configError(
      `Invalid automations (${source.origin}):\n${problems.join('\n')}\n\n` +
        `${problems.length} problem(s) across ${records.length} record(s). ` +
        'No record is dropped silently — fix the data and re-run.',
    )
  }

  return automations
}

/** Best available identity for an error message, however broken the record is. */
function describeRecord(record: unknown, index: number): string {
  if (record && typeof record === 'object') {
    const candidate = record as { id?: unknown; title?: unknown }
    if (typeof candidate.id === 'string' && candidate.id.length > 0) {
      return `[${index}] id="${candidate.id}"`
    }
    if (typeof candidate.title === 'string' && candidate.title.length > 0) {
      return `[${index}] title="${candidate.title}"`
    }
  }
  return `[${index}] (no id or title)`
}

function findDuplicates(
  automations: Automation[],
  field: 'id' | 'slug',
  keyOf: (automation: Automation) => string,
  labelOf: (automation: Automation) => string = keyOf,
): string[] {
  const seen = new Map<string, number>()
  const problems: string[] = []
  automations.forEach((automation, index) => {
    const key = keyOf(automation)
    const first = seen.get(key)
    if (first === undefined) {
      seen.set(key, index)
      return
    }
    problems.push(
      `  [${index}] ${field}="${labelOf(automation)}": duplicate — already used by record [${first}]`,
    )
  })
  return problems
}
