import type { ReactNode } from 'react'
import {
  ANCHOR,
  AlertIcon,
  BulbIcon,
  CheckIcon,
  EYEBROW,
  H2,
  PANEL,
  PROSE,
} from '@/components/guide/guideStyles'
import { ResourceLink, ResourceList } from '@/components/guide/GuideResources'
import type { GuideRequirement, GuideResource } from '@/types/automation'
import type { WorkflowGuide } from '@/types/guide'

/*
 * The guide's editorial sections — the article around the workflow.
 *
 * Each is an H2 section with a stable id, so the on-page nav can link to it
 * and a search result can deep-link into it. A section whose content came out
 * empty (see utils/workflowGuide.ts) renders nothing rather than a heading
 * over an empty list.
 */

export function GuideSection({
  id,
  eyebrow,
  title,
  intro,
  children,
  className = '',
}: {
  id: string
  eyebrow?: string
  title: string
  intro?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`${ANCHOR} ${className}`}>
      {eyebrow && <p className={`${EYEBROW} mb-3`}>{eyebrow}</p>}
      <h2 id={`${id}-title`} className={H2}>
        {title}
      </h2>
      {intro && <div className={`mt-4 ${PROSE}`}>{intro}</div>}
      {children}
    </section>
  )
}

/** "Bookkeepers managing…" → "bookkeepers managing…", but "HR teams" stays. */
function midSentence(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text
}

/** What the workflow solves, and who it is for. */
export function GuideIntro({ guide }: { guide: WorkflowGuide }) {
  return (
    <GuideSection id="overview" eyebrow="Overview" title="What this workflow solves">
      {guide.intro.map((paragraph) => (
        <p key={paragraph} className={`mt-4 ${PROSE}`}>
          {paragraph}
        </p>
      ))}
      {/* With an authored intro, the record's summary becomes the short version. */}
      {guide.intro.length > 0 ? (
        <p className="mt-6 border-l-2 border-[rgba(178,150,255,0.45)] pl-4 text-[15px] leading-[1.65] text-pretty text-[#C0B9D6]">
          <span className="font-semibold text-[#E4DEF4]">In short: </span>
          {guide.summary}
        </p>
      ) : (
        <p className={`mt-4 ${PROSE}`}>{guide.summary}</p>
      )}

      <h3 className="mt-8 text-[17px] font-semibold tracking-[-0.015em] text-ink">Who it’s for</h3>
      <p className={`mt-2 ${PROSE}`}>
        This guide is written for <span className="font-medium text-[#E4DEF4]">{midSentence(guide.persona)}</span>
        {guide.sector && <> ({guide.sector})</>}, in the {guide.niche} section of our workflow library.
      </p>
    </GuideSection>
  )
}

function CheckList({ items }: { items: GuideRequirement[] }) {
  return (
    <ul className="mt-4 flex list-none flex-col gap-3 p-0">
      {items.map((item) => (
        <li key={item.title} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-[2px] flex h-[20px] w-[20px] flex-none items-center justify-center rounded-full bg-[rgba(124,88,244,0.2)] text-[#C8AEFF]"
          >
            <CheckIcon className="h-3 w-3" />
          </span>
          <span className="min-w-0 flex-auto text-[14.5px] leading-[1.55] text-pretty text-[#D3CCE6]">
            {item.title}
            {item.description && (
              <span className="mt-[2px] block text-[13px] text-[#8A83A6]">{item.description}</span>
            )}
            {item.resource && (
              <span className="mt-2 block">
                <ResourceLink resource={item.resource} />
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** "What you'll learn" beside "Before you start" — the reference's checklist pair. */
export function GuideChecklists({ guide }: { guide: WorkflowGuide }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section id="learn" aria-labelledby="learn-title" className={`${ANCHOR} ${PANEL} p-6`}>
        <h2 id="learn-title" className="text-[19px] font-semibold tracking-[-0.02em] text-ink-bright">
          What you’ll learn
        </h2>
        <CheckList items={guide.outcomes.map((title) => ({ title }))} />
      </section>

      {guide.requirements.length > 0 && (
        <section id="before-you-start" aria-labelledby="before-you-start-title" className={`${ANCHOR} ${PANEL} p-6`}>
          <h2 id="before-you-start-title" className="text-[19px] font-semibold tracking-[-0.02em] text-ink-bright">
            Before you start
          </h2>
          <CheckList items={guide.requirements} />
          <p className="mt-5 border-t border-white/[0.07] pt-4 text-[13px] text-[#8A83A6]">
            Setup level: <span className="text-[#C0B9D6]">{guide.setupLabel}</span>
          </p>
        </section>
      )}
    </div>
  )
}

export function GuideTips({ tips }: { tips: string[] }) {
  if (!tips.length) return null
  return (
    <GuideSection id="tips" eyebrow="Get better results" title="Tips & best practices">
      <ul className="mt-6 grid list-none gap-3 p-0 sm:grid-cols-2">
        {tips.map((tip) => (
          <li key={tip} className={`${PANEL} flex gap-3 p-5`}>
            <BulbIcon className="mt-px h-5 w-5 flex-none text-[#F5D565]" />
            <p className="text-[14.5px] leading-[1.6] text-pretty text-[#D3CCE6]">{tip}</p>
          </li>
        ))}
      </ul>
    </GuideSection>
  )
}

export function GuideIssues({ issues }: { issues: WorkflowGuide['issues'] }) {
  if (!issues.length) return null
  return (
    <GuideSection id="troubleshooting" eyebrow="Troubleshooting" title="Common issues & fixes">
      <div className="mt-6 flex flex-col gap-3">
        {issues.map((issue) => (
          <div key={issue.problem} className={`${PANEL} flex gap-4 p-5`}>
            <AlertIcon className="mt-[2px] h-5 w-5 flex-none text-[#FF9DB6]" />
            <div>
              <h3 className="text-[15.5px] font-semibold tracking-[-0.01em] text-ink">{issue.problem}</h3>
              <p className="mt-[6px] text-[14.5px] leading-[1.6] text-pretty text-[#B9B2CF]">{issue.solution}</p>
            </div>
          </div>
        ))}
      </div>
    </GuideSection>
  )
}

/** Guide-level resources — only when an editor added some. */
export function GuideResourcesSection({ resources }: { resources: GuideResource[] }) {
  if (!resources.length) return null
  return (
    <GuideSection id="resources" eyebrow="Take it with you" title="Resources">
      <ResourceList resources={resources} className="mt-6 max-w-[640px]" />
    </GuideSection>
  )
}

/** Where the guide's facts come from — the record's source, verbatim. */
export function GuideSources({ source }: { source: WorkflowGuide['source'] }) {
  return (
    <footer className="border-t border-hairline pt-6 text-[13px] leading-[1.6] text-subtle-dim">
      <h2 className="text-[11.5px] tracking-[0.2em] text-subtle-soft uppercase">Sources</h2>
      <p className="mt-2">
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          // Underlined at rest: inside a line of text, colour alone does
          // not mark a link (axe link-in-text-block).
          className="text-subtle-soft underline underline-offset-2 hover:text-ink"
        >
          {source.type}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        {' · '}
        {source.freshness}
        {source.accessNotes && (
          <>
            {' · '}
            {source.accessNotes}
          </>
        )}
      </p>
      <p className="mt-1">Tool details and pricing change often — check the vendor’s site before you commit.</p>
    </footer>
  )
}
