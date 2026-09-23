import { Link, useParams } from 'react-router-dom'
import AutomationStepList from '@/components/automations/AutomationStepList'
import AutomationToolsPanel from '@/components/automations/AutomationToolsPanel'
import { beginnerLabel, META_PILL, priceLabel } from '@/components/automations/labels'
import { StatePanel } from '@/components/catalogue/BrowseStates'
import Section from '@/components/layout/Section'
import Button from '@/components/ui/Button'
import { useAutomation } from '@/hooks/useAutomations'

/*
 * /automations/:niche/:slug — one automation.
 *
 * Built to BlogArticlePage's shape (SPEC-automations.md §1a): the 760px
 * reading column, a back link, and four exclusive states — loading, error,
 * not found, found. It is read top to bottom like an article, which is why it
 * borrows the article's column rather than the list's grid.
 *
 * Both path segments are needed: slugs are unique within a niche only. The
 * niche arrives URL-decoded from react-router ("Recruiters & HR").
 *
 * What the page does not show, deliberately: the price note (the API never
 * sends it, §6), and a price tier the importer could only guess (the API
 * omits those, so the pill simply does not render).
 */

function DetailSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="h-[14px] w-[160px] rounded-pill bg-white/[0.06]" />
      <div className="mt-5 h-[40px] w-full rounded-[8px] bg-white/[0.06]" />
      <div className="mt-3 h-[40px] w-2/3 rounded-[8px] bg-white/[0.06]" />
      <div className="mt-5 h-[16px] w-3/4 rounded-[6px] bg-white/[0.05]" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-[92px] w-full rounded-[14px] bg-white/[0.04]" />
        ))}
      </div>
    </div>
  )
}

export default function AutomationDetailPage() {
  const { niche, slug } = useParams<{ niche: string; slug: string }>()
  const { data: automation, isLoading, error, retry } = useAutomation(niche, slug)

  return (
    <Section spacing="sub" className="pb-4">
      <div className="mx-auto max-w-[760px]">
        <Link
          to="/automations"
          className="inline-flex items-center gap-2 text-[13.5px] font-medium text-subtle-soft transition-colors duration-200 hover:text-ink"
        >
          <span aria-hidden="true">←</span> Back to automations
        </Link>

        {isLoading && (
          <div className="mt-8">
            <DetailSkeleton />
          </div>
        )}

        {!isLoading && error && (
          <div className="mt-8">
            <StatePanel
              role="alert"
              title="This automation could not be loaded"
              detail={error}
              action={{ label: 'Try again', onClick: retry }}
            />
          </div>
        )}

        {/* The API answered, but there is no automation at this niche and slug. */}
        {!isLoading && !error && !automation && (
          <div className="mt-8 rounded-card-lg border border-dashed border-white/[0.13] bg-white/[0.035] px-6 py-16 text-center">
            <h1 className="text-[24px] font-semibold text-ink">We couldn't find that automation</h1>
            <p className="mx-auto mt-[10px] max-w-[46ch] text-[14.5px] leading-[1.6] text-pretty text-muted">
              The link may be out of date, or the automation may have been withdrawn.
            </p>
            <div className="mt-5">
              <Button variant="outline" to="/automations">
                Search automations
              </Button>
            </div>
          </div>
        )}

        {!isLoading && !error && automation && (
          <article className="mt-8">
            <header>
              <Link
                to={`/automations?niche=${encodeURIComponent(automation.niche)}`}
                className="text-[11.5px] tracking-[0.2em] text-accent uppercase underline-offset-2 hover:underline"
              >
                {automation.niche}
              </Link>
              <h1 className="mt-4 text-[clamp(28px,4vw,40px)] leading-[1.15] font-bold tracking-[-0.035em] text-balance text-ink-bright">
                {automation.title}
              </h1>
              <p className="mt-4 text-[15.5px] leading-[1.65] tracking-[-0.006em] text-pretty text-muted-dim">
                {automation.persona}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className={META_PILL}>{beginnerLabel(automation.beginnerFriendly)}</span>
                {automation.pricingTier && (
                  <span className={META_PILL}>{priceLabel(automation.pricingTier)}</span>
                )}
              </div>
              {automation.beginnerNote && (
                <p className="mt-3 text-[13px] leading-[1.55] text-pretty text-subtle-dim">
                  {automation.beginnerNote}
                </p>
              )}
            </header>

            <section aria-labelledby="automation-steps" className="mt-10">
              <h2 id="automation-steps" className="text-[11.5px] tracking-[0.2em] text-accent uppercase">
                Steps
              </h2>
              <div className="mt-4">
                <AutomationStepList steps={automation.steps} tools={automation.tools} />
              </div>
            </section>

            <div className="mt-8">
              <AutomationToolsPanel tools={automation.tools} />
            </div>

            {automation.accessNotes && (
              <section aria-labelledby="automation-access" className="mt-6">
                <h2 id="automation-access" className="text-[11.5px] tracking-[0.2em] text-accent uppercase">
                  Access notes
                </h2>
                <p className="mt-3 text-[14px] leading-[1.6] text-pretty text-muted-dim">
                  {automation.accessNotes}
                </p>
              </section>
            )}

            <footer className="mt-12 border-t border-hairline pt-6 text-[13px] leading-[1.6] text-subtle-dim">
              <a
                href={automation.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                // Underlined at rest: inside a line of text, colour alone does
                // not mark a link (axe link-in-text-block; the two greys are 1.65:1).
                className="text-subtle-soft underline underline-offset-2 hover:text-ink"
              >
                Source<span className="sr-only"> (opens in a new tab)</span>
              </a>
              {' · '}
              {automation.sourceType}
              {' · '}
              {automation.freshness}
            </footer>
          </article>
        )}
      </div>
    </Section>
  )
}
