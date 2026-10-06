import { ACTIVE, CHIP, IDLE } from '@/components/aiSetups/setupChipStyles'
import { NICHES, type NicheName } from '@/types/automation'

/*
 * A niche filter: "All", then a list of niches. Single-select, expressed as
 * radio semantics — `role="radiogroup"` with `aria-checked` — because that is
 * what a one-of-many choice is.
 *
 * Two callers, one chip (aiSetups/setupChipStyles):
 *
 *   /workflows          every niche — NICHES, the mirror of the server's list,
 *                       because the API answers a niche it does not know with
 *                       a 400. The row carries `id="niches"`, the target of the
 *                       homepage's "Explore all niches".
 *   Home, AI for Your   the niches GET /api/automations/home returned, in the
 *   Work                server's configured order, laid out as that section's
 *                       centred wrap.
 */

/*
 * 26 chips wrap to ~15 rows on a phone, burying the results. Below `sm` they
 * are one scrolling row instead (the Guides page's pattern), padded so the
 * hover lift and focus ring are not clipped; from `sm` up, the Workflows
 * design's centred wrap. `scroll-mt` clears the fixed header for `#niches`.
 */
const SCROLLING_ROW =
  '-mx-8 mt-6 flex scroll-mt-[110px] gap-2 overflow-x-auto px-8 pt-1 pb-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden'

interface WorkflowNicheChipsProps {
  /** `undefined` is the "All" chip. */
  selected: NicheName | undefined
  onSelect: (niche: NicheName | undefined) => void
  /** The niches offered, in order. Defaults to every niche. */
  niches?: readonly NicheName[]
  /** Replaces the row's layout classes. Defaults to the /workflows row. */
  className?: string
  id?: string
  label?: string
}

export default function WorkflowNicheChips({
  selected,
  onSelect,
  niches = NICHES,
  className = SCROLLING_ROW,
  id,
  label = 'Filter workflows by who they are for',
}: WorkflowNicheChipsProps) {
  return (
    <div id={id} role="radiogroup" aria-label={label} data-reveal="0.06" className={className}>
      <button
        type="button"
        role="radio"
        aria-checked={selected === undefined}
        onClick={() => onSelect(undefined)}
        className={`${CHIP} ${selected === undefined ? ACTIVE : IDLE}`}
      >
        All
      </button>
      {niches.map((niche) => (
        <button
          key={niche}
          type="button"
          role="radio"
          aria-checked={selected === niche}
          onClick={() => onSelect(niche)}
          className={`${CHIP} ${selected === niche ? ACTIVE : IDLE}`}
        >
          {niche}
        </button>
      ))}
    </div>
  )
}
