import { Link } from 'react-router-dom'
import Monogram from '@/components/ui/Monogram'
import { ExternalIcon } from '@/components/guide/guideStyles'
import type { GuideTool } from '@/types/guide'

/*
 * One tool, as a workflow step uses it: name, price label, access note, and
 * the two ways out — the vendor's site (only the lead tool has a url; see
 * SPEC-automations.md §3) and, for a tool
 * the catalogue also lists, its catalogue card on Browse.
 *
 * Kept deliberately small: the tool supports the step, it is not the step.
 */

/** "Booke AI" → "BA", "Runway" → "RU". */
function toolInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)
  return letters.toUpperCase()
}

function ToolLinks({ tool }: { tool: GuideTool }) {
  if (!tool.url && !tool.catalogueSlug) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {tool.url && (
        <a
          href={tool.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent underline-offset-2 hover:underline"
        >
          {tool.urlIsToolSite ? `Visit ${tool.name}` : `Read about ${tool.name}`}
          <ExternalIcon className="h-[14px] w-[14px]" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      {tool.catalogueSlug && (
        <Link
          to={`/browse?tools=${encodeURIComponent(tool.catalogueSlug)}`}
          className="text-[13px] font-medium text-muted-soft underline-offset-2 hover:text-ink hover:underline"
        >
          See it in our catalogue
        </Link>
      )}
    </div>
  )
}

export default function GuideToolCard({ tool, compact = false }: { tool: GuideTool; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Monogram mono={toolInitials(tool.name)} size={compact ? 'xs' : 'sm'} />
        <div className="min-w-0">
          <p className={`${compact ? 'text-[14px]' : 'text-[15.5px]'} font-semibold tracking-[-0.01em] text-ink`}>
            {tool.name}
          </p>
          {tool.priceLabel && <p className="text-[12px] text-[#8A83A6]">{tool.priceLabel}</p>}
        </div>
      </div>
      {tool.why && <p className="text-[13px] leading-[1.55] text-pretty text-[#C0B9D6]">{tool.why}</p>}
      {tool.accessNote && (
        <p className="text-[12.5px] leading-[1.55] text-pretty text-[#8A83A6]">{tool.accessNote}</p>
      )}
      <ToolLinks tool={tool} />
    </div>
  )
}
