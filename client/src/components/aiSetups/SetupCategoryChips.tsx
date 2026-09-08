import { SETUP_CATEGORIES, type SetupCategory } from '@/types/aiSetup'

/*
 * The setup library's filter chips: All, then the ten groupings.
 *
 * Source: AI Tool Kart Site.dc.html, the `workCats` row — centred, wrapping,
 * with the selected chip carrying the violet fill and its lift shadow.
 *
 * ── Why this is not components/catalogue/CategoryChipRow ─────────────────────
 *
 * That row filters the CATALOGUE: its values come from GET /api/taxonomy, it is
 * multi-select because the API's `cat` parameter OR-s an array, and every click
 * is a request. This row filters an EDITORIAL LIST already in the browser: the
 * labels are product groupings with no counterpart in the taxonomy, only one can
 * be active because a setup has exactly one category, and no click touches the
 * network. Two rows that look similar and mean different things; sharing one
 * component would have to erase one of those meanings.
 *
 * Single-select is expressed as radio semantics — `role="radiogroup"` with
 * `aria-checked` — rather than the toggle-button `aria-pressed` the catalogue
 * row uses, because that is what a one-of-many choice is.
 */

const CHIP =
  'cursor-pointer rounded-pill border px-4 py-[9px] text-[13.5px] font-semibold tracking-[-0.012em] whitespace-nowrap transition-[color,border-color,background,box-shadow,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent'

const ACTIVE =
  'border-[rgba(178,150,255,0.5)] bg-[linear-gradient(180deg,rgba(124,90,246,0.34)_0%,rgba(84,54,190,0.26)_100%)] text-[#F3EEFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_-18px_rgba(116,80,244,0.9)]'

const IDLE =
  'border-white/[0.085] bg-white/[0.028] text-[#9A94B4] hover:border-[rgba(178,150,255,0.32)] hover:text-[#EFE9FF]'

interface SetupCategoryChipsProps {
  /** `undefined` is the "All" chip. */
  selected: SetupCategory | undefined
  onSelect: (category: SetupCategory | undefined) => void
}

export default function SetupCategoryChips({ selected, onSelect }: SetupCategoryChipsProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Filter setups by kind of work"
      data-reveal="0.06"
      className="mt-7 flex flex-wrap justify-center gap-2"
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
      {SETUP_CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          role="radio"
          aria-checked={selected === category}
          onClick={() => onSelect(category)}
          className={`${CHIP} ${selected === category ? ACTIVE : IDLE}`}
        >
          {category}
        </button>
      ))}
    </div>
  )
}
