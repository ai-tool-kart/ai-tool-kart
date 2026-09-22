/*
 * Catalogue validation.
 *
 * Strict per-record validation plus the cross-record invariants a per-record
 * schema cannot see (unique ids, unique slugs). Invalid data fails startup
 * loudly, naming the offending record and the failing field paths — the same
 * fail-fast posture as news agent/src/config/env.ts.
 *
 * The rule that matters: a bad record is NEVER silently dropped. A catalogue
 * that quietly discards a malformed record is a catalogue that quietly stops
 * recommending a tool, and nothing in the system would ever say so.
 *
 * `.strict()` throughout. An unknown key is a typo or a half-finished field
 * rename, and either way the author needs to hear about it at boot rather than
 * discover months later that `stage` (singular) was being ignored.
 */

import { z } from 'zod'
import { TOOL_FIELDS } from '../config/limits.ts'
import { configError } from '../domain/errors.ts'
import type { Tool } from '../domain/types.ts'
import {
  PRICING_MODELS,
  PRICING_MODELS_BY_TIER,
  PRICING_TIERS,
  ROLES,
  TOOL_CATEGORIES,
  TOOL_STATUSES,
  USE_CASES,
  WORKFLOW_STAGES,
} from './taxonomy.ts'

/** A URL that is http/https and carries no credentials. */
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
 * Exported so review/validate.ts can check a reviewer-typed slug against the
 * identical rule, before write time rather than only at it.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const slug = z
  .string()
  .regex(SLUG_PATTERN, 'must be lowercase alphanumeric words joined by single hyphens')
  .max(TOOL_FIELDS.slugMaxChars)

const nonEmpty = (max: number) => z.string().trim().min(1).max(max)

/**
 * An ISO `YYYY-MM-DD` calendar date that actually exists.
 *
 * The regex alone would accept 2026-02-31, which `Date` silently rolls forward
 * to 3 March — a catalogue that quietly moves a date is worse than one that
 * refuses to boot, so the round-trip check is part of the rule.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date, YYYY-MM-DD')
  .refine(
    (value) => {
      // `toISOString()` THROWS on an invalid date, so the guard comes first —
      // an unparseable value must fail validation, not blow up the parser.
      const parsed = new Date(`${value}T00:00:00Z`)
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    },
    { message: 'is not a real calendar date' },
  )

export const ToolSchema = z
  .object({
    /* ── Display contract ─────────────────────────────────────────────────── */
    id: slug,
    name: nonEmpty(80),
    mono: z.string().length(TOOL_FIELDS.monoLength, 'monogram is exactly two characters'),
    cat: z.enum(TOOL_CATEGORIES),
    model: z.enum(PRICING_MODELS),
    tagline: nonEmpty(160),
    /**
     * An even plainer restatement of the tagline, for a non-technical reader
     * seeing the tool for the first time in a plan step. Optional and
     * editorially written — most records do not have one yet, and the plan
     * falls back to `tagline` when it is absent (assistant engine.ts).
     */
    plainLine: nonEmpty(120).optional(),
    /*
     * 0 means "not assessed yet"; anything else is a 1–5 score.
     *
     * ── What these numbers are, and are not ─────────────────────────────────
     *
     * V1 SEEDS ratings and review counts as INTERNAL CATALOGUE METADATA: an
     * editorial read of how well regarded a tool is, derived deterministically
     * from its own `pop` prominence band. They are not sampled from an external
     * review platform and must not be presented as if they were. Four records
     * are deliberately left at 0 — a catalogue that scores every tool it lists
     * claims more assessment than it has done.
     *
     * The shape is pinned by tests/catalogue.test.ts (band, precision, spread,
     * and the rule that unrated implies no reviews) so a real review pipeline
     * can replace the seeding without loosening the contract.
     *
     * The bound stays strict either way: a typo'd 0.5 or 50 fails the boot
     * rather than skewing the "Highest rated" sort silently.
     */
    rating: z
      .number()
      .min(0)
      .max(5)
      .refine((value) => value === 0 || value >= 1, {
        message: 'must be 0 (unrated) or between 1 and 5',
      }),
    reviews: z.number().int().min(0),
    price: nonEmpty(TOOL_FIELDS.priceMaxChars),
    trend: z.string().max(16),
    badge: z.string().max(40),
    tags: z
      .array(nonEmpty(TOOL_FIELDS.tagMaxChars))
      .min(TOOL_FIELDS.tagsMin)
      .max(TOOL_FIELDS.tagsMax),
    pop: z.number().int().min(TOOL_FIELDS.popMin).max(TOOL_FIELDS.popMax),
    isMcpServer: z.boolean().optional(),
    api: nonEmpty(40),
    ctx: nonEmpty(40),
    team: nonEmpty(40),
    trial: nonEmpty(40),
    integr: nonEmpty(40),

    /* ── Recommendation contract ──────────────────────────────────────────── */
    slug,
    url: httpUrl,
    summary: z.string().trim().min(TOOL_FIELDS.summaryMinChars).max(TOOL_FIELDS.summaryMaxChars),
    roles: z.array(z.enum(ROLES)).min(1),
    useCases: z.array(z.string()).min(1),
    stages: z.array(z.enum(WORKFLOW_STAGES)).min(1),
    pricingTier: z.enum(PRICING_TIERS),
    status: z.enum(TOOL_STATUSES),
    verified: z.boolean(),

    /* ── Catalogue intake ─────────────────────────────────────────────────── */
    /*
     * The date the kart listed the tool. See `addedAt` in domain/types.ts for
     * what it is and is not.
     *
     * OPTIONAL, deliberately. Making it required would mean either back-dating
     * every future record on import or refusing to accept a tool whose intake
     * date was lost — and "we do not know when this arrived" is a state the
     * catalogue should be able to hold. An undated record simply never counts
     * as recently added.
     */
    addedAt: isoDate.optional(),
  })
  .strict()
  /*
   * Cross-field invariants. Two vocabularies describe pricing (§5.3) and they
   * must not drift: a record cannot claim pricingTier 'free' while its display
   * chip reads "Subscription".
   */
  .refine((tool) => PRICING_MODELS_BY_TIER[tool.pricingTier].includes(tool.model), {
    message: 'model is not a legal display value for this pricingTier',
    path: ['model'],
  })
  /* useCases is a large open-ish list, so it is validated by membership rather
   * than as a z.enum — the error message stays readable that way. */
  .superRefine((tool, ctx) => {
    const known = new Set(USE_CASES)
    tool.useCases.forEach((useCase, index) => {
      if (!known.has(useCase)) {
        ctx.addIssue({
          code: 'custom',
          path: ['useCases', index],
          message: `"${useCase}" is not in the taxonomy's USE_CASES vocabulary`,
        })
      }
    })
  })

