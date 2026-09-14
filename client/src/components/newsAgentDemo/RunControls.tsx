/*
 * Run controls.
 *
 * The News Agent has no "topic" input: NEWS_AGENT.md §7 step 1 starts from the
 * configured source registry and discovers its own stories, and §11 selects
 * among them by score. So this is the discovery form the architecture actually
 * has — optionally narrowed to one source, which maps to the existing
 * `npm run agent -- --source=<id>` flag.
 */

import { useState } from 'react'
import type { DemoEnvironment } from '@/types/newsAgentDemo'

export default function RunControls({
  environment,
  running,
  hasRun,
  onRun,
  onReset,
}: {
  environment: DemoEnvironment | undefined
  running: boolean
  hasRun: boolean
  onRun: (input: { sourceId?: string; limit: number; dryRun: boolean }) => void
  onReset: () => void
}) {
  const [sourceId, setSourceId] = useState('')
  const [dryRun, setDryRun] = useState(false)

  const enabledSources = environment?.sources.filter((source) => source.enabled) ?? []
  const blocked = environment ? !environment.canRun : true
  const canPublishRun = !blocked && !running
  const canDryRun = Boolean(environment) && !running

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="min-w-56 flex-1">
          <span className="block text-[11px] uppercase tracking-wide text-zinc-500">
            Run news discovery from
          </span>
          <select
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            disabled={running}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 font-mono text-sm text-zinc-200 disabled:opacity-50"
          >
            <option value="">All enabled sources ({enabledSources.length})</option>
            {enabledSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.publisher} — {source.id} (tier {source.trustTier})
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 pb-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(event) => setDryRun(event.target.checked)}
            disabled={running}
            className="size-4 accent-amber-500"
          />
          Dry run (no WordPress write)
        </label>

        <button
          type="button"
          disabled={dryRun ? !canDryRun : !canPublishRun}
          onClick={() => onRun({ ...(sourceId ? { sourceId } : {}), limit: 1, dryRun })}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {running ? 'Running…' : 'Run Pipeline'}
        </button>

        <button
          type="button"
          disabled={running || !hasRun}
          onClick={onReset}
          className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        One run generates at most one article ({' '}
        <span className="font-mono">AGENT_MAX_ARTICLES_PER_RUN</span>). The agent discovers stories
        from its source registry and scores them — it is not given a topic.
        {blocked && !dryRun ? (
          <span className="text-red-400"> Publishing is blocked; tick “Dry run” to demonstrate the pipeline.</span>
        ) : null}
      </p>
    </div>
  )
}
