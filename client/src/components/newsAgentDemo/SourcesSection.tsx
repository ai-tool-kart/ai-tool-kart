/*
 * Stage 2 — research / source collection.
 *
 * One card per source the agent actually fetched, with the metadata the pipeline
 * recorded. The excerpt is bounded server-side (observer.ts): this shows what
 * the agent read, not the whole scraped page.
 *
 * Quarantined sources are shown deliberately. A source withheld for attempting
 * prompt injection (§28) is one of the strongest things to be able to point at
 * in a demo, and hiding it would misrepresent what the pipeline did.
 */

import { Card, Empty, Pill, TierPill } from './primitives'
import { formatDate, formatTime } from './format'
import type { RunState, StoryState } from '@/types/newsAgentDemo'

export default function SourcesSection({ run, story }: { run: RunState; story?: StoryState }) {
  const feedFailures = run.discovery.sources.filter((source) => !source.ok)
  const evidence = story?.evidence

  return (
    <Card
      title="2 · Research — evidence gathered"
      subtitle="NEWS_AGENT.md §7 step 9 — the pages the agent fetched and is allowed to reason from"
      right={
        evidence ? (
          <Pill tone={evidence.sufficient ? 'good' : 'bad'}>
            {evidence.sufficient ? 'Sufficient' : (evidence.reason ?? 'Insufficient')}
          </Pill>
        ) : null
      }
    >
      <div className="space-y-3">
        <p className="font-mono text-xs text-zinc-500">
          {run.discovery.sourcesChecked} feed(s) fetched · {run.discovery.itemsDiscovered} item(s)
          discovered
          {run.discovery.sourcesFailed > 0 ? (
            <span className="text-amber-400"> · {run.discovery.sourcesFailed} feed(s) failed</span>
          ) : null}
          {run.dedupe ? <span> · {run.dedupe.itemsDuplicate} duplicate(s) dropped</span> : null}
        </p>

        {feedFailures.length > 0 ? (
          <div className="rounded border border-amber-900/70 bg-amber-950/30 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-amber-400">Feeds that failed</p>
            <ul className="mt-1 space-y-0.5">
              {feedFailures.map((source) => (
                <li key={source.sourceId} className="font-mono text-[11px] text-amber-200/90">
                  {source.publisher}: {source.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!evidence ? (
          <Empty>
            {run.status === 'running'
              ? 'Waiting for a story to reach evidence gathering…'
              : 'No evidence was gathered — no story reached this stage.'}
          </Empty>
        ) : evidence.sources.length === 0 ? (
          <Empty>No source page could be retrieved for this story.</Empty>
        ) : (
          <ul className="space-y-2">
            {evidence.sources.map((source) => (
              <li
                key={source.url}
                className={`rounded border px-3 py-2.5 ${
                  source.quarantined
                    ? 'border-red-800/70 bg-red-950/30'
                    : 'border-zinc-800 bg-zinc-950/50'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-100">{source.publisher}</span>
                  <TierPill tier={source.trustTier} />
                  <Pill tone="neutral">{source.sourceType}</Pill>
                  {source.quarantined ? <Pill tone="bad">quarantined — prompt injection</Pill> : null}
                </div>

                <p className="mt-1 text-sm text-zinc-300">{source.title}</p>

                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-500">
                  <span>published {formatDate(source.publishedAt)}</span>
                  <span>retrieved {formatTime(source.retrievedAt)}</span>
                  <span>{source.factsExtracted} fact(s) extracted</span>
                </div>

                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate font-mono text-[11px] text-sky-400 underline decoration-dotted hover:text-sky-300"
                >
                  {source.url}
                </a>

                {source.excerpt ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300">
                      Retrieved text (first {source.excerpt.length} chars)
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-400">
                      {source.excerpt}
                      {source.excerptTruncated ? '…' : ''}
                    </p>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {evidence && evidence.failed > 0 ? (
          <p className="font-mono text-[11px] text-amber-400">
            {evidence.failed} source page(s) could not be retrieved (blocked or unreachable).
          </p>
        ) : null}
      </div>
    </Card>
  )
}
