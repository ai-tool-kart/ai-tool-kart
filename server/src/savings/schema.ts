/*
 * Work-savings validation.
 *
 * Same posture as catalogue/schema.ts and stories/schema.ts: strict per-record
 * validation plus the cross-record invariants a per-record schema cannot see,
 * every failure collected before throwing, and a bad record NEVER silently
 * dropped. An estimate that vanishes at boot is a role missing from a dropdown
 * with nothing anywhere explaining why.
 *
 * `.strict()` throughout.
 *
 * ── The one rule worth calling out ───────────────────────────────────────────
 *
 * `rows` must be exactly Time, Cost and Effort, in that order. The section's
 * whole shape is those three axes — the left-hand table has three rows and the
 * role panel repeats them — so a record with two rows, or with them shuffled,
 * would render a table that silently disagrees with the one beside it. It is
 * cheaper to refuse to boot.
 */

import { z } from 'zod'
import { configError } from '../domain/errors.ts'
import { ROLES } from '../catalogue/taxonomy.ts'
import { SAVINGS_DIMENSIONS, type WorkSavingsEstimate } from '../domain/types.ts'

/** Lowercase, hyphen-separated, no leading/trailing/doubled hyphens. */
const slug = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'must be lowercase alphanumeric words joined by single hyphens',
  )
  .max(64)

const nonEmpty = (max: number) => z.string().trim().min(1).max(max)

const RowSchema = z
  .object({
    dimension: z.enum(SAVINGS_DIMENSIONS),
    without: nonEmpty(120),
    withAi: nonEmpty(120),
  })
  .strict()

export const WorkSavingsEstimateSchema = z
  .object({
    id: slug,
    role: nonEmpty(60),
    /*
     * Validated against the catalogue's ROLES rather than accepted as free text.
     * The whole point of the field is that it is the SAME vocabulary; a typo'd
     * "Developper" here would link to nothing while looking like it linked.
     */
    catalogueRole: z.enum(ROLES).optional(),
    /*
     * A plausible weekly figure. The ceiling is not a guess about anyone's week
     * — it is a guard against a typo turning an editorial estimate into an
     * absurd claim. 40 is already a full working week.
     */
    hoursSavedPerWeek: z.number().int().min(1).max(40),
    costSaved: nonEmpty(40),
    effortSaved: nonEmpty(60),
    rows: z.array(RowSchema).length(SAVINGS_DIMENSIONS.length),
    order: z.number().int().min(0),
  })
  .strict()
  .refine(
    (estimate) => estimate.rows.every((row, index) => row.dimension === SAVINGS_DIMENSIONS[index]),
    {
      message: `rows must be exactly ${SAVINGS_DIMENSIONS.join(', ')}, in that order`,
      path: ['rows'],
    },
  )

export interface ValidationSource {
  /** Where the records came from, for the error message. Never a secret. */
  origin: string
}

/**
 * Validates a whole estimate set.
 *
 * Collects every failure before throwing so one boot reports the full repair
 * list, naming each record by id where the id itself parsed and by index
 * otherwise.
 */
export function parseWorkSavings(
  records: unknown,
  source: ValidationSource,
): WorkSavingsEstimate[] {
  if (!Array.isArray(records)) {
    throw configError(
      `Work-savings estimates at ${source.origin} must be a JSON array, got ` +
        `${records === null ? 'null' : typeof records}.`,
    )
  }

  const problems: string[] = []
  const estimates: WorkSavingsEstimate[] = []

  records.forEach((record, index) => {
    const parsed = WorkSavingsEstimateSchema.safeParse(record)
    if (parsed.success) {
      estimates.push(parsed.data as WorkSavingsEstimate)
      return
    }

    const label = describeRecord(record, index)
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(record)'
      problems.push(`  ${label} — ${path}: ${issue.message}`)
    }
  })

  problems.push(...findDuplicates(estimates, 'id'))
  problems.push(...findDuplicates(estimates, 'order'))
  // Two estimates for one role would make the dropdown ambiguous: which of the
  // two a reader gets would depend on file order.
  problems.push(...findDuplicates(estimates, 'role'))

  if (problems.length > 0) {
    throw configError(
      `Invalid work-savings estimates (${source.origin}):\n${problems.join('\n')}\n\n` +
        `${problems.length} problem(s) across ${records.length} record(s). ` +
        'No record is dropped silently — fix the data and restart.',
    )
  }

  return estimates
}

/** Best available identity for an error message, however broken the record is. */
function describeRecord(record: unknown, index: number): string {
  if (record && typeof record === 'object') {
    const candidate = record as { id?: unknown; role?: unknown }
    if (typeof candidate.id === 'string' && candidate.id.length > 0) {
      return `[${index}] id="${candidate.id}"`
    }
    if (typeof candidate.role === 'string' && candidate.role.length > 0) {
      return `[${index}] role="${candidate.role}"`
    }
  }
  return `[${index}] (no id or role)`
}

function findDuplicates(
  estimates: WorkSavingsEstimate[],
  field: 'id' | 'order' | 'role',
): string[] {
  const seen = new Map<string | number, number>()
  const problems: string[] = []
  estimates.forEach((estimate, index) => {
    const value = estimate[field]
    const first = seen.get(value)
    if (first === undefined) {
      seen.set(value, index)
      return
    }
    problems.push(
      `  [${index}] ${field}="${String(value)}": duplicate — already used by record [${first}]`,
    )
  })
  return problems
}
