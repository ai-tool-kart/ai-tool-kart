/*
 * The safety banner.
 *
 * Two jobs, in this order: say which CMS this dashboard is pointed at, and make
 * it impossible to miss when that CMS is not a local one. The Run button is
 * disabled from the same descriptor that the server uses to refuse the request,
 * so the UI and the server can never disagree about whether a run is allowed.
 */

import type { DemoEnvironment } from '@/types/newsAgentDemo'

export default function EnvironmentBanner({
  environment,
  error,
  onRetry,
}: {
  environment: DemoEnvironment | undefined
  error: string | undefined
  onRetry: () => void
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3">
        <p className="text-sm font-semibold text-red-200">Demo server unreachable</p>
        <p className="mt-1 font-mono text-xs text-red-300">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded border border-red-700 px-2 py-1 text-xs text-red-200 hover:bg-red-900/60"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!environment) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-500">
        Checking environment…
      </div>
    )
  }

  const { wordpress, llm } = environment
  const isLocal = wordpress.locality === 'local'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <span className="rounded border border-emerald-700/60 bg-emerald-950/60 px-2 py-1 font-mono text-xs text-emerald-300">
          Environment: LOCAL DEVELOPMENT
        </span>

        <span className="font-mono text-xs">
          <span className="text-zinc-500">WordPress: </span>
          <span className={isLocal ? 'text-emerald-300' : 'text-red-300'}>
            {wordpress.apiUrl ?? 'not configured'}
          </span>
          <span className={`ml-2 ${isLocal ? 'text-emerald-500' : 'text-red-400'}`}>
            [{wordpress.locality}]
          </span>
        </span>

        <span className="font-mono text-xs text-zinc-500">
          LLM: <span className="text-zinc-300">{llm.provider}</span>
          {llm.modelStrong ? <span className="text-zinc-400"> · {llm.modelStrong}</span> : null}
          <span className={llm.apiKeyConfigured ? 'text-emerald-400' : 'text-amber-400'}>
            {llm.apiKeyConfigured ? ' · key set' : ' · no key'}
          </span>
        </span>

        {wordpress.username ? (
          <span className="font-mono text-xs text-zinc-500">
            WP user: <span className="text-zinc-300">{wordpress.username}</span>
          </span>
        ) : null}
      </div>

      {!environment.canRun && (
        <div className="rounded-lg border-2 border-red-700 bg-red-950/60 px-4 py-4">
          <p className="text-base font-bold text-red-200">
            ⛔ Pipeline runs are blocked — the configured WordPress is not local
          </p>
          <p className="mt-2 text-sm leading-relaxed text-red-200/90">{environment.blockedReason}</p>
          <p className="mt-2 text-xs text-red-300/80">
            A dry run is still available: it executes every stage and stops before any WordPress
            request is made.
          </p>
        </div>
      )}
    </div>
  )
}
