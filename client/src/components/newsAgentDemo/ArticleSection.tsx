/*
 * Stage 5 — the generated article.
 *
 * Rendered from the draft's structured `sections`, not from its HTML string.
 * The HTML is built server-side by generation/render.ts from an allowlist and is
 * what goes to WordPress; injecting it here with dangerouslySetInnerHTML would
 * add a second rendering path for no benefit, so the structure is rendered
 * directly and the HTML is offered as inspectable source.
 */

import { Card, Empty, Pill } from './primitives'
import { formatTime } from './format'
import type { RunState, StoryState } from '@/types/newsAgentDemo'

export default function ArticleSection({ run, story }: { run: RunState; story?: StoryState }) {
  const article = story?.article
  const writingStage = story?.stages.find((stage) => stage.id === 'writing')

  return (
    <Card
      title="5 · Article generation"
      subtitle="NEWS_AGENT.md §7 step 12, §16 — structured output; the HTML is built by our code, not the model"
      right={article ? <Pill tone="neutral">{article.wordCount} words</Pill> : null}
    >
      {!article ? (
        <Empty>
          {writingStage?.status === 'running'
            ? 'Generating article…'
            : run.status === 'running'
              ? 'Waiting for the writer…'
              : 'No article was generated — no story reached this stage.'}
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-500">
            <Pill tone="neutral">{article.category}</Pill>
            <Pill tone="neutral">{article.format}</Pill>
            <span>model {article.model}</span>
            <span>generated {formatTime(article.generatedAt)}</span>
            {article.revisionCount > 0 ? <Pill tone="warn">revision {article.revisionCount}</Pill> : null}
          </div>

          {story?.revisions.length ? (
            <div className="rounded border border-amber-900/70 bg-amber-950/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-amber-400">
                Editor requested a rewrite
              </p>
              <ul className="mt-1 space-y-0.5">
                {story.revisions[story.revisions.length - 1].issues.slice(0, 5).map((issue) => (
                  <li key={issue} className="font-mono text-[11px] text-amber-200/90">
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <article className="rounded border border-zinc-800 bg-zinc-950/60 px-4 py-4">
            <h1 className="text-lg font-bold leading-snug text-zinc-50">{article.title}</h1>
            <p className="mt-2 text-sm italic leading-relaxed text-zinc-400">{article.excerpt}</p>

            <div className="mt-4 space-y-4">
              {article.sections.map((section, index) => (
                <section key={`${section.heading}-${index}`}>
                  <h2 className="text-sm font-semibold text-zinc-100">{section.heading}</h2>
                  {section.paragraphs?.map((paragraph, pIndex) => (
                    <p key={pIndex} className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                      {paragraph}
                    </p>
                  ))}
                  {section.bullets?.length ? (
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-zinc-300">
                      {section.bullets.map((bullet, bIndex) => (
                        <li key={bIndex}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>
          </article>

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Slug</dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-zinc-300">{article.slug}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Tags</dt>
              <dd className="mt-0.5 flex flex-wrap gap-1">
                {article.tags.map((tag) => (
                  <Pill key={tag} tone="neutral">
                    {tag}
                  </Pill>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Claim ids cited</dt>
              <dd className="mt-0.5 font-mono text-xs text-zinc-300">{article.claimIds.length}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Source URLs</dt>
              <dd className="mt-0.5 font-mono text-xs text-zinc-300">{article.sourceUrls.length}</dd>
            </div>
          </dl>

          <details>
            <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300">
              Rendered HTML sent to WordPress
            </summary>
            <pre className="mt-1 max-h-64 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
              {article.html}
            </pre>
          </details>
        </div>
      )}
    </Card>
  )
}
