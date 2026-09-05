/*
 * Candidate selection.
 *
 * Turns a scored catalogue into the shortlist the assistant will be shown.
 * Three jobs, in order: rank deterministically, guarantee stage coverage, and
 * cap the list (ASSISTANT_ARCHITECTURE_PLAN.md §9).
 *
 * ── Why stage coverage is a guarantee and not a nicety ────────────────────────
 *
 * A plan is a sequence of steps. Without at least two candidates at a step the
 * model has no choice to make, and a model that believes a step is necessary but
 * finds no tool for it will invent one. Reserving slots per stage costs a few
 * places at the bottom of a 30-item list and removes an entire class of
 * hallucination.
 *
 * ── And why it is never faked ─────────────────────────────────────────────────
 *
 * When the catalogue genuinely has fewer than two active tools for a stage, the
 * shortfall is REPORTED, in `coverage`, not padded with the next-best unrelated
 * record. Phase E reads that field and drops the stage from the plan rather than
 * asking the model to staff it. Silently substituting a plausible-looking tool
 * would be the worse failure: the plan would look complete and be wrong.
 */

import { RETRIEVAL } from '../config/limits.ts'
import type { WorkflowStage } from '../domain/types.ts'
import type { ScoredTool } from './score.ts'

export interface StageCoverage {
  stage: WorkflowStage
  /** How many candidates were asked for — RETRIEVAL.minPerStage. */
  required: number
  /** How many the scored set could offer at all. */
  available: number
  /** How many made the final shortlist. */
  selected: number
  /** False when the catalogue itself cannot staff this stage. */
  satisfied: boolean
}

export interface SelectionOptions {
  scored: readonly ScoredTool[]
  stages?: readonly WorkflowStage[]
  limit?: number
}

export interface Selection {
  candidates: ScoredTool[]
  coverage: StageCoverage[]
  /** Stages the catalogue could not staff. Empty in the healthy case. */
  unmetStages: WorkflowStage[]
}

/**
 * Total ordering: score, then popularity, then id.
 *
 * The id tiebreak is not decoration. Two tools can score identically, and
 * without a final deterministic key the shortlist would differ between runs on
 * different engines — which would make every ranking test flaky and every
 * cursor unreliable.
 */
function byRank(a: ScoredTool, b: ScoredTool): number {
  if (b.score !== a.score) return b.score - a.score
  if (b.tool.pop !== a.tool.pop) return b.tool.pop - a.tool.pop
  return a.tool.id.localeCompare(b.tool.id)
}

export function selectCandidates(options: SelectionOptions): Selection {
  const stages = options.stages ?? []
  const limit = Math.min(
    Math.max(options.limit ?? RETRIEVAL.defaultCandidates, 1),
    RETRIEVAL.maxCandidates,
  )

  // Only active records are recommendable, and a rejected tool scores -Infinity.
  const ranked = options.scored
    .filter((entry) => entry.tool.status === 'active' && Number.isFinite(entry.score))
    .sort(byRank)

  const chosen: ScoredTool[] = []
  const chosenIds = new Set<string>()

  const take = (entry: ScoredTool): void => {
    if (chosenIds.has(entry.tool.id)) return
    chosenIds.add(entry.tool.id)
    chosen.push(entry)
  }

  /*
   * Stage reservations first, then the general ranking fills the rest.
   *
   * Doing it in this order means the guarantee holds even when every top-scoring
   * record happens to serve the same stage — which is exactly the case where the
   * guarantee earns its keep.
   */
  const reserved = Math.min(stages.length * RETRIEVAL.minPerStage, limit)
  const coverage: StageCoverage[] = []

  for (const stage of stages) {
    const forStage = ranked.filter((entry) => entry.tool.stages.includes(stage))
    let selected = 0
    for (const entry of forStage) {
      if (selected >= RETRIEVAL.minPerStage) break
      if (chosen.length >= reserved && !chosenIds.has(entry.tool.id)) {
        // Reservation budget spent; the general pass may still pick these up.
        break
      }
      if (!chosenIds.has(entry.tool.id)) take(entry)
      selected += 1
    }
    coverage.push({
      stage,
      required: RETRIEVAL.minPerStage,
      available: forStage.length,
      selected,
      satisfied: forStage.length >= RETRIEVAL.minPerStage,
    })
  }

  for (const entry of ranked) {
    if (chosen.length >= limit) break
    take(entry)
  }

  // The reservation pass can insert a lower-scoring tool ahead of a higher one;
  // the caller is owed a list in score order regardless of how it was assembled.
  chosen.sort(byRank)

  return {
    candidates: chosen.slice(0, limit),
    coverage,
    unmetStages: coverage.filter((entry) => !entry.satisfied).map((entry) => entry.stage),
  }
}
