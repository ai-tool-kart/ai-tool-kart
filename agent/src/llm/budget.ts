/*
 * Per-run LLM budget (NEWS_AGENT.md §27).
 *
 * A circuit breaker, not an accountant. When a cap is reached the run stops
 * spending and defers the remaining work — deferred stories stay candidates for
 * the next run rather than being rejected, because running out of budget says
 * nothing about a story's quality.
 */

import { budgetExceeded } from '../domain/errors.ts'
import type { LlmUsage } from '../domain/types.ts'

export interface BudgetLimits {
  maxLlmCallsPerRun: number
  maxTokensPerRun: number
}

export interface Budget {
  readonly usage: LlmUsage
  /** Throws when the next call would exceed a cap. */
  assertCanCall(): void
  record(inputTokens: number, outputTokens: number): void
  /** True when no further calls are permitted; used to defer, not to reject. */
  exhausted(): boolean
  remainingCalls(): number
}

export function createBudget(limits: BudgetLimits): Budget {
  const usage: LlmUsage = { calls: 0, inputTokens: 0, outputTokens: 0 }

  const totalTokens = () => usage.inputTokens + usage.outputTokens

  return {
    usage,

    assertCanCall() {
      if (usage.calls >= limits.maxLlmCallsPerRun) {
        throw budgetExceeded(`LLM call budget exhausted (${limits.maxLlmCallsPerRun} calls)`, {
          calls: usage.calls,
        })
      }
      if (totalTokens() >= limits.maxTokensPerRun) {
        throw budgetExceeded(`LLM token budget exhausted (${limits.maxTokensPerRun} tokens)`, {
          tokens: totalTokens(),
        })
      }
    },

    record(inputTokens, outputTokens) {
      usage.calls += 1
      usage.inputTokens += Math.max(0, inputTokens)
      usage.outputTokens += Math.max(0, outputTokens)
    },

    exhausted() {
      return usage.calls >= limits.maxLlmCallsPerRun || totalTokens() >= limits.maxTokensPerRun
    },

    remainingCalls() {
      return Math.max(0, limits.maxLlmCallsPerRun - usage.calls)
    },
  }
}