export type ToolRecord = z.infer<typeof ToolSchema>

export interface ValidationSource {
  /** Where the records came from, for the error message. Never a secret. */
  origin: string
}

/**
 * Validates a whole catalogue.
 *
 * Collects every failure before throwing rather than stopping at the first, so
 * one boot reports the full repair list instead of one record per attempt.
 * Every message names the record — by id where the id itself parsed, by array
 * index otherwise — and the failing field paths.
 */
export function parseCatalogue(records: unknown, source: ValidationSource): Tool[] {
  if (!Array.isArray(records)) {
    throw configError(
      `Catalogue at ${source.origin} must be a JSON array of tool records, got ` +
        `${records === null ? 'null' : typeof records}.`,
    )
  }

  const problems: string[] = []
  const tools: Tool[] = []

  records.forEach((record, index) => {
    const parsed = ToolSchema.safeParse(record)
    if (parsed.success) {
      tools.push(parsed.data as Tool)
      return
    }

    const label = describeRecord(record, index)
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(record)'
      problems.push(`  ${label} — ${path}: ${issue.message}`)
    }
  })

  problems.push(...findDuplicates(tools, 'id'))
  problems.push(...findDuplicates(tools, 'slug'))

  if (problems.length > 0) {
    throw configError(
      `Invalid tool catalogue (${source.origin}):\n${problems.join('\n')}\n\n` +
        `${problems.length} problem(s) across ${records.length} record(s). ` +
        'No record is dropped silently — fix the data and restart.',
    )
  }

  return tools
}

/** Best available identity for an error message, however broken the record is. */
function describeRecord(record: unknown, index: number): string {
  if (record && typeof record === 'object') {
    const candidate = record as { id?: unknown; name?: unknown }
    if (typeof candidate.id === 'string' && candidate.id.length > 0) {
      return `[${index}] id="${candidate.id}"`
    }
    if (typeof candidate.name === 'string' && candidate.name.length > 0) {
      return `[${index}] name="${candidate.name}"`
    }
  }
  return `[${index}] (no id or name)`
}

function findDuplicates(tools: Tool[], field: 'id' | 'slug'): string[] {
  const seen = new Map<string, number>()
  const problems: string[] = []
  tools.forEach((tool, index) => {
    const value = tool[field]
    const first = seen.get(value)
    if (first === undefined) {
      seen.set(value, index)
      return
    }
    problems.push(
      `  [${index}] ${field}="${value}": duplicate — already used by record [${first}]`,
    )
  })
  return problems
}
