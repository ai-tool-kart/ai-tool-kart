/*
 * The vertical pipeline view.
 *
 * Stage names and step numbers come from the server, which takes them from
 * NEWS_AGENT.md §7 — so this list is the real pipeline, not a narrative of it.
 */

import { STATUS_STYLES, duration, formatTime } from './format'
import type { StageState } from '@/types/newsAgentDemo'

export default function StageList({ stages, title }: { stages: StageState[]; title: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60">
      <header className="border-b border-zinc-800 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>
      </header>
      <ol className="divide-y divide-zinc-800/70">
        {stages.map((stage) => {
          const style = STATUS_STYLES[stage.status]
          return (
            <li key={stage.id} className="flex items-start gap-3 px-4 py-2.5">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${style.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm text-zinc-200">{stage.label}</span>
                  <span className="font-mono text-[11px] text-zinc-600">{stage.steps}</span>
                </div>
                {stage.detail ? (
                  <p
                    className={`mt-0.5 font-mono text-[11px] ${
                      stage.status === 'failed' ? 'text-red-300' : 'text-zinc-500'
                    }`}
                  >
                    {stage.detail}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <span className={`font-mono text-[11px] ${style.text}`}>{style.label}</span>
                {stage.startedAt ? (
                  <p className="font-mono text-[10px] text-zinc-600">
                    {formatTime(stage.startedAt)}
                    {stage.finishedAt ? ` · ${duration(stage.startedAt, stage.finishedAt)}` : ''}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
