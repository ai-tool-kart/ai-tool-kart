import { Link } from 'react-router-dom'
import Monogram from '@/components/ui/Monogram'
import { ExternalIcon } from '@/components/guide/guideStyles'
import type { GuideTool } from '@/types/guide'

/*
 * One tool, as a workflow step uses it — a row inside the step, not a card
 * beside it: the name, WHY this step uses it, any access note, and two quiet
 * text links (the vendor's site, our catalogue entry).
 *
 * Deliberately smaller than the step's own controls. The tool supports the
 * step; the step's primary action is completing it (WorkflowStepper), so
 * nothing here is a filled button.
 *
 * "Visit X" only when the url is the tool's own site; an imported record's
 * url is often a roundup, so it reads "Read about X" (types/guide.ts).
 */

/** "Booke AI" → "BA", "Runway" → "RU". */
function toolInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)
  return letters.toUpperCase()
}

const LINK =
  'inline-flex items-center gap-1 rounded-[4px] text-[13px] font-semibold text-accent underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export default function GuideToolCard({ tool }: { tool: GuideTool }) {
  return (
    <div className="flex gap-3">
      <Monogram mono={toolInitials(tool.name)} size="xs" />
      <div className="min-w-0 flex-auto">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-[22px] font-semibold tracking-[-0.01em] text-ink">
          {tool.name}
          {tool.priceLabel && <span className="text-[12px] font-normal text-[#A39CBC]">{tool.priceLabel}</span>}
        </p>
        {tool.why && <p className="mt-1 text-[14px] leading-[1.55] text-pretty text-[#C9C2DD]">{tool.why}</p>}
        {tool.accessNote && (
          <p className="mt-1 text-[13px] leading-[1.5] text-pretty text-[#A39CBC]">{tool.accessNote}</p>
        )}
        {(tool.url || tool.catalogueSlug) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {tool.url && (
              <a href={tool.url} target="_blank" rel="noreferrer noopener" className={LINK}>
                {tool.urlIsToolSite ? `Visit ${tool.name}` : `Read about ${tool.name}`}
                <ExternalIcon className="h-[14px] w-[14px]" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
            {tool.catalogueSlug && (
              <Link
                to={`/browse?tools=${encodeURIComponent(tool.catalogueSlug)}`}
                className={`${LINK} font-medium text-[#C9C2DD]`}
              >
                See it in our catalogue<span className="sr-only">: {tool.name}</span>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
