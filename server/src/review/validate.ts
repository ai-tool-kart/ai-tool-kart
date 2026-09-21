/*
 * Live, prompt-time validation against the catalogue schema's own
 * constraints (catalogue/schema.ts's `ToolSchema`) — so a field that would
 * fail at write time (catalogue.create()'s parseCatalogue call) fails right
 * where it was entered instead, with every other field already filled in
 * wasted on a submission that has to be re-walked from scratch.
 *
 * Every limit is read from config/limits.ts's TOOL_FIELDS — the same values
 * schema.ts itself builds ToolSchema from — so this can never quietly drift
 * out of sync with what write time actually enforces. That write-time check
 * stays as the final guard regardless (review/approve.ts -> catalogue.create()
 * -> parseCatalogue): this module exists to catch the common case early, not
 * to replace it — a hand-edited field or an as-yet-unhandled schema rule
 * still gets caught there.
 */

import { SLUG_PATTERN } from '../catalogue/schema.ts'
import { TOOL_FIELDS } from '../config/limits.ts'

/** Returns an error message, or undefined when `value` is valid. */
export type FieldValidator = (value: string) => string | undefined

export function validateMono(value: string): string | undefined {
  if (value.length !== TOOL_FIELDS.monoLength) {
    return `mono must be exactly ${TOOL_FIELDS.monoLength} characters (got ${value.length}).`
  }
  return undefined
}

export function validatePrice(value: string): string | undefined {
  if (value.length > TOOL_FIELDS.priceMaxChars) {
    return `price must be ${TOOL_FIELDS.priceMaxChars} characters or fewer (got ${value.length}).`
  }
  return undefined
}

export function validateSummary(value: string): string | undefined {
  if (value.length < TOOL_FIELDS.summaryMinChars) {
    return `summary must be at least ${TOOL_FIELDS.summaryMinChars} characters (got ${value.length}).`
  }
  if (value.length > TOOL_FIELDS.summaryMaxChars) {
    return `summary must be ${TOOL_FIELDS.summaryMaxChars} characters or fewer (got ${value.length}).`
  }
  return undefined
}

export function validateSlug(value: string): string | undefined {
  if (value.length > TOOL_FIELDS.slugMaxChars) {
    return `slug must be ${TOOL_FIELDS.slugMaxChars} characters or fewer (got ${value.length}).`
  }
  if (!SLUG_PATTERN.test(value)) {
    return 'slug must be lowercase alphanumeric words joined by single hyphens.'
  }
  return undefined
}

export function validateTag(value: string): string | undefined {
  if (value.length > TOOL_FIELDS.tagMaxChars) {
    return `"${value}" is ${value.length} characters — each tag must be ${TOOL_FIELDS.tagMaxChars} or fewer.`
  }
  return undefined
}

/** `pop`'s text field: must parse as a whole number in range — the number itself is what buildTool needs. */
export function validatePopText(value: string): string | undefined {
  const parsed = Number.parseInt(value, 10)
  const isWholeNumber = Number.isInteger(parsed) && String(parsed) === value
  if (!isWholeNumber || parsed < TOOL_FIELDS.popMin || parsed > TOOL_FIELDS.popMax) {
    return `pop must be a whole number from ${TOOL_FIELDS.popMin} to ${TOOL_FIELDS.popMax}.`
  }
  return undefined
}

/** Field labels that state their own rule, per the review decisions — read from TOOL_FIELDS, never hardcoded twice. */
export const FIELD_RULES = {
  mono: `exactly ${TOOL_FIELDS.monoLength} characters`,
  price: `${TOOL_FIELDS.priceMaxChars} characters or fewer`,
  pop: `whole number, ${TOOL_FIELDS.popMin}–${TOOL_FIELDS.popMax}`,
  tags: `${TOOL_FIELDS.tagsMin}–${TOOL_FIELDS.tagsMax} tags, each up to ${TOOL_FIELDS.tagMaxChars} characters`,
  summary: `${TOOL_FIELDS.summaryMinChars}–${TOOL_FIELDS.summaryMaxChars} characters`,
  slug: `lowercase, hyphenated, ${TOOL_FIELDS.slugMaxChars} characters or fewer`,
} as const
