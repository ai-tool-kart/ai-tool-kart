/*
 * Run summary rendering (NEWS_AGENT.md §26).
 *
 * One line an operator can scan, plus the full record persisted to SQLite. The
 * questions §26 lists — how many discovered, deduped, rejected, verified,
 * generated, drafted, and what failed — are all answerable from these fields.
 */

import type { PipelineRun } from '../domain/types.ts'

export function formatRunSummary(run: PipelineRun): string {
  const counters = run.counters
  const parts = [
    `run=${run.id}`,
    `status=${run.status}`,
    run.dryRun ? 'mode=dry-run' : 'mode=live',
    `sources=${counters.sourcesChecked - counters.sourcesFailed}/${counters.sourcesChecked}`,
    `items=${counters.itemsDiscovered}`,
    `duplicates=${counters.itemsDuplicate}`,
    `rejected=${counters.itemsRejected}`,
    `candidates=${counters.storiesCandidate}`,
    `verified=${counters.storiesVerified}`,
    `seo=${counters.seoBriefsCreated ?? 0}`,
    `generated=${counters.articlesGenerated}`,
    `approved=${counters.articlesApproved}`,
    `drafts=${counters.draftsCreated}`,
    // ?? 0: runs persisted before this counter existed have no such key.
    `retried=${counters.pendingRetried ?? 0}`,
    `deferred=${counters.storiesDeferred}`,
    `llm_calls=${run.llmUsage.calls}`,
    `tokens=${run.llmUsage.inputTokens + run.llmUsage.outputTokens}`,
    `errors=${run.errors.length}`,
  ]
  return parts.join(' ')
}

export function formatDuration(run: PipelineRun): string {
  if (!run.finishedAt) return 'unknown'
  const ms = Date.parse(run.finishedAt) - Date.parse(run.startedAt)
  if (!Number.isFinite(ms) || ms < 0) return 'unknown'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}
