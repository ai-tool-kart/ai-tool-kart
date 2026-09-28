import { Link } from 'react-router-dom'
import AutomationResultCard, { AutomationResultSkeleton } from '@/components/automations/AutomationResultCard'
import { GuideSection } from '@/components/guide/GuideSections'
import { ArrowIcon } from '@/components/guide/guideStyles'
import { useAutomations } from '@/hooks/useAutomations'
import type { WorkflowGuide } from '@/types/guide'

/*
 * Where a reader goes next: related guides, then the wider library.
 * Workflow → workflow first, because that is what the page is; the catalogue
 * links sit last and quieter.
 *
 * Two sources, in priority order:
 *   1. the editor's curated picks (guide.relatedGuides, already cards), then
 *   2. the automatic fallback — the same niche, in the server's own order,
 *      minus this guide and anything already curated — up to RELATED_SHOWN.
 * A failed fallback request shows the curated picks alone (or nothing); the
 * library links below always render.
 */

const RELATED_SHOWN = 6

const LINK_CARD =
  'group flex items-center justify-between gap-3 rounded-[16px] border border-hairline bg-white/[0.025] px-5 py-4 text-[14.5px] font-medium text-ink transition-[border-color,background-color] duration-200 hover:border-accent-line hover:bg-accent-wash hover:text-ink'

export default function RelatedGuides({ guide }: { guide: WorkflowGuide }) {
  const curated = guide.relatedGuides.slice(0, RELATED_SHOWN)
  const { automations, isLoading, error } = useAutomations(
    { q: '', niche: guide.niche },
    // Enough to fill the grid after skipping this guide and the curated ones.
    { limit: RELATED_SHOWN + curated.length + 1 },
  )
  const key = (item: { niche: string; slug: string }) => `${item.niche}/${item.slug}`
  const taken = new Set([key(guide), ...curated.map(key)])
  const fallback = error ? [] : automations.filter((item) => !taken.has(key(item)))
  const related = [...curated, ...fallback].slice(0, RELATED_SHOWN)
  const waiting = isLoading && curated.length < RELATED_SHOWN
  const catalogueTools = guide.tools.filter((tool) => tool.catalogueSlug)

  return (
    <GuideSection
      id="related"
      eyebrow="Keep going"
      title="Related workflows"
      intro={<p>More step-by-step guides from our {guide.niche} collection.</p>}
    >
      {waiting && curated.length === 0 && (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AutomationResultSkeleton count={3} />
        </div>
      )}
      {!(waiting && curated.length === 0) && related.length > 0 && (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((item) => (
            <AutomationResultCard key={`${item.niche}/${item.slug}`} automation={item} />
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link to={`/automations?niche=${encodeURIComponent(guide.niche)}`} className={LINK_CARD}>
          All {guide.niche} guides
          <ArrowIcon className="h-4 w-4 flex-none text-accent transition-transform duration-200 group-hover:translate-x-[3px]" />
        </Link>
        <Link to="/workflows" className={LINK_CARD}>
          Explore AI workflows
          <ArrowIcon className="h-4 w-4 flex-none text-accent transition-transform duration-200 group-hover:translate-x-[3px]" />
        </Link>
        {catalogueTools.length > 0 ? (
          <Link
            to={`/browse?tools=${catalogueTools.map((tool) => encodeURIComponent(tool.catalogueSlug ?? '')).join(',')}`}
            className={LINK_CARD}
          >
            Compare the tools in this guide
            <ArrowIcon className="h-4 w-4 flex-none text-accent transition-transform duration-200 group-hover:translate-x-[3px]" />
          </Link>
        ) : (
          <Link to="/browse" className={LINK_CARD}>
            Browse all AI tools
            <ArrowIcon className="h-4 w-4 flex-none text-accent transition-transform duration-200 group-hover:translate-x-[3px]" />
          </Link>
        )}
      </div>
    </GuideSection>
  )
}
