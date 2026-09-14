/*
 * News Agent pipeline dashboard — internal demo/observability surface.
 *
 * Deliberately outside PageShell: this is an admin/debug screen, not part of the
 * product, and it should never be mistaken for the AI Tool Kart UI.
 *
 * It contains NO pipeline logic. Every value on the page was produced by a real
 * run of the agent in `news agent/` and arrived over the demo server's event
 * stream. Where the pipeline produced nothing, the page says so rather than
 * filling the space.
 */

import { useMemo } from 'react'
import { useNewsAgentDemo } from '@/hooks/useNewsAgentDemo'
import ActivityLog from '@/components/newsAgentDemo/ActivityLog'
import ArticleSection from '@/components/newsAgentDemo/ArticleSection'
import EnvironmentBanner from '@/components/newsAgentDemo/EnvironmentBanner'
import PlanningSection from '@/components/newsAgentDemo/PlanningSection'
import QualitySection from '@/components/newsAgentDemo/QualitySection'
import RunControls from '@/components/newsAgentDemo/RunControls'
import SourcesSection from '@/components/newsAgentDemo/SourcesSection'
import StageList from '@/components/newsAgentDemo/StageList'
import StorySection from '@/components/newsAgentDemo/StorySection'
import SummaryBar from '@/components/newsAgentDemo/SummaryBar'
import VerificationSection from '@/components/newsAgentDemo/VerificationSection'
import WordPressSection from '@/components/newsAgentDemo/WordPressSection'
import type { StoryState } from '@/types/newsAgentDemo'

export default function NewsAgentDemoPage() {
  const { environment, environmentError, run, running, error, start, reset, reloadEnvironment } =
    useNewsAgentDemo()

  /*
   * The focused story is the one that got furthest through the pipeline. A demo
   * run is capped at one article, so this is almost always the only story that
   * reached evidence gathering at all.
   */
  const focus: StoryState | undefined = useMemo(() => {
    if (!run || run.stories.length === 0) return undefined
    const rank = (story: StoryState) =>
      story.stages.filter((stage) => stage.status === 'completed').length
    return [...run.stories].sort((a, b) => rank(b) - rank(a))[0]
  }, [run])

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 font-sans text-zinc-200 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-zinc-50">News Agent Pipeline</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live observability for the AI Tool Kart news agent — discovery, verification, generation
            and WordPress drafting, as they happen.
          </p>
        </header>

        <EnvironmentBanner
          environment={environment}
          error={environmentError}
          onRetry={reloadEnvironment}
        />

        <RunControls
          environment={environment}
          running={running}
          hasRun={Boolean(run)}
          onRun={(input) => void start(input)}
          onReset={() => void reset()}
        />

        {error ? (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        ) : null}

        {!run ? (
          <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-12 text-center">
            <p className="text-sm text-zinc-500">
              No run yet. Press <span className="font-semibold text-zinc-300">Run Pipeline</span> to
              start one.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <SummaryBar run={run} />

            <div className="grid gap-4 lg:grid-cols-2">
              <StageList stages={run.stages} title="Run stages" />
              {focus ? <StageList stages={focus.stages} title="Story stages" /> : null}
            </div>

            {focus?.outcome && focus.outcome.outcome !== 'published' ? (
              <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3">
                <p className="text-sm text-amber-200">
                  Story outcome: <span className="font-mono">{focus.outcome.outcome}</span> at{' '}
                  <span className="font-mono">{focus.outcome.stage}</span>
                  {focus.outcome.reason ? (
                    <>
                      {' — '}
                      <span className="font-mono text-amber-300">{focus.outcome.reason}</span>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}

            <StorySection run={run} story={focus?.story ?? run.selection.selected[0]} />
            <SourcesSection run={run} story={focus} />
            <VerificationSection run={run} story={focus} />
            <PlanningSection run={run} story={focus} />
            <ArticleSection run={run} story={focus} />
            <QualitySection run={run} story={focus} />
            <WordPressSection run={run} story={focus} />
            <ActivityLog run={run} />
          </div>
        )}
      </div>
    </main>
  )
}
