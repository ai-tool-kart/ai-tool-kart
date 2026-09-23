import { Link } from 'react-router-dom'
import { GRID_CLASS } from '@/components/catalogue/CatalogueToolGrid'
import SpotCard from '@/components/ui/SpotCard'
import Chip from '@/components/ui/Chip'
import { automationPath, beginnerLabel, META_PILL, priceLabel } from '@/components/automations/labels'
import type { AutomationCard } from '@/types/automation'

/*
 * One automation result, on the design's default card surface (SpotCard).
 *
 * Text sizes and colours are the catalogue card's (CatalogueToolCard's name,
 * meta line and tagline); the footer pills are the plan panel's. The whole card
 * is one link — the title's anchor is stretched over the card with an ::after,
 * so it clicks anywhere, middle-clicks into a new tab, and a screen reader
 * hears one link named by the title rather than a clickable div.
 *
 * The price pill renders ONLY when the API sent a tier. Its absence means the
 * source's pricing could not be classified, and no badge is the honest answer.
 */

/** Tool chips shown before "+N more". */
const TOOLS_SHOWN = 3

export default function AutomationResultCard({ automation }: { automation: AutomationCard }) {
  const extra = automation.tools.length - TOOLS_SHOWN

  return (
    <SpotCard reveal="stagger" className="flex flex-col gap-[11px] rounded-panel p-[18px]">
      <p className="relative truncate text-[12px] text-muted-dim">{automation.niche}</p>

      {/* Not `relative`: the link's ::after must position against the card. */}
      <h3 className="text-[16.5px] leading-[1.35] font-semibold tracking-[-0.018em] text-pretty text-[#F5F2FD]">
        <Link
          to={automationPath(automation.niche, automation.slug)}
          // The card title's own colour, over the global link colour — the
          // catalogue card's name is #F5F2FD at rest and on hover.
          className="text-[#F5F2FD] outline-none after:absolute after:inset-0 after:z-[3] after:content-[''] hover:text-[#F5F2FD] focus-visible:underline"
        >
          {automation.title}
        </Link>
      </h3>

      <p className="relative line-clamp-2 text-[13px] leading-[1.6] text-pretty text-[#8A849F]">
        {automation.persona}
      </p>

      {/* A labelled list, not a labelled div: aria-label is not allowed on a
          generic element, and "Tools, list, 2 items" is what a reader needs. */}
      <ul aria-label="Tools" className="relative flex list-none flex-wrap gap-[6px] p-0">
        {automation.tools.slice(0, TOOLS_SHOWN).map((name) => (
          <li key={name}>
            <Chip>{name}</Chip>
          </li>
        ))}
        {extra > 0 && (
          <li>
            <Chip>+{extra} more</Chip>
          </li>
        )}
      </ul>

      <div className="relative mt-auto flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-[14px]">
        <span className={META_PILL}>{beginnerLabel(automation.beginnerFriendly)}</span>
        {automation.pricingTier && <span className={META_PILL}>{priceLabel(automation.pricingTier)}</span>}
      </div>
    </SpotCard>
  )
}

export function AutomationResultGrid({ automations }: { automations: AutomationCard[] }) {
  return (
    <div className={GRID_CLASS}>
      {automations.map((automation) => (
        <AutomationResultCard key={`${automation.niche}/${automation.slug}`} automation={automation} />
      ))}
    </div>
  )
}

/* ── Loading ──────────────────────────────────────────────────────────────── */

/** The catalogue skeleton's sheen bar (CatalogueToolSkeleton), unchanged. */
function SkeletonBar({ width, delay }: { width: string; delay: string }) {
  return (
    <span style={{ width }} className="relative block h-[10px] overflow-hidden rounded-[5px] bg-white/[0.05]">
      <span
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg,transparent,rgba(196,168,255,0.2),transparent)',
          animation: `akSheen 1.7s ease-in-out ${delay} infinite`,
        }}
      />
    </span>
  )
}

function AutomationCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-[11px] rounded-panel border border-white/[0.075] bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.014)_100%)] p-[18px]"
    >
      <SkeletonBar width="34%" delay="0s" />
      <div className="flex flex-col gap-[7px]">
        <SkeletonBar width="92%" delay=".08s" />
        <SkeletonBar width="70%" delay=".16s" />
      </div>
      <div className="flex flex-col gap-[7px] pt-1">
        <SkeletonBar width="88%" delay=".24s" />
        <SkeletonBar width="60%" delay=".32s" />
      </div>
      <div className="mt-2 border-t border-white/[0.06] pt-[14px]">
        <SkeletonBar width="40%" delay=".4s" />
      </div>
    </div>
  )
}

export function AutomationResultSkeleton({ count }: { count: number }) {
  return (
    <div className={GRID_CLASS} role="status" aria-label="Loading automations">
      {Array.from({ length: count }, (_unused, index) => (
        <AutomationCardSkeleton key={index} />
      ))}
    </div>
  )
}
