import type { SavingsDimension } from '@/types/workSavings'

/*
 * The static half of "See What AI Can Save You".
 *
 * Two things live here and nothing else:
 *
 *   1. The GENERAL benchmark table and the value strip — the left-hand side of
 *      the section, which is the same for every reader.
 *   2. SAVINGS_COPY: every sentence in the section that makes a claim.
 *
 * ── Why the general table is not fetched ─────────────────────────────────────
 *
 * The role estimates come from GET /api/work-savings. This does not, and that is
 * deliberate rather than an oversight: the general table is the part of the
 * section that must still be on screen when that endpoint is unreachable, and
 * content required to survive an outage should not sit behind the thing that
 * goes out. It is also genuinely static — three rows that do not vary by reader,
 * by role or by catalogue state.
 *
 * It is NOT computed from catalogue records and must never appear to be. No tool
 * in the catalogue is consulted to produce "20+ hrs a week"; it is written copy,
 * carried across from the design handoff.
 *
 * ── Why every claim sentence is in one object ────────────────────────────────
 *
 * This section is the only place on the site that puts numbers against a
 * reader's own work, so it is the only place that can accidentally promise
 * something. Keeping the wording in SAVINGS_COPY means the day real benchmarking
 * exists, the honest sentence is a one-line edit in a known file rather than a
 * hunt through JSX for the four places a claim leaked into.
 */

/** The icon a comparison row draws. Keyed by dimension, resolved in icons.tsx. */
export type SavingsRowIcon = 'time' | 'cost' | 'effort'

export interface GeneralSavingsRow {
  dimension: SavingsDimension
  icon: SavingsRowIcon
  /** What the week looks like without AI. */
  without: string
  /** The headline figure or phrase, emphasised in green. */
  withAi: string
  /** The supporting line under it. */
  note: string
}

/**
 * The general Time / Cost / Effort comparison.
 *
 * Ported verbatim from the handoff's `SAVINGS_ROWS`. Editorial content: a
 * description of what AI-assisted work tends to look like, not a measurement of
 * what it did look like for anyone in particular.
 */
export const GENERAL_SAVINGS_ROWS: readonly GeneralSavingsRow[] = [
  {
    dimension: 'Time',
    icon: 'time',
    without: '20+ hrs a week on repetitive work',
    withAi: '5–8 hrs a week',
    note: 'The same output, most of it automated.',
  },
  {
    dimension: 'Cost',
    icon: 'cost',
    without: 'High tool spend plus manual labour',
    withAi: '40–60% lower',
    note: 'Fewer overlapping subscriptions.',
  },
  {
    dimension: 'Effort',
    icon: 'effort',
    without: 'Repetitive tasks filling the whole day',
    withAi: 'Focus on high value',
    note: 'Automated runs, you review the output.',
  },
]

/**
 * The three labels on the strip beneath the table.
 *
 * Decorative and non-interactive, exactly as the handoff has them — they
 * summarise the table above rather than linking anywhere.
 */
export const SAVINGS_VALUE_STRIP: readonly string[] = [
  'Hours saved',
  'Money saved',
  'Work simplified',
]

/*
 * ── Claim wording ────────────────────────────────────────────────────────────
 *
 * THE HANDOFF'S SUBTITLE READ: "Same week of work, run two ways. These are
 * medians from our own test logs, not vendor claims."
 *
 * That sentence is not carried over, because it is not true. There are no test
 * logs. Nothing in this project has measured a median, sampled a cohort, or
 * benchmarked a workflow, and a directory that prints "our own test logs" while
 * having none is making the same kind of claim it exists to help readers see
 * through. The design's intent — "these are ours, not the vendors'" — is worth
 * keeping; the evidence it asserts is not ours to assert.
 *
 * So the wording below says what the numbers actually are: written estimates of
 * a plausible AI-assisted week. When real benchmarking exists, this object is
 * where the honest sentence goes, and nothing else in the section changes.
 */
export const SAVINGS_COPY = {
  eyebrow: 'Measurable value',
  heading: 'See What AI Can Save You',
  /** Replaces the handoff's test-log claim. See the note above. */
  subtitle:
    'Same week of work, run two ways. These are illustrative estimates of a typical ' +
    'AI-assisted week — written from common workflows, not measured from test data.',

  selectorHeading: 'See what this looks like for your work',
  selectorSubtitle: 'Choose your role for a more relevant estimate.',
  /** Shown in the dropdown before a role is chosen. */
  selectorPlaceholder: 'Select your work',
  selectorLabel: 'Select the kind of work you do',

  /** The dashed panel shown before a role is chosen. */
  idle:
    'Tell us what you do and we’ll show how AI could save you time, money and effort ' +
    'for that work.',

  /*
   * The handoff's per-role footnote read "Median across a typical week", which
   * is the same unearned measurement claim in miniature.
   */
  estimateNote: 'An indicative week for this kind of work — not a measured result.',

  /** Shown when the estimates cannot be loaded. The table above still stands. */
  unavailable: 'Role estimates are unavailable right now. The comparison above still applies.',
  /** Shown if a selected role somehow has no estimate behind it. */
  missingEstimate: 'No estimate is written for that kind of work yet.',

  metricLabels: {
    time: 'Time saved',
    cost: 'Cost saved',
    effort: 'Effort reduced',
  },
} as const
