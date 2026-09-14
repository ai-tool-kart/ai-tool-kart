/*
 * Stage 1 — story discovery and selection.
 *
 * Shows what the classifier decided and why. `reason` is the classifier's own
 * `reasoning` field; the scores are the weighted ranking from §11. Stories the
 * pipeline rejected are listed too — a demo that only shows the winner hides the
 * most interesting thing the agent does, which is say no.
 */

import { Card, Empty, Field, Pill, TierPill } from './primitives'
import { formatDate } from './format'
import type { RunState, StoryCard } from '@/types/newsAgentDemo'

function Scores({ story }: { story: StoryCard }) {
  const entries: Array<[string, number]> = [
    ['relevance', story.scores.relevance],
    ['importance', story.scores.importance],
    ['freshness', story.scores.freshness],
    ['source trust', story.scores.sourceTrust],
    ['weighted', story.scores.weighted],
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([label, value]) => (
        <span
          key={label}
          className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
            label === 'weighted'
              ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400'
          }`}
        >
          {label} {value.toFixed(1)}
        </span>
      ))}
    </div>
  )
}

export default function StorySection({ run, story }: { run: RunState; story?: StoryCard }) {
  const rejected = run.selection.classified.filter((entry) => entry.selected === false)

  return (
    <div className="space-y-3">
      <Card
        title="1 · Story selection"
        subtitle="NEWS_AGENT.md §7 steps 2-8 — ingest, dedupe, classify, rank, select"
      >
        {story ? (
          <div className="space-y-3">
            <div>
              <p className="text-base font-semibold text-zinc-100">{story.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {story.category ? <Pill tone="neutral">{story.category}</Pill> : null}
                {story.recommendation ? (
                  <Pill tone={story.recommendation === 'proceed' ? 'good' : 'warn'}>
                    {story.recommendation}
                  </Pill>
                ) : null}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Published">{formatDate(story.publishedAt)}</Field>
              <Field label="First seen">{formatDate(story.firstSeenAt)}</Field>
              <Field label="Clustered items">{story.items.length}</Field>
              <Field label="Story id">
                <span className="font-mono text-xs text-zinc-400">{story.storyId.slice(0, 12)}</span>
              </Field>
            </dl>

            <Scores story={story} />

            {story.reason ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Why the classifier selected it
                </p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-300">{story.reason}</p>
              </div>
            ) : null}

            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                Feed items clustered into this story
              </p>
              <ul className="mt-1 space-y-1.5">
                {story.items.map((item) => (
                  <li key={item.url} className="flex flex-wrap items-baseline gap-2">
                    <TierPill tier={item.trustTier} />
                    <span className="text-sm text-zinc-300">{item.publisher}</span>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-xs text-sky-400 underline decoration-dotted hover:text-sky-300"
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <Empty>
            {run.status === 'running'
              ? 'Scoring candidate stories…'
              : 'No story was selected this run. Every candidate was rejected by the prefilter or scored below the threshold.'}
          </Empty>
        )}
      </Card>

      {rejected.length > 0 ? (
        <Card
          title={`Rejected candidates (${rejected.length})`}
          subtitle="Stories the pipeline declined, with the reason it recorded"
        >
          <ul className="space-y-2">
            {rejected.slice(0, 12).map((entry) => (
              <li key={entry.storyId} className="flex flex-wrap items-baseline gap-2">
                <span className="text-red-400">✕</span>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-400">{entry.title}</span>
                <span className="font-mono text-[11px] text-zinc-600">
                  w {entry.scores.weighted.toFixed(1)}
                </span>
                <span className="font-mono text-[11px] text-red-400/80">{entry.rejectionReason}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
