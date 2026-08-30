/** Time helpers. All timestamps crossing a module boundary are ISO 8601 UTC. */

/**
 * The pipeline's source of "now" for *editorial* decisions — story age, the
 * freshness score, the dedupe window, and the discovery timestamp that feeds
 * both.
 *
 * These decisions are relative to when the run happens, so tests that pin them
 * to real wall-clock time rot: a feed fixture with an absolute pubDate is fresh
 * the week it is written and stale forever after. Injecting the clock lets a
 * test place the run at a fixed instant relative to its fixtures, so the
 * production freshness rule stays fully in force and still gets exercised.
 *
 * Deliberately NOT used for run-lock staleness, log lines, or migration
 * timestamps: those measure real process liveness, and must keep reading the
 * real clock even if a run is ever backfilled against an earlier editorial now.
 */
export interface Clock {
  now(): Date
  nowIso(): string
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowIso: () => new Date().toISOString(),
}

/** Test seam: a clock frozen at one instant. */
export function fixedClock(instant: string | Date): Clock {
  const at = typeof instant === 'string' ? new Date(instant) : new Date(instant.getTime())
  if (Number.isNaN(at.getTime())) {
    throw new TypeError(`fixedClock received an unparseable instant: ${String(instant)}`)
  }
  const iso = at.toISOString()
  return { now: () => new Date(at.getTime()), nowIso: () => iso }
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function hoursSince(iso: string | undefined, reference: Date = new Date()): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY
  return (reference.getTime() - then) / 3_600_000
}

export function minutesSince(iso: string, reference: Date = new Date()): number {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY
  return (reference.getTime() - then) / 60_000
}

/**
 * Parses a feed date into ISO, or undefined.
 *
 * Feeds lie constantly: RFC-822, ISO and locale strings all appear, sometimes in
 * the same feed. A future-dated item is treated as unparseable rather than
 * trusted, since a bad date would otherwise let it dominate freshness scoring
 * forever.
 */
export function parseFeedDate(value: unknown, reference: Date = new Date()): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Date.parse(value.trim())
  if (Number.isNaN(parsed)) return undefined
  // Allow a little clock skew, reject anything meaningfully in the future.
  if (parsed > reference.getTime() + 6 * 3_600_000) return undefined
  return new Date(parsed).toISOString()
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
