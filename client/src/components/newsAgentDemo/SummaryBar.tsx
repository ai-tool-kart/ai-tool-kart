/*
 * Run summary.
 *
 * Every number comes from the pipeline's own counters and artifacts. Fields the
 * run never produced are omitted rather than shown as zero — a dash would read
 * as "none found" when the truth is "the pipeline never got there".
 */

import { Pill } from './primitives'
import type { RunState } from '@/types/newsAgentDemo'

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' }) {
  const colour =
    tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : tone === 'warn' ? 'text-amber-300' : 'text-zinc-100'
  return (
    <div>
      <p className={`font-mono text-lg ${colour}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  )
}

export default function SummaryBar({ run }: { run: RunState }) {
  const summary = run.summary
  const finished = run.status === 'completed' || run.status === 'failed' || run.status === 'skipped'

  const heading =
    run.status === 'failed'
      ? 'Pipeline failed'
      : run.status === 'skipped'
        ? 'Run skipped'
        : finished
          ? 'Pipeline complete'
          : 'Pipeline running…'

  const tone =
    run.status === 'failed' ? 'bad' : finished ? 'good' : 'warn'

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-100">{heading}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {run.dryRun ? <Pill tone="warn">DRY RUN</Pill> : null}
          <Pill tone={tone === 'bad' ? 'bad' : tone === 'good' ? 'good' : 'warn'}>{run.status}</Pill>
          <span className="font-mono text-[11px] text-zinc-500">run {run.runId.slice(0, 8)}</span>
        </div>
      </div>

      {run.failure ? (
        <div className="mt-3 rounded border border-red-800 bg-red-950/50 px-3 py-2">
          <p className="text-sm text-red-200">{run.failure.message}</p>
          {run.failure.hint ? <p className="mt-1 text-xs text-red-300/80">{run.failure.hint}</p> : null}
        </div>
      ) : null}

      {run.note ? <p className="mt-3 text-sm text-amber-300">{run.note}</p> : null}

      {summary ? (
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Sources fetched" value={`${summary.sourcesChecked}`} />
          <Stat label="Items discovered" value={`${summary.itemsDiscovered}`} />
          <Stat label="Stories considered" value={`${summary.storiesConsidered}`} />
          <Stat label="Evidence sources" value={`${summary.evidenceSources}`} />
          <Stat label="Claims checked" value={`${summary.claimsExtracted}`} />
          <Stat label="Claims verified" value={`${summary.claimsVerified}`} tone="good" />
          {summary.claimsSingleSource > 0 ? (
            <Stat label="Single-source" value={`${summary.claimsSingleSource}`} tone="warn" />
          ) : null}
          {summary.claimsConflicting > 0 ? (
            <Stat label="Conflicting" value={`${summary.claimsConflicting}`} tone="bad" />
          ) : null}
          {summary.articleWords !== undefined ? (
            <Stat label="Article words" value={summary.articleWords.toLocaleString()} />
          ) : null}
          {summary.qualityChecksTotal !== undefined ? (
            <Stat
              label="Quality checks"
              value={`${summary.qualityChecksPassed}/${summary.qualityChecksTotal}`}
              tone={summary.qualityChecksPassed === summary.qualityChecksTotal ? 'good' : 'warn'}
            />
          ) : null}
          <Stat label="LLM calls" value={`${summary.llmCalls}`} />
          <Stat label="LLM tokens" value={summary.llmTokens.toLocaleString()} />
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <p className="font-mono text-sm text-zinc-200">{summary.wordpressStatus}</p>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">WordPress</p>
          </div>
        </div>
      ) : null}

      {run.errors.length > 0 ? (
        <div className="mt-4 rounded border border-red-900/70 bg-red-950/30 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-300">
            Run errors ({run.errors.length})
          </p>
          <ul className="mt-1 space-y-1">
            {run.errors.slice(0, 6).map((error, index) => (
              <li key={index} className="font-mono text-[11px] text-red-200">
                [{error.step}] {error.code}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
