import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StatePanel } from '@/components/catalogue/BrowseStates'
import GuideHero from '@/components/guide/GuideHero'
import {
  GuideChecklists,
  GuideIntro,
  GuideIssues,
  GuideResourcesSection,
  GuideSection,
  GuideSources,
  GuideTips,
} from '@/components/guide/GuideSections'
import GuideSectionNav, { type GuideNavItem } from '@/components/guide/GuideSectionNav'
import GuideStructuredData from '@/components/guide/GuideStructuredData'
import RelatedGuides from '@/components/guide/RelatedGuides'
import WorkflowStepper from '@/components/guide/WorkflowStepper'
import Section from '@/components/layout/Section'
import Button from '@/components/ui/Button'
import { useAutomation } from '@/hooks/useAutomations'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import type { WorkflowGuide } from '@/types/guide'
import { guideHead, notFoundHead, siteOrigin } from '@/utils/guideSeo'
import { buildWorkflowGuide } from '@/utils/workflowGuide'

/*
 * /automations/:niche/:slug — one workflow guide.
 *
 * The destination of the homepage plan's "Step-by-step guide" button, the
 * setup cards and the usage stories (all via automationPath). It is written
 * to be a search landing page for the task in its title, so it reads as an
 * article — H1, overview, checklists, tips, troubleshooting, related guides —
 * with the workflow itself as an interactive window in the middle of it.
 *
 * The record comes from the API (useAutomation); utils/workflowGuide.ts turns
 * it into the page's sections, and every component below renders from that
 * view model. The page keeps its four exclusive states: loading, error, not
 * found, found.
 *
 * Both path segments are needed: slugs are unique within a niche only. The
 * niche arrives URL-decoded from react-router ("Recruiters & HR").
 */

function DetailSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="h-[14px] w-[220px] rounded-pill bg-white/[0.06]" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <div className="h-[48px] w-full rounded-[10px] bg-white/[0.06]" />
          <div className="mt-3 h-[48px] w-2/3 rounded-[10px] bg-white/[0.06]" />
          <div className="mt-6 h-[18px] w-3/4 rounded-[6px] bg-white/[0.05]" />
        </div>
        <div className="h-[320px] rounded-panel bg-white/[0.04]" />
      </div>
      <div className="mt-14 h-[420px] rounded-panel bg-white/[0.035]" />
    </div>
  )
}

function navItems(guide: WorkflowGuide): GuideNavItem[] {
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'learn', label: 'What you’ll learn' },
    { id: 'workflow', label: 'Step-by-step' },
    ...(guide.tips.length ? [{ id: 'tips', label: 'Tips' }] : []),
    ...(guide.issues.length ? [{ id: 'troubleshooting', label: 'Troubleshooting' }] : []),
    ...(guide.resources.length ? [{ id: 'resources', label: 'Resources' }] : []),
    { id: 'related', label: 'Related workflows' },
  ]
}

function Guide({ guide }: { guide: WorkflowGuide }) {
  const items = useMemo(() => navItems(guide), [guide])
  const guideKey = `${guide.niche}/${guide.slug}`

  return (
    <article>
      <GuideHero guide={guide} />

      <div className="sticky top-[104px] z-[5] mt-14 -mx-3 rounded-pill border border-hairline bg-[rgba(10,9,18,0.78)] px-1 shadow-nav backdrop-blur-[16px] sm:mx-0">
        <GuideSectionNav items={items} />
      </div>

      <div className="mt-14 max-w-[780px]">
        <GuideIntro guide={guide} />
      </div>

      <div className="mt-12">
        <GuideChecklists guide={guide} />
      </div>

      <GuideSection
        id="workflow"
        eyebrow="Interactive guide"
        title="The workflow, step by step"
        className="mt-20"
        intro={
          <p className="max-w-[680px]">
            Work through each step in order and mark it done as you go. Your progress is saved in this browser, so
            you can leave to run a step and pick up where you left off.
          </p>
        }
      >
        <div className="mt-8">
          {/* Keyed so moving to another guide starts its own progress. */}
          <WorkflowStepper key={guideKey} guideKey={guideKey} steps={guide.steps} tools={guide.tools} />
        </div>
      </GuideSection>

      {/* Tips, issues and resources exist only when an editor wrote them. */}
      {guide.tips.length > 0 && (
        <div className="mt-20">
          <GuideTips tips={guide.tips} />
        </div>
      )}

      {guide.issues.length > 0 && (
        <div className="mt-20 max-w-[780px]">
          <GuideIssues issues={guide.issues} />
        </div>
      )}

      {guide.resources.length > 0 && (
        <div className="mt-20">
          <GuideResourcesSection resources={guide.resources} />
        </div>
      )}

      <div className="mt-20">
        <RelatedGuides guide={guide} />
      </div>

      <div className="mt-16">
        <GuideSources source={guide.source} />
      </div>

      <GuideStructuredData guide={guide} />
    </article>
  )
}

export default function AutomationDetailPage() {
  const { niche, slug } = useParams<{ niche: string; slug: string }>()
  const { data: automation, isLoading, error, retry } = useAutomation(niche, slug)
  const guide = useMemo(() => (automation ? buildWorkflowGuide(automation) : undefined), [automation])

  useDocumentMeta(
    guide ? guideHead(guide, siteOrigin()) : !isLoading && !error ? notFoundHead() : undefined,
  )

  return (
    <Section spacing="sub" className="px-4! pb-4 sm:px-8!">
      {isLoading && <DetailSkeleton />}

      {!isLoading && error && (
        <div className="mx-auto max-w-[760px]">
          <StatePanel
            role="alert"
            title="This guide could not be loaded"
            detail={error}
            action={{ label: 'Try again', onClick: retry }}
          />
        </div>
      )}

      {/* The API answered, but there is no automation at this niche and slug. */}
      {!isLoading && !error && !guide && (
        <div className="mx-auto max-w-[760px] rounded-card-lg border border-dashed border-white/[0.13] bg-white/[0.035] px-6 py-16 text-center">
          <h1 className="text-[24px] font-semibold text-ink">We couldn't find that guide</h1>
          <p className="mx-auto mt-[10px] max-w-[46ch] text-[14.5px] leading-[1.6] text-pretty text-muted">
            The link may be out of date, or the guide may have been withdrawn.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button variant="outline" to="/automations">
              Search guides
            </Button>
            <Link to="/workflows" className="self-center text-[14px] font-medium">
              Explore workflows →
            </Link>
          </div>
        </div>
      )}

      {!isLoading && !error && guide && <Guide guide={guide} />}
    </Section>
  )
}
