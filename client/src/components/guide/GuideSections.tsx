import type { ReactNode } from 'react'
import {
  ANCHOR,
  AlertIcon,
  BulbIcon,
  CheckIcon,
  EYEBROW,
  H2,
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

/**
 * The opening section. An authored guide leads with why the workflow matters
 * (the editor's `intro`), and the record's summary becomes the short version;
 * an imported guide has only the summary, under a plainer heading.
 */
export function GuideIntro({ guide }: { guide: WorkflowGuide }) {
  const authored = guide.intro.length > 0
  return (
    <GuideSection
      id="overview"
      title={authored ? 'Why this workflow matters' : 'What this workflow solves'}
    >
      {guide.intro.map((paragraph) => (
        <p key={paragraph} className={`mt-4 ${PROSE}`}>
          {paragraph}
        </p>
      ))}
      {authored ? (
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

/** A list with the check mark — prerequisites, outcomes, the result checklist. */
function CheckList({ items }: { items: GuideRequirement[] }) {
  return (
    <ul className="mt-5 flex list-none flex-col gap-4 p-0">
      {items.map((item) => (
        <li key={item.title} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-[3px] flex h-[20px] w-[20px] flex-none items-center justify-center rounded-full bg-[rgba(124,88,244,0.2)] text-[#C8AEFF]"
          >
            <CheckIcon className="h-3 w-3" />
          </span>
          <span className="min-w-0 flex-auto text-[15.5px] leading-[1.6] text-pretty text-[#D3CCE6]">
            {item.description ? <span className="font-medium text-[#EDE8FA]">{item.title}</span> : item.title}
            {item.description && (
              <span className="mt-[2px] block text-[14.5px] leading-[1.6] text-[#A9A2C2]">{item.description}</span>
            )}
            {item.resource && (
              <span className="mt-2 block max-w-[520px]">
                <ResourceLink resource={item.resource} />
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Prerequisites — the editor's list, else the record's tool access and setup note. */
export function GuideRequirements({ guide }: { guide: WorkflowGuide }) {
  if (!guide.requirements.length) return null
  return (
    <GuideSection id="before-you-start" title="What you’ll need">
      <CheckList items={guide.requirements} />
      <p className="mt-5 text-[13.5px] text-[#8A83A6]">
        Setup level: <span className="text-[#C0B9D6]">{guide.setupLabel}</span>
      </p>
    </GuideSection>
  )
}

export function GuideOutcomes({ outcomes }: { outcomes: string[] }) {
  if (!outcomes.length) return null
  return (
    <GuideSection id="learn" title="What you’ll learn">
      <CheckList items={outcomes.map((title) => ({ title }))} />
    </GuideSection>
  )
}

/** What the reader ends up with — authored only. */
export function GuideExpectedResult({ result }: { result: WorkflowGuide['expectedResult'] }) {
  if (!result) return null
  return (
    <GuideSection id="result" title="What you’ll end up with">
      <p className={`mt-4 ${PROSE}`}>{result.summary}</p>
      {result.checklist.length > 0 && (
        <>
          <h3 className="mt-7 text-[17px] font-semibold tracking-[-0.015em] text-ink">Check before you publish</h3>
          <CheckList items={result.checklist.map((title) => ({ title }))} />
        </>
      )}
    </GuideSection>
  )
}

export function GuideTips({ tips }: { tips: string[] }) {
  if (!tips.length) return null
  return (
    <GuideSection id="tips" title="Tips & best practices">
      <ul className="mt-5 flex list-none flex-col gap-4 p-0">
        {tips.map((tip) => (
          <li key={tip} className="flex gap-3">
            <BulbIcon className="mt-[3px] h-5 w-5 flex-none text-[#F5D565]" />
            <p className="text-[15.5px] leading-[1.6] text-pretty text-[#D3CCE6]">{tip}</p>
          </li>
        ))}
      </ul>
    </GuideSection>
  )
}

export function GuideIssues({ issues }: { issues: WorkflowGuide['issues'] }) {
  if (!issues.length) return null
  return (
    <GuideSection id="troubleshooting" title="Common issues & fixes">
      <div className="mt-4 flex flex-col divide-y divide-white/[0.07]">
        {issues.map((issue) => (
          <div key={issue.problem} className="flex gap-4 py-5">
            <AlertIcon className="mt-[3px] h-5 w-5 flex-none text-[#FF9DB6]" />
            <div>
              <h3 className="text-[16.5px] font-semibold tracking-[-0.012em] text-ink">{issue.problem}</h3>
              <p className={`mt-[6px] ${PROSE}`}>{issue.solution}</p>
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
    <GuideSection id="resources" title="Resources">
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
