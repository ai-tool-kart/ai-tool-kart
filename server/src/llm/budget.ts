/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY COPY. Phase H moves the News Agent's version into shared/llm and
 * deletes this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LLM budget — a circuit breaker, not an accountant.
 *
 * Bounds how much one unit of work may spend. In the News Agent that unit is a
 * pipeline run; here it is one assistant turn, created per request in Phase E so
 * one pathological conversation cannot spend another user's headroom.
 *
 * What it is NOT, deliberately: per-user billing, a database-backed quota, or a
 * rate limiter. Rate limiting is per-IP and belongs to Phase I's HTTP layer
 * (ASSISTANT_ARCHITECTURE_PLAN.md §13). Mixing the two here would put a
 * business concern inside a directory destined to be shared infrastructure.
 *
 * Reaching a cap says nothing about the quality of the request, which is why
 * exhausted() exists alongside assertCanCall(): a caller can DEFER work rather
 * than reject it. Phase E uses it to degrade to a clarifying question instead of
 * failing the turn.
 */

import { budgetExceeded } from './errors.ts'
import type { LLMUsage } from './provider.ts'

export interface BudgetLimits {
  maxLlmCalls: number
  maxTokens: number
}

export interface Budget {
  readonly usage: LLMUsage
  /** Throws BUDGET_EXCEEDED when the next call would exceed a cap. */
  assertCanCall(): void
  record(inputTokens: number, outputTokens: number): void
  /** True when no further calls are permitted; used to defer, not to reject. */
  exhausted(): boolean
  remainingCalls(): number
}

export function createBudget(limits: BudgetLimits): Budget {
  const usage: LLMUsage = { calls: 0, inputTokens: 0, outputTokens: 0 }

  const totalTokens = (): number => usage.inputTokens + usage.outputTokens

  return {
    usage,

    /*
     * Checked BEFORE the call, never after.
     *
     * A cap tested only on the way out would always permit one final
     * unbounded request — which is precisely the request a runaway loop makes.
     */
    assertCanCall() {
      if (usage.calls >= limits.maxLlmCalls) {
        throw budgetExceeded(`LLM call budget exhausted (${limits.maxLlmCalls} calls)`, {
          calls: usage.calls,
        })
      }
      if (totalTokens() >= limits.maxTokens) {
        throw budgetExceeded(`LLM token budget exhausted (${limits.maxTokens} tokens)`, {
          tokens: totalTokens(),
        })
      }
    },

    record(inputTokens, outputTokens) {
      // A call counts even when it returned nothing usable: a refused or failed
      // request still cost a round trip, and not counting it is how a retry loop
      // spends forever.
      usage.calls += 1
      usage.inputTokens += Math.max(0, inputTokens)
      usage.outputTokens += Math.max(0, outputTokens)
    },

    exhausted() {
      return usage.calls >= limits.maxLlmCalls || totalTokens() >= limits.maxTokens
    },

    remainingCalls() {
      return Math.max(0, limits.maxLlmCalls - usage.calls)
    },
  }
}
