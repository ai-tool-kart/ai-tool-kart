import { ACTIVE, CHIP, IDLE } from '@/components/aiSetups/SetupCategoryChips'
import { NICHES, type NicheName } from '@/types/automation'

/*
 * The /workflows niche filter: "All", then the API's 25 niches.
 *
 * The Workflows page's own chip design (SetupCategoryChips — centred, wrapping,
 * radio semantics, the same classes imported rather than copied) over the
 * automations vocabulary. Values come from NICHES, the mirror of the server's
 * list, because the API answers a niche it does not know with a 400.
 */

interface WorkflowNicheChipsProps {
  /** `undefined` is the "All" chip. */
  selected: NicheName | undefined
  onSelect: (niche: NicheName | undefined) => void
}

export default function WorkflowNicheChips({ selected, onSelect }: WorkflowNicheChipsProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Filter workflows by who they are for"
      data-reveal="0.06"
      /*
       * 26 chips wrap to ~15 rows on a phone, burying the results. Below `sm`
       * they are one scrolling row instead (the Guides page's pattern), padded
       * so the hover lift and focus ring are not clipped; from `sm` up, the
       * Workflows design's centred wrap.
       */
      className="-mx-8 mt-6 flex gap-2 overflow-x-auto px-8 pt-1 pb-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected === undefined}
        onClick={() => onSelect(undefined)}
        className={`${CHIP} ${selected === undefined ? ACTIVE : IDLE}`}
      >
        All
      </button>
      {NICHES.map((niche) => (
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
