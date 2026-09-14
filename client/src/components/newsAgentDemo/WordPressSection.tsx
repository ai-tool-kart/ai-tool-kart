/*
 * Stage 7 — the WordPress draft.
 *
 * The button opens the wp-admin editor screen for the post the pipeline created,
 * on the LOCAL CMS. The base URL shown is the one the run actually used, taken
 * from the WordPress client, so what is on screen is what was written to.
 */

import { Card, Empty, Field, Pill } from './primitives'
import { formatTime } from './format'
import type { RunState, StoryState } from '@/types/newsAgentDemo'

export default function WordPressSection({ run, story }: { run: RunState; story?: StoryState }) {
  const result = story?.wordpress
  const stage = story?.stages.find((entry) => entry.id === 'wordpress')

  return (
    <Card
      title="7 · WordPress output"
      subtitle="NEWS_AGENT.md §7 steps 14-16, §18 — drafts only; the MVP has no code path that can publish"
      right={
        result ? (
          <Pill tone={result.status === 'created' ? 'good' : result.status === 'failed' ? 'bad' : 'warn'}>
            {result.status}
          </Pill>
        ) : null
      }
    >
      {!result ? (
        <Empty>
          {stage?.status === 'running'
            ? 'Creating the WordPress draft…'
            : run.status === 'running'
              ? 'Waiting for an approved draft…'
              : 'Nothing was sent to WordPress this run.'}
        </Empty>
      ) : result.status === 'created' ? (
        <div className="space-y-3">
          <p className="text-base font-semibold text-emerald-300">✓ WordPress draft created</p>

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Post ID">
              <span className="font-mono">{result.wpPostId}</span>
            </Field>
            <Field label="Status">
              <span className="font-mono">{result.postStatus}</span>
            </Field>
            <Field label="Created">{formatTime(result.createdAt)}</Field>
            <Field label="Slug">
              <span className="break-all font-mono text-xs">{result.slug}</span>
            </Field>
          </dl>

          <Field label="Local WordPress">
            <span className="break-all font-mono text-xs text-zinc-400">{result.baseUrl}</span>
          </Field>

          {result.editorUrl ? (
            <a
              href={result.editorUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              Open WordPress Draft →
            </a>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <p
            className={`text-sm ${
              result.status === 'failed' ? 'text-red-300' : 'text-amber-300'
            }`}
          >
            {result.status === 'dry-run'
              ? 'Dry run — the draft was approved but no WordPress request was made.'
              : `WordPress step did not create a post: ${result.reason ?? result.status}`}
          </p>
          {result.baseUrl ? (
            <Field label="Local WordPress">
              <span className="break-all font-mono text-xs text-zinc-400">{result.baseUrl}</span>
            </Field>
          ) : null}
        </div>
      )}
      {run.pendingPublications && run.pendingPublications.created > 0 ? (
        <p className="mt-3 rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-[11px] text-zinc-400">
          Step 1b also published {run.pendingPublications.created} draft(s) approved by an earlier
          run but never posted. Those are separate from this run’s story.
        </p>
      ) : null}
    </Card>
  )
}
