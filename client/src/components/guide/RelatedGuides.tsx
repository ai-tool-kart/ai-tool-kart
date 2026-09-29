import { Link } from 'react-router-dom'
import AutomationResultCard from '@/components/automations/AutomationResultCard'
import { GuideSection } from '@/components/guide/GuideSections'
import { ArrowIcon } from '@/components/guide/guideStyles'
import type { WorkflowGuide } from '@/types/guide'

/*
 * Where a reader goes next: related guides, then the wider library.
 * Workflow → workflow first, because that is what the page is; the catalogue
 * links sit last and quieter.
 *
 * The guides arrive resolved in the detail response (server
 * automations/related.ts): the editor's curated picks first, then the niche
 * ranked by relevance, with the next two guides in the niche always included
 * so no guide is orphaned. No request of its own, so the links are in the
 * prerendered HTML — crawlable, not fetched.
 */

const RELATED_SHOWN = 6

const LINK_CARD =
  'group flex items-center justify-between gap-3 rounded-[16px] border border-hairline bg-white/[0.025] px-5 py-4 text-[14.5px] font-medium text-ink transition-[border-color,background-color] duration-200 hover:border-accent-line hover:bg-accent-wash hover:text-ink'

export default function RelatedGuides({ guide }: { guide: WorkflowGuide }) {
  const related = guide.relatedGuides.slice(0, RELATED_SHOWN)
  const catalogueTools = guide.tools.filter((tool) => tool.catalogueSlug)

  return (
    <GuideSection
      id="related"
      eyebrow="Keep going"
      title="Related workflows"
      intro={<p>More step-by-step guides from our {guide.niche} collection.</p>}
    >
      {related.length > 0 && (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((item) => (
            <AutomationResultCard key={`${item.niche}/${item.slug}`} automation={item} />
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link to={`/workflows?niche=${encodeURIComponent(guide.niche)}`} className={LINK_CARD}>
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
            {catalogueTools.length === 1
              ? `See ${catalogueTools[0]?.name} in our catalogue`
              : 'Compare the tools in this guide'}
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
