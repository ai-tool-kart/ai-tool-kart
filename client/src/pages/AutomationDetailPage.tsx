import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StatePanel } from '@/components/catalogue/BrowseStates'
import GuideHero from '@/components/guide/GuideHero'
import GuideClosing from '@/components/guide/GuideClosing'
import {
  GuideExpectedResult,
  GuideIntro,
  GuideIssues,
  GuideOutcomes,
  GuideRequirements,
  GuideResourcesSection,
  GuideSection,
  GuideSources,
  GuideTips,
} from '@/components/guide/GuideSections'
import GuideSectionNav, { type GuideNavItem, GuideToc } from '@/components/guide/GuideSectionNav'
import GuideStructuredData from '@/components/guide/GuideStructuredData'
import RelatedGuides from '@/components/guide/RelatedGuides'
import GuideWalkthrough from '@/components/guide/GuideWalkthrough'
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
 * article — see the section order above Guide() — with the workflow itself
 * as an interactive window in the middle of it.
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
    ...(guide.requirements.length ? [{ id: 'before-you-start', label: 'What you’ll need' }] : []),
    { id: 'workflow', label: 'Step-by-step' },
    ...(guide.hasWalkthrough ? [{ id: 'explained', label: 'Explained' }] : []),
    ...(guide.expectedResult ? [{ id: 'result', label: 'Result' }] : []),
    ...(guide.tips.length ? [{ id: 'tips', label: 'Tips' }] : []),
    ...(guide.issues.length ? [{ id: 'troubleshooting', label: 'Troubleshooting' }] : []),
    ...(guide.resources.length ? [{ id: 'resources', label: 'Resources' }] : []),
    { id: 'related', label: 'Related' },
  ]
}

/** The reading measure every prose section keeps; the workflow, related grid and CTA use the full main column. */
const COLUMN = 'max-w-[720px]'

/*
 * Section order is the article's order (the editorial structure):
 *   hero (breadcrumb, H1, lede, metadata) → why it matters → what you'll need
 *   → what you'll learn → interactive workflow → the workflow explained →
 *   the result → tips → common issues → resources → related → closing CTA.
 * Every section after the workflow that an imported guide has no content for
 * renders nothing — no heading, no gap (each wrapper is conditional).
 */
function Guide({ guide }: { guide: WorkflowGuide }) {
  const items = useMemo(() => navItems(guide), [guide])
  const guideKey = `${guide.niche}/${guide.slug}`

  return (
    <article>
      <GuideHero guide={guide} />

      {/* Below xl: the section bar, sticky under the site header. */}
      <div className="sticky top-[104px] z-[5] mt-14 -mx-1 rounded-pill border border-hairline bg-[rgba(10,9,18,0.8)] px-1 shadow-nav backdrop-blur-[16px] sm:mx-0 xl:hidden">
        <GuideSectionNav items={items} />
      </div>

      {/*
       * xl and up: the article in a main column, and a contents list in a
       * sticky sidebar beside it — where the page was empty glass before.
       * Prose keeps a 720px measure inside the main column; the workflow,
       * related grid and closing CTA use its full width.
       */}
      <div className="mt-14 xl:mt-20 xl:grid xl:grid-cols-[minmax(0,1fr)_208px] xl:gap-16">
        <div className="min-w-0">
          <div className={COLUMN}>
            <GuideIntro guide={guide} />
          </div>

          {guide.requirements.length > 0 && (
            <div className={`mt-16 ${COLUMN}`}>
              <GuideRequirements guide={guide} />
            </div>
          )}

          {guide.outcomes.length > 0 && (
            <div className={`mt-16 ${COLUMN}`}>
              <GuideOutcomes outcomes={guide.outcomes} />
            </div>
          )}

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
            <div className="relative mt-8">
              {/* A soft violet light under the window — the page's one interactive
                  surface, lifted from the article without a louder frame. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-2 -top-16 -bottom-10 -z-[1] xl:-inset-x-10 bg-[radial-gradient(60%_55%_at_50%_40%,rgba(124,88,244,0.16),transparent_70%)]"
              />
              {/* Keyed so moving to another guide starts its own progress. */}
              <WorkflowStepper
                key={guideKey}
                guideKey={guideKey}
                steps={guide.steps}
                stepTitleAs={guide.hasWalkthrough ? 'p' : 'h3'}
                resultHref={guide.expectedResult ? '#result' : '#related'}
                resultLabel={guide.expectedResult ? 'Check your result' : 'Try a related workflow'}
              />
            </div>
          </GuideSection>

          {guide.hasWalkthrough && (
            <div className={`mt-20 ${COLUMN}`}>
              <GuideWalkthrough steps={guide.steps} />
            </div>
          )}

          {guide.expectedResult && (
            <div className={`mt-20 ${COLUMN}`}>
              <GuideExpectedResult result={guide.expectedResult} />
            </div>
          )}

          {guide.tips.length > 0 && (
            <div className={`mt-20 ${COLUMN}`}>
              <GuideTips tips={guide.tips} />
            </div>
          )}

          {guide.issues.length > 0 && (
            <div className={`mt-20 ${COLUMN}`}>
              <GuideIssues issues={guide.issues} />
            </div>
          )}

          {guide.resources.length > 0 && (
            <div className={`mt-20 ${COLUMN}`}>
              <GuideResourcesSection resources={guide.resources} />
            </div>
          )}

          <div className="mt-20">
            <RelatedGuides guide={guide} />
          </div>

          <div className="mt-20">
            <GuideClosing guide={guide} />
          </div>

          <div className={`mt-16 ${COLUMN}`}>
            <GuideSources source={guide.source} />
          </div>
        </div>

        <aside aria-label="Guide contents" className="hidden xl:block">
          <div className="sticky top-[132px]">
            <GuideToc items={items} />
            <a
              href="#workflow"
              className="group mt-8 inline-flex items-center gap-2 rounded-pill border border-white/[0.1] px-4 py-2 text-[13px] font-semibold text-ink transition-[border-color,background-color] duration-200 hover:border-accent-line hover:bg-accent-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Go to the workflow
              <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-[2px]">
                →
              </span>
            </a>
          </div>
        </aside>
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
