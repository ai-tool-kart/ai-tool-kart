import type { Tool } from '@/types/tool'

/*
 * What "recently added" means, in one place.
 *
 * The catalogue records WHEN THE KART LISTED A TOOL in `addedAt` (server:
 * domain/types.ts, seeded per INTAKE in catalogue/taxonomy.ts). That field is
 * the only source of truth here. Nothing in this file — and nothing in the
 * section that uses it — may fall back to array order, `pop`, `rating`,
 * `reviews` or a tool's name to guess at recency: every one of those answers a
 * different question, and a rail built on one of them would be lying about what
 * it is showing.
 *
 * ── Why the ordering is duplicated from the server ───────────────────────────
 *
 * `GET /api/tools?sort=newest` exists and applies exactly this comparator
 * (server: catalogue/json.ts). The homepage does not call it, because the whole
 * 66-record catalogue is already in memory from the shared read that Featured
 * and AI for Your Work use — see hooks/useToolIndex.ts. Sorting 66 objects the
 * page already holds is free; a second HTTP round trip for the same records is
 * not.
 *
 * So this is deliberately a MIRROR of the server's comparator, tiebreak
 * included, and it is documented on both sides. The moment the catalogue is big
 * enough that the client stops reading it whole, this function stops being used
 * for ordering and the section asks the endpoint instead — which already
 * answers, which is why the sort was added there rather than only here.
 */

/**
 * How recent an addition has to be to be called NEW, in days.
 *
 * A time window rather than "whatever the rail is showing". The two happen to
 * agree today, and that agreement is a fact about the data rather than
 * something the card markup asserts: with the seed's 3-day intake spacing, ten
 * records fall inside this window and the rail shows the newest eight of them.
 *
 * This is the rule a real catalogue wants — tools arrive continuously, and the
 * badge should fall off a tool once it stops being news. Be aware of what it
 * means for the SEED, though: the seeded dates are static, so if the catalogue
 * is not touched for a month the badges stop appearing on their own. That is
 * the window working correctly against stale data, not a bug to be patched by
 * pinning the badge to the card.
 */
export const NEW_BADGE_WINDOW_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A record's intake date as epoch ms, or `undefined` when it has none.
 *
 * `undefined` covers both the field being absent and it being unparseable. A
 * date the client cannot read is a date the client does not know, and the two
 * deserve the same treatment.
 */
export function addedAtTime(tool: Tool): number | undefined {
  if (!tool.addedAt) return undefined
  const parsed = Date.parse(tool.addedAt)
  return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * Newest first, mirroring the server's `sort=newest`.
 *
 * An undated record sorts after every dated one, whatever its date: not knowing
 * when something arrived is not a claim that it arrived recently. Ties fall
 * through to `id`, exactly as the server does, so the order is total and two
 * renders of the same catalogue cannot disagree.
 */
export function compareByRecency(a: Tool, b: Tool): number {
  const left = addedAtTime(a) ?? Number.NEGATIVE_INFINITY
  const right = addedAtTime(b) ?? Number.NEGATIVE_INFINITY
  // -Infinity minus -Infinity is NaN, and a NaN comparator corrupts a sort
  // silently rather than failing, so two undated records are compared as equal.
  const primary = left === right ? 0 : right - left
  return primary !== 0 ? primary : a.id.localeCompare(b.id)
}

/**
 * The catalogue in intake order, newest first.
 *
 * Records with no intake date are DROPPED rather than sorted to the back. A
 * caller reaching for this wants "the most recently added tools", and a tool
 * the catalogue cannot date does not belong in that answer at all — the
 * comparator's ordering of undated records is for a full listing (`sort=newest`
 * on Browse), where hiding a tool would be worse.
 *
 * Takes any iterable so the shared index's `Map.values()` can be passed
 * straight in. Never mutates its input.
 */
export function sortByRecency(tools: Iterable<Tool>): Tool[] {
  return [...tools].filter((tool) => addedAtTime(tool) !== undefined).sort(compareByRecency)
}

/**
 * Whether a tool was added recently enough to carry the NEW badge.
 *
 * `now` is a parameter so the rule is testable and so one render cannot
 * disagree with itself halfway down a list.
 */
export function isRecentlyAdded(tool: Tool, now: number = Date.now()): boolean {
  const added = addedAtTime(tool)
  if (added === undefined) return false
  // A future date would otherwise sit inside the window forever. The server's
  // seed test forbids one; this is the client refusing to depend on that.
  if (added > now) return false
  return now - added <= NEW_BADGE_WINDOW_DAYS * DAY_MS
}
