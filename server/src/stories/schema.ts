/*
 * Usage-story validation.
 *
 * Same posture as catalogue/schema.ts: strict per-record validation plus the
 * cross-record invariants a per-record schema cannot see, every failure
 * collected before throwing, and a bad record NEVER silently dropped. A story
 * that vanishes at boot is a gap in a looping rail that nothing anywhere
 * explains.
 *
 * `.strict()` throughout, so a typo'd or half-renamed key is heard about at boot
 * rather than discovered months later as a field that was being ignored.
 *
 * ── What is deliberately NOT validated here ──────────────────────────────────
 *
 * That `toolSlugs` name tools the catalogue actually has. This module has no
 * catalogue and must not grow one — stories/ knows nothing about the tool port,
 * which is what keeps the reference one-way. The consequence is honest: an
 * unresolvable slug renders no chip rather than a wrong one, and the frontend
 * says so. The seed's references are pinned by a test that DOES have both.
 */

import { z } from 'zod'
import { configError } from '../domain/errors.ts'
import { AUTOMATIONS } from '../config/limits.ts'
import { NICHES, type UsageStory } from '../domain/types.ts'

/** Lowercase, hyphen-separated, no leading/trailing/doubled hyphens. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const slug = z
  .string()
  .regex(SLUG_PATTERN, 'must be lowercase alphanumeric words joined by single hyphens')
  .max(64)

const nonEmpty = (max: number) => z.string().trim().min(1).max(max)

/** An http(s) URL carrying no credentials. Mirrors the catalogue's rule. */
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

export const UsageStorySchema = z
  .object({
    id: slug,
    role: nonEmpty(60),
    personName: nonEmpty(60).optional(),
    location: nonEmpty(60).optional(),
    /*
     * One sentence. The card gives the task three lines at 14.5px in a 328px
     * column; past this it stops being a task and starts being a paragraph.
     */
    task: nonEmpty(140),
    /*
     * Two to four tools. One is not a setup — the section's whole subject is
     * tools COMBINED — and past four the chips wrap to a third row and the card
     * loses its shape.
     */
    toolSlugs: z.array(slug).min(2).max(4),
    resultHeadline: nonEmpty(80),
    resultDetail: nonEmpty(120).optional(),
    avatarUrl: httpUrl.optional(),
    order: z.number().int().min(0),
    /*
     * The guide the card opens, chosen by hand. The niche is the closed
     * vocabulary and the slug follows the automations' own length rule; that
     * the pair names a real guide is checked by the test suite against the
     * imported automations, not here, because stories/ does not load them.
     */
    automation: z
      .object({
        niche: z.enum(NICHES),
        slug: z.string().regex(SLUG_PATTERN).max(AUTOMATIONS.slugMaxChars),
      })
      .strict()
      .optional(),
  })
  .strict()

export interface ValidationSource {
  /** Where the records came from, for the error message. Never a secret. */
  origin: string
}

/**
 * Validates a whole story set.
 *
 * Collects every failure before throwing so one boot reports the full repair
 * list, naming each record by id where the id itself parsed and by index
 * otherwise.
 */
export function parseStories(records: unknown, source: ValidationSource): UsageStory[] {
  if (!Array.isArray(records)) {
    throw configError(
      `Usage stories at ${source.origin} must be a JSON array, got ` +
        `${records === null ? 'null' : typeof records}.`,
    )
  }

  const problems: string[] = []
  const stories: UsageStory[] = []

  records.forEach((record, index) => {
    const parsed = UsageStorySchema.safeParse(record)
    if (parsed.success) {
      stories.push(parsed.data as UsageStory)
      return
    }

    const label = describeRecord(record, index)
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(record)'
      problems.push(`  ${label} — ${path}: ${issue.message}`)
    }
  })

  problems.push(...findDuplicates(stories, 'id'))
  // A shared `order` makes the rail's sequence depend on the file's order, which
  // is exactly the accident the field exists to remove.
  problems.push(...findDuplicates(stories, 'order'))

  if (problems.length > 0) {
    throw configError(
      `Invalid usage stories (${source.origin}):\n${problems.join('\n')}\n\n` +
        `${problems.length} problem(s) across ${records.length} record(s). ` +
        'No record is dropped silently — fix the data and restart.',
    )
  }

  return stories
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

function findDuplicates(stories: UsageStory[], field: 'id' | 'order'): string[] {
  const seen = new Map<string | number, number>()
  const problems: string[] = []
  stories.forEach((story, index) => {
    const value = story[field]
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
