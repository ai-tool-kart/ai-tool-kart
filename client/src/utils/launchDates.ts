import type { Tool } from '@/types/tool'
import { addedAtTime } from '@/utils/recency'

/*
 * Chronology for the New Launches page: how old an intake is, what to call
 * that, and which heading it belongs under.
 *
 * Everything here derives from `tool.addedAt` and nothing else — the same field
 * utils/recency.ts reads, so the homepage's Recently Added rail and this page
 * cannot disagree about what "newest" means. Ordering is NOT redefined here;
 * callers sort with `sortByRecency` and these functions only label the result.
 *
 * ── The precision the data actually has ──────────────────────────────────────
 *
 * `addedAt` is `YYYY-MM-DD`. A DATE, with no time of day. The handoff's cards
 * say things like "2 hours ago" and "Yesterday, 6:20pm", and those are not
 * derivable from a date — printing them would mean inventing an hour the
 * catalogue never recorded. So the finest thing said here is "today", and
 * everything else counts whole days.
 *
 * ── Why calendar days rather than elapsed milliseconds ───────────────────────
 *
 * `Date.parse('2026-09-06')` is UTC midnight, and `now` is local. Subtracting
 * them and dividing by 86.4e6 makes "yesterday" flip a few hours early or late
 * depending on the reader's offset, which is exactly the kind of bug nobody
 * notices until a launch shows up under the wrong heading. Both sides are
 * therefore reduced to a LOCAL calendar day first, and the difference is a
 * count of days between two midnights.
 */

/** Days 0–6. The window "added this week" and the three week headings share. */
export const LAUNCH_WEEK_DAYS = 7

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Local midnight for an epoch ms value, as a day number. */
function toLocalDayNumber(epochMs: number): number {
  const date = new Date(epochMs)
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY,
  )
}

/**
 * Whole calendar days between a tool's intake date and today.
 *
 * 0 is today, 1 is yesterday. `undefined` when the record carries no readable
 * date. A FUTURE date returns a negative number rather than being clamped —
 * callers decide what to do with it, and silently rounding it to "today" would
 * hide a bad record instead of showing it at the top where it is noticed.
 */
export function daysSinceAdded(tool: Tool, now: number = Date.now()): number | undefined {
  const added = addedAtTime(tool)
  if (added === undefined) return undefined
  return toLocalDayNumber(now) - toLocalDayNumber(added)
}

/**
 * The "Added …" line on a launch card.
 *
 * Relative while that is the more useful reading, then an absolute date — past
 * a week "13 days ago" is arithmetic the reader has to do, and "28 Aug" is not.
 * The year is added only when it is not the current one, which is the same rule
 * a person writing the date by hand would use.
 */
export function formatAddedLabel(tool: Tool, now: number = Date.now()): string | undefined {
  const days = daysSinceAdded(tool, now)
  if (days === undefined) return undefined
  if (days < 0) return 'scheduled'
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < LAUNCH_WEEK_DAYS) return `${days} days ago`

  const added = addedAtTime(tool)
  if (added === undefined) return undefined
  const date = new Date(added)
  const sameYear = date.getUTCFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  })
}

/**
 * How many tools were added in the last week.
 *
 * Exactly the tools the Today / Yesterday / Earlier-this-week headings hold, so
 * the pill above the page and the groups below it count the same thing. Future
 * dates are excluded: they are not additions that have happened.
 */
export function countAddedThisWeek(tools: Tool[], now: number = Date.now()): number {
  return tools.filter((tool) => {
    const days = daysSinceAdded(tool, now)
    return days !== undefined && days >= 0 && days < LAUNCH_WEEK_DAYS
  }).length
}

export interface LaunchGroup {
  /** Stable key — the label is display text and could repeat across years. */
  key: string
  /** "Today", "Earlier this week", "August 2026". */
  label: string
  tools: Tool[]
}

/**
 * The heading a tool belongs under.
 *
 * Relative headings for the current week, then one per calendar month. The
 * handoff only ever needed the first three — its prototype list was ten tools,
 * all under two days old — but a real catalogue stretches back months, and
 * dropping 60 of 66 records into a single "Earlier" would be a heading that
 * tells the reader nothing. Month buckets are the same idea at the scale the
 * data actually has.
 */
function groupFor(tool: Tool, now: number): { key: string; label: string } | undefined {
  const days = daysSinceAdded(tool, now)
  if (days === undefined) return undefined
  if (days < 0) return { key: 'scheduled', label: 'Scheduled' }
  if (days === 0) return { key: 'today', label: 'Today' }
  if (days === 1) return { key: 'yesterday', label: 'Yesterday' }
  if (days < LAUNCH_WEEK_DAYS) return { key: 'week', label: 'Earlier this week' }

  const added = addedAtTime(tool)
  if (added === undefined) return undefined
  const date = new Date(added)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return {
    key: `m-${year}-${month}`,
    label: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  }
}

/**
 * Splits an ALREADY-SORTED list into consecutive date groups.
 *
 * Order comes from the input, not from a hardcoded list of headings: the caller
 * has already applied `sortByRecency`, so walking it once and starting a new
 * group whenever the heading changes yields groups in chronological order for
 * free, however far back the catalogue reaches. Empty groups cannot occur,
 * because a group only exists once a tool falls into it.
 *
 * Records with no readable date are dropped — the same rule `sortByRecency`
 * applies, for the same reason: a page about when things arrived has nothing to
 * say about a record whose arrival is unknown.
 */
export function groupLaunchesByDate(sorted: Tool[], now: number = Date.now()): LaunchGroup[] {
  const groups: LaunchGroup[] = []

  for (const tool of sorted) {
    const group = groupFor(tool, now)
    if (!group) continue

    const current = groups[groups.length - 1]
    if (current && current.key === group.key) {
      current.tools.push(tool)
    } else {
      groups.push({ key: group.key, label: group.label, tools: [tool] })
    }
  }

  return groups
}
