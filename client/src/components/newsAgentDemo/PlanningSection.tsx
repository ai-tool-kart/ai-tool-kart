/*
 * Stage 4 — article planning.
 *
 * The pipeline has no LLM "outline" step. What it has instead is a deterministic
 * FORMAT DECISION (editorial/format.ts, §7 step 11b): how much article the
 * verified evidence actually supports, computed from claim and source counts
 * before the writer runs, and used as a constraint by both the writer and the
 * editor.
 *
 * That is shown here honestly rather than dressed up as an outline. When the
 * SEO brief step is wired into the orchestrator, its structured plan (title,
 * meta description, suggested headings) appears alongside it automatically.
 */

import { Card, Empty, Pill } from './primitives'
import type { RunState, StoryState } from '@/types/newsAgentDemo'

export default function PlanningSection({ run, story }: { run: RunState; story?: StoryState }) {
  const decision = story?.format
  const seo = story?.article?.seo

  return (
    <Card
      title="4 · Article planning"
      subtitle="NEWS_AGENT.md §7 step 11b, §15 — length is an output of evidence, never a target"
      right={decision ? <Pill tone="neutral">{decision.format}</Pill> : null}
    >
      {!decision ? (
        <Empty>
          {run.status === 'running'
            ? 'Waiting for verification to finish…'
            : 'No format decision was made — no story reached this stage.'}
        </Empty>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Decision</p>
            <p className="mt-0.5 text-sm text-zinc-200">{decision.reason}</p>
            <p className="mt-1 font-mono text-xs text-zinc-400">
              target {decision.targetMinWords}–{decision.targetMaxWords} words
            </p>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
              Signals the decision was computed from
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(decision.signals).map(([key, value]) => (
                <span
                  key={key}
                  className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400"
                >
                  {key.replace(/([A-Z])/g, ' $1').toLowerCase()} {value}
                </span>
              ))}
            </div>
          </div>

          {seo ? (
            <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Search brief</p>
              <p className="text-sm text-zinc-200">{seo.seoTitle}</p>
              <p className="text-xs text-zinc-400">{seo.metaDescription}</p>
              <div className="flex flex-wrap gap-2">
                <Pill tone="neutral">{seo.searchIntent}</Pill>
                <Pill tone="neutral">{seo.primaryKeyword}</Pill>
                {seo.secondaryKeywords.map((keyword) => (
                  <Pill key={keyword} tone="neutral">
                    {keyword}
                  </Pill>
                ))}
              </div>
              {seo.suggestedHeadings.length > 0 ? (
                <ol className="list-decimal space-y-0.5 pl-5 text-sm text-zinc-300">
                  {seo.suggestedHeadings.map((heading) => (
                    <li key={heading}>{heading}</li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : (
            <p className="rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-[11px] text-zinc-500">
              This run produced no separate outline or SEO brief. The pipeline plans an article by
              choosing its format from verified evidence (above); the section structure itself is
              produced by the writer in step 12.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
