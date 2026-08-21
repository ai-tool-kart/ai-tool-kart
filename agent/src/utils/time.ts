/** Time helpers. All timestamps crossing a module boundary are ISO 8601 UTC. */

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
