import CatalogueToolGrid from '@/components/catalogue/CatalogueToolGrid'
import CatalogueToolSkeleton from '@/components/catalogue/CatalogueToolSkeleton'
import type { Tool } from '@/types/tool'

/*
 * One "band" of the MCP page's tool sections — MCP for Your Work, Featured
 * MCPs, Recently Added MCPs. Each is the same shape Home's own Featured/
 * Recently Added sections use (an eyebrow, a heading, an ambient tinted band),
 * over the same CatalogueToolGrid/Card/Skeleton every other catalogue page
 * already renders with, rather than three bespoke section designs.
 *
 * Renders nothing once loaded with an empty list — a heading over an empty
 * grid is worse than a heading that is not there, the same call Featured and
 * New Launches make for the whole-catalogue case.
 */

const TONE = {
  gold: {
    wash: 'bg-[linear-gradient(180deg,rgba(30,21,10,0)_0%,rgba(30,21,10,0.62)_14%,rgba(30,21,10,0.62)_86%,rgba(30,21,10,0)_100%)]',
    bloom:
      'bg-[radial-gradient(52%_52%_at_40%_50%,rgba(214,164,84,0.16)_0%,rgba(214,164,84,0.04)_46%,transparent_74%)]',
    eyebrow: 'text-[#E5C48C]',
  },
  blue: {
    wash: 'bg-[linear-gradient(180deg,rgba(8,14,32,0)_0%,rgba(8,14,32,0.85)_14%,rgba(8,14,32,0.85)_86%,rgba(8,14,32,0)_100%)]',
    bloom:
      'bg-[radial-gradient(52%_52%_at_60%_50%,rgba(70,120,240,0.14)_0%,transparent_72%)]',
    eyebrow: 'text-[#8FB4FF]',
  },
  violet: {
    wash: 'bg-[linear-gradient(180deg,rgba(20,14,36,0)_0%,rgba(20,14,36,0.6)_14%,rgba(20,14,36,0.6)_86%,rgba(20,14,36,0)_100%)]',
    bloom:
      'bg-[radial-gradient(52%_52%_at_50%_50%,rgba(140,100,250,0.16)_0%,transparent_72%)]',
    eyebrow: 'text-accent',
  },
} as const

interface McpToolSectionProps {
  tone: keyof typeof TONE
  eyebrow: string
  heading: string
  description?: string
  tools: Tool[]
  isLoading: boolean
  onCompare?: (tool: Tool) => void
  skeletonCount?: number
}

export default function McpToolSection({
  tone,
  eyebrow,
  heading,
  description,
  tools,
  isLoading,
  onCompare,
  skeletonCount = 6,
}: McpToolSectionProps) {
  if (!isLoading && tools.length === 0) return null

  const colors = TONE[tone]

  return (
    <section className="relative pt-[92px] pb-[84px]">
      <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${colors.wash}`} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[6%] left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.09),transparent)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] bottom-0 left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.055),transparent)]"
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-[30%] right-[8%] h-[340px] w-[min(760px,80%)] blur-[44px] ${colors.bloom}`}
      />

      <div className="relative mx-auto max-w-site px-8">
        <div data-reveal="0">
          <div className={`text-[11.5px] tracking-[0.2em] uppercase ${colors.eyebrow}`}>{eyebrow}</div>
          <h2 className="mt-3 text-[clamp(30px,3.2vw,40px)] leading-[1.08] font-bold tracking-[-0.032em] text-pretty text-ink">
            {heading}
          </h2>
          {description && (
            <p className="mt-3 max-w-[62ch] text-[15px] leading-[1.6] text-pretty text-muted-dim">
              {description}
            </p>
          )}
        </div>

        <div className="relative mt-7">
          {isLoading ? (
            <CatalogueToolSkeleton count={skeletonCount} />
          ) : (
            <CatalogueToolGrid tools={tools} onCompare={onCompare} />
          )}
        </div>
      </div>
    </section>
  )
}
