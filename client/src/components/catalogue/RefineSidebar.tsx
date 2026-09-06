import type { PricingTierName } from '@/types/tool'

/*
 * The "Refine" rail beside the results.
 *
 * Source: AI Tool Kart Site.dc.html, the sticky `<aside>` on the browse screen.
 * Same 24px glass panel, same uppercase micro-labels, same closing note about
 * placement not being for sale.
 *
 * ── The minimum-rating slider is gone, and that is not a simplification ──────
 *
 * The design's rail carries a 0–5 rating slider. The API supports it
 * (`minRating`), and it works exactly as specified — which is the problem: every
 * tool in the seeded catalogue has `rating: 0`, so `minRating=4` returns
 * total=0. Verified against the live endpoint. The control could only ever do
 * one thing: empty the page.
 *
 * The v1 React page defaulted it to 4, which against the real catalogue would
 * have shown an empty grid on first load with no filter visibly applied.
 *
 * So the slider is not rendered and `minRating` is never sent. It returns, with
 * the star ratings on the cards, when the catalogue has ratings to filter on.
 *
 * ── Why the chips are tiers, not pricing models ──────────────────────────────
 *
 * The design offers six chips from the `model` vocabulary (Free, Freemium,
 * Subscription, Credits, Usage-based, plus "Any"). The API filters on
 * `pricingTier`, which has three values. Two of the design's six match nothing
 * in the catalogue at all. Filtering by `model` would mean pulling all 66 tools
 * into the browser to do it here, which breaks the moment the catalogue grows.
 * The chips are therefore the tiers the server can actually answer.
 */

interface RefineSidebarProps {
  /** From GET /api/taxonomy: ['free', 'freemium', 'paid']. */
  tiers: PricingTierName[]
  selected: PricingTierName[]
  onToggle: (tier: PricingTierName) => void
}

/** The API's ids are lowercase; these are what a reader should see. */
const TIER_LABELS: Record<PricingTierName, string> = {
  free: 'Free',
  freemium: 'Freemium',
  paid: 'Paid',
}

export default function RefineSidebar({ tiers, selected, onToggle }: RefineSidebarProps) {
  return (
    <aside className="sticky top-[104px] flex flex-col gap-[26px] rounded-panel border border-white/[0.075] bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.018)_100%)] p-[22px] shadow-[inset_0_1px_0_rgba(224,212,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.45),0_24px_46px_-34px_rgba(0,0,0,0.95)]">
      <h2 className="text-[11.5px] tracking-[0.16em] text-accent uppercase">Refine</h2>

      {/* The taxonomy request failed, so there is nothing honest to offer —
          a "Pricing" heading over no chips reads as a broken control. */}
      {tiers.length > 0 && (
      <div>
        <h3 className="text-[11.5px] tracking-[0.12em] text-[#6E6890] uppercase">Pricing</h3>
        <div className="mt-[13px] flex flex-wrap gap-[7px]">
          {tiers.map((tier) => {
            const active = selected.includes(tier)
            return (
              <button
                key={tier}
                type="button"
                onClick={() => onToggle(tier)}
                aria-pressed={active}
                className={`cursor-pointer rounded-pill border px-3 py-[7px] text-[12.5px] font-medium transition-[color,border-color,background-color] duration-300 ${
                  active
                    ? 'border-[rgba(178,150,255,0.5)] bg-[rgba(124,88,244,0.22)] text-[#F1EAFF]'
                    : 'border-white/[0.09] bg-white/[0.035] text-muted-soft hover:border-[rgba(178,150,255,0.32)] hover:text-[#E9E2FF]'
                }`}
              >
                {TIER_LABELS[tier]}
              </button>
            )
          })}
        </div>
      </div>
      )}

      <p className="border-t border-white/[0.06] pt-[18px] text-[12.5px] leading-[1.6] text-[#615C7A]">
        Rankings come from our own test runs. Vendors can&apos;t buy placement.
      </p>
    </aside>
  )
}
