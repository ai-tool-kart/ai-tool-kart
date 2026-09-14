/*
 * Technical Activity — the agent's own log lines.
 *
 * These come from the pipeline logger, already passed through its redactor
 * (utils/logger.ts), which scrubs registered secrets and Authorization headers.
 * The agent never logs prompts, source bodies or provider payloads in the first
 * place, so there is nothing here to leak.
 */

import { useEffect, useRef, useState } from 'react'
import { formatTime } from './format'
import type { RunState } from '@/types/newsAgentDemo'

export default function ActivityLog({ run }: { run: RunState }) {
  const [open, setOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' })
  }, [open, run.logs.length])

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Technical Activity ({run.logs.length})
        </span>
        <span className="font-mono text-xs text-zinc-500">{open ? '▾' : '▸'}</span>
      </button>

      {open ? (
        <div className="max-h-80 overflow-auto border-t border-zinc-800 bg-zinc-950 px-4 py-2">
          {run.logs.length === 0 ? (
            <p className="py-2 text-xs text-zinc-600">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {run.logs.map((entry, index) => (
                <li key={index} className="flex gap-2 font-mono text-[11px] leading-relaxed">
                  <span className="shrink-0 text-zinc-600">{formatTime(entry.at)}</span>
                  <span
                    className={
                      entry.level === 'error'
                        ? 'text-red-300'
                        : entry.level === 'warn'
                          ? 'text-amber-300'
                          : 'text-zinc-400'
                    }
                  >
                    {entry.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div ref={endRef} />
        </div>
      ) : null}
    </div>
  )
}
