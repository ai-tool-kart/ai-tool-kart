/*
 * The work-savings contract.
 *
 * `WorkSavingsEstimate` mirrors the server's own record
 * (server/src/domain/types.ts) FIELD FOR FIELD. The server is authoritative; if
 * the two ever disagree, this file is the one that is wrong. Nothing is stripped
 * on the way out — an estimate has no internal field a client should not see.
 *
 * ── These are WRITTEN estimates, not measurements ────────────────────────────
 *
 * Every figure is editorial. Nothing was benchmarked and no test log exists
 * behind any of it; the numbers come from the design handoff and describe what a
 * plausible AI-assisted week looks like. The section says so in the reader's own
 * words — see SAVINGS_COPY in data/savings.ts, which is the single place that
 * wording lives.
 *
 * That is also why nothing here records a sample size, a date or a source.
 * Adding one would make an invented figure LOOK sourced, which is strictly worse
 * than an obviously editorial one.
 *
 * ── Roles ────────────────────────────────────────────────────────────────────
 *
 * `role` is the label the selector shows. `catalogueRole` links it to the
 * catalogue's own role vocabulary where one matches, so the site does not grow a
 * second set of role names — optional, because this section legitimately covers
 * kinds of work no tool is tagged with ("Restaurant Owner", "Freelancer",
 * "Sales Professional").
 */

/** Server `SAVINGS_DIMENSIONS`. The three axes the comparison runs on. */
export type SavingsDimension = 'Time' | 'Cost' | 'Effort'

/** One row of a before/after comparison. */
export interface SavingsComparisonRow {
  dimension: SavingsDimension
  /** What the week looks like without AI. */
  without: string
  /** What the same week looks like with it. */
  withAi: string
}

export interface WorkSavingsEstimate {
  id: string
  /** The label shown in the selector. */
  role: string
  /** The matching catalogue role, when the vocabulary has one. */
  catalogueRole?: string
  /** Whole hours a week. Rendered as "N hrs/week". */
  hoursSavedPerWeek: number
  /** A written range, e.g. "25–35%". Never computed. */
  costSaved: string
  /** One phrase, e.g. "Repeat admin automated". */
  effortSaved: string
  /** Time, Cost and Effort, in that order. The server guarantees it. */
  rows: SavingsComparisonRow[]
  /** Editorial sequence, ascending. */
  order: number
}
