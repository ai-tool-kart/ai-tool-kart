import { MIN_RATING_MAX, MIN_RATING_STEP } from '@/utils/browseParams'
import type { PricingTierName } from '@/types/tool'

/*
 * The "Refine" rail beside the results.
 *
 * Source: AI Tool Kart Site.dc.html, the `<aside>` on the browse screen —
 * a 22px glass panel with 26px between its blocks, an uppercase violet title,
 * two filter sections and a closing note, all reproduced at the handoff's
 * values.
 *
 * ── Sticky ───────────────────────────────────────────────────────────────────
 *
 * `position: sticky` with the handoff's own `top: 104px`, which clears the
 * ticker and the floating nav pill above it.
 *
 * This element must be rendered as a DIRECT GRID ITEM of the Browse layout, and
 * the responsive hiding must live on the `className` this component is given —
 * never on a wrapper around it. A sticky element is positioned within its
 * containing block, and for a grid item that containing block is the GRID AREA,
 * which spans the full height of the row. Wrap it in a plain `<div>` and the
 * containing block becomes that div instead, which under `align-items: start`
 * is exactly as tall as the rail itself — leaving zero distance to travel, so
 * the rail scrolls away looking as though sticky simply does not work. That was
 * the bug; the fix is structural, not a CSS property.
 */

interface RefineSidebarProps {
  /** From GET /api/taxonomy: ['free', 'freemium', 'paid']. */
  tiers: PricingTierName[]
  selected: PricingTierName[]
  onToggle: (tier: PricingTierName) => void
  /** Clears every tier. Backs the "Any" chip. */
  onClearTiers: () => void
  minRating: number
  onMinRatingChange: (value: number) => void
  /** Placement and responsive visibility, owned by the page that lays it out. */
  className?: string
}

/**
 * The API's tier ids are lowercase; these are what a reader should see.
 *
 * The handoff's rail offers six chips drawn from the `model` vocabulary — Any,
 * Free, Freemium, Subscription, Credits, Usage-based. Only three of those are a
 * filter the catalogue can answer: `GET /api/tools` filters on `pricingTier`
 * (free · freemium · paid), and `model` is a display string with no query
 * parameter behind it. Reproducing all six would put three chips on the panel
 * that all resolve to the same request — "Credits" would return every paid
 * tool, including subscription ones — and two ("Credits", "Usage-based") match
 * no tool in the catalogue at all.
 *
 * So the mapping happens here, at the presentation boundary: the design's chip
 * row and its "Any" sentinel, over the axis the server actually filters on.
 */
const TIER_LABELS: Record<PricingTierName, string> = {
  free: 'Free',
  freemium: 'Freemium',
  paid: 'Paid',
}

const CHIP =
  'cursor-pointer rounded-pill border px-3 py-[7px] text-[12.5px] font-medium transition-[color,border-color,background-color] duration-300 ease-out'

const CHIP_ACTIVE = 'border-[rgba(178,150,255,0.5)] bg-[rgba(124,88,244,0.22)] text-[#F1EAFF]'

const CHIP_IDLE =
  'border-white/[0.09] bg-white/[0.035] text-muted-soft hover:border-[rgba(178,150,255,0.42)] hover:text-[#E9E2FF]'

export default function RefineSidebar({
  tiers,
  selected,
  onToggle,
  onClearTiers,
  minRating,
  onMinRatingChange,
  className = '',
}: RefineSidebarProps) {
  return (
    <aside
      aria-label="Refine results"
      className={`sticky top-[104px] flex flex-col gap-[26px] rounded-panel border border-white/[0.075] bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.018)_100%)] p-[22px] shadow-[inset_0_1px_0_rgba(224,212,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.4),0_24px_46px_-34px_rgba(0,0,0,0.95)] ${className}`}
    >
      <h2 className="text-[11.5px] tracking-[0.16em] text-accent uppercase">Refine</h2>

      {/* Hidden only when the taxonomy request failed: a heading over no chips
          reads as a broken control rather than an empty one. */}
      {tiers.length > 0 && (
        <div>
          <h3 className="text-[11.5px] tracking-[0.12em] text-[#6E6890] uppercase">
            Pricing model
          </h3>
          <div className="mt-[13px] flex flex-wrap gap-[7px]">
            {/* "Any" is not a tier — it is the absence of one, which is also
                how the URL and the request express it. */}
            <button
              type="button"
              onClick={onClearTiers}
              aria-pressed={selected.length === 0}
              className={`${CHIP} ${selected.length === 0 ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              Any
            </button>
            {tiers.map((tier) => {
              const active = selected.includes(tier)
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => onToggle(tier)}
                  aria-pressed={active}
                  className={`${CHIP} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
                >
                  {TIER_LABELS[tier]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <h3
          id="min-rating-label"
          className="text-[11.5px] tracking-[0.12em] text-[#6E6890] uppercase"
        >
          Minimum rating
        </h3>
        <div className="mt-[14px] flex items-center gap-3">
          {/*
           * A real filter, not a decoration: the value goes into the URL and on
           * to `GET /api/tools?minRating=`, which applies it across the whole
           * catalogue. `accent-color` is the handoff's own styling for the
           * track and thumb, so the native control is kept rather than rebuilt.
           */}
          <input
            type="range"
            min={0}
            max={MIN_RATING_MAX}
            step={MIN_RATING_STEP}
            value={minRating}
            onChange={(event) => onMinRatingChange(Number(event.target.value))}
            aria-labelledby="min-rating-label"
            aria-valuetext={minRating === 0 ? 'No minimum' : `${minRating} stars and above`}
            className="min-w-0 flex-auto cursor-pointer accent-[#A98BFF]"
          />
          <span className="inline-flex items-center gap-1 text-[13.5px] font-semibold whitespace-nowrap text-[#EDE8FA]">
            <svg viewBox="0 0 24 24" fill="#E5C48C" aria-hidden="true" className="h-3 w-3">
              <path d="m12 3.6 2.6 5.4 5.9.82-4.3 4.16 1.03 5.86L12 17.1 6.77 19.84 7.8 13.98 3.5 9.82l5.9-.82L12 3.6Z" />
            </svg>
            {minRating}
          </span>
        </div>
      </div>

      <p className="border-t border-white/[0.06] pt-[18px] text-[12.5px] leading-[1.6] text-muted-dim">
        Rankings come from our own test runs. Vendors can&apos;t buy placement.
      </p>
    </aside>
  )
}
