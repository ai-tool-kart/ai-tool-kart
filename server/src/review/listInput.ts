/*
 * Parsing and validating a comma-separated list answer against a closed
 * vocabulary — roles, stages, useCases. Pure, so the case-insensitive
 * matching rule ("student" must resolve to "Student") is testable without a
 * terminal attached.
 */

/** Splits on commas, trims each piece, drops anything that trims to empty. */
export function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '')
}

export interface ResolvedListInput<T extends string> {
  /** Canonically-cased, de-duplicated matches, in the order they were typed. */
  resolved: T[]
  /** Entries, exactly as typed, that matched nothing in `allowed` (case-insensitively). */
  invalid: string[]
}

/**
 * Matches each of `values` against `allowed` case-insensitively and returns
 * the ALLOWED list's own casing, not the caller's — "student" must resolve
 * to "Student", the way it's spelled in taxonomy.ts's ROLES, not linger as
 * "student" in a written catalogue record next to every other role that
 * uses title case.
 */
export function resolveListInput<T extends string>(
  values: readonly string[],
  allowed: readonly T[],
): ResolvedListInput<T> {
  const resolved: T[] = []
  const invalid: string[] = []

  for (const value of values) {
    const canonical = allowed.find((candidate) => candidate.toLowerCase() === value.toLowerCase())
    if (canonical === undefined) {
      invalid.push(value)
    } else if (!resolved.includes(canonical)) {
      resolved.push(canonical)
    }
  }

  return { resolved, invalid }
}
