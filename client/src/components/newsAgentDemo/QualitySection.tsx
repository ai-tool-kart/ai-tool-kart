/*
 * Stage 6 — editorial validation / quality control.
 *
 * The checklist is built server-side from the checks the pipeline genuinely
 * performs (observer.ts buildQualityChecks): the deterministic assertions in
 * editorial/validate.ts, the tier rules in verification/verify.ts, and the
 * Editor model's own verdict. Nothing is invented for the dashboard.
 */

import { Card, Empty, Pill } from './primitives'
import type { RunState, StoryState } from '@/types/newsAgentDemo'

export default function QualitySection({ run, story }: { run: RunState; story?: StoryState }) {
  const review = story?.editorial

  const passed = review?.checks.filter((check) => check.passed).length ?? 0
  const total = review?.checks.length ?? 0

  return (
    <Card
      title="6 · Quality control & final validation"
      subtitle="NEWS_AGENT.md §7 step 13 — the Editor pass plus deterministic policy that can override it"
      right={
        review ? (
          <div className="flex items-center gap-2">
            <Pill tone={passed === total ? 'good' : 'warn'}>
              {passed}/{total} checks
            </Pill>
            <Pill tone={review.verdict === 'approved' ? 'good' : 'bad'}>
              {review.verdict.toUpperCase()}
            </Pill>
          </div>
        ) : null
      }
    >
      {!review ? (
        <Empty>
          {run.status === 'running'
            ? 'Waiting for the editorial pass…'
            : 'No editorial review ran — no story reached this stage.'}
        </Empty>
      ) : (
        <div className="space-y-3">
          <p className="font-mono text-xs text-zinc-400">
            confidence {review.confidence.toFixed(2)}
          </p>

          <ul className="space-y-1">
            {review.checks.map((check) => (
              <li key={check.id} className="flex items-start gap-2">
                <span className={check.passed ? 'text-emerald-400' : 'text-red-400'}>
                  {check.passed ? '✓' : '✕'}
                </span>
                <div className="min-w-0 flex-1">
                  <span className={`text-sm ${check.passed ? 'text-zinc-300' : 'text-red-300'}`}>
                    {check.label}
                  </span>
                  {check.detail ? (
                    <p className="font-mono text-[11px] text-zinc-500">{check.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {review.notes ? (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Editor’s notes</p>
              <p className="mt-0.5 text-sm leading-relaxed text-zinc-300">{review.notes}</p>
            </div>
          ) : null}

          {review.blockingIssues.length > 0 ? (
            <div className="rounded border border-red-900/70 bg-red-950/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-red-400">
                Blocking issues — the draft is withheld from WordPress
              </p>
              <ul className="mt-1 space-y-0.5">
                {review.blockingIssues.map((issue) => (
                  <li key={issue} className="font-mono text-[11px] text-red-200">
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {review.issues.length > review.blockingIssues.length ? (
            <details>
              <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300">
                Advisory notes ({review.issues.length - review.blockingIssues.length})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {review.issues
                  .filter((issue) => !review.blockingIssues.includes(issue))
                  .map((issue) => (
                    <li key={issue} className="font-mono text-[11px] text-zinc-500">
                      {issue}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </Card>
  )
}
