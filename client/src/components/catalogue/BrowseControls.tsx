import { useEffect, useState } from 'react'
import type { SortDefinition } from '@/types/taxonomy'
import type { SortOption } from '@/types/tool'

/*
 * The Browse control row: search, sort, reset.
 *
 * Source: AI Tool Kart Site.dc.html, the pill row under the browse heading.
 *
 * ── The search input is the one place with local state ───────────────────────
 *
 * Everything else on this page reads straight from the URL. The search box
 * cannot: the URL is also the request, and writing a param per keystroke would
 * mean a request per keystroke and a history entry per keystroke. So the input
 * keeps the draft, the page debounces it into the URL, and the field re-syncs
 * whenever the URL changes underneath it — which is what makes Back actually
 * put the previous query back in the box instead of leaving a stale one.
 */

interface BrowseControlsProps {
  /** The committed query, from the URL. */
  query: string
  /** Called on every keystroke; the page debounces before it becomes a request. */
  onQueryChange: (query: string) => void
  sort: SortOption
  onSortChange: (sort: SortOption) => void
  /** From GET /api/taxonomy. Empty until it lands, or if it failed. */
  sorts: SortDefinition[]
  onReset: () => void
  /** Disables Reset when there is nothing to reset. */
  canReset: boolean
}

const PILL =
  'h-[50px] rounded-pill border border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.065)_0%,rgba(255,255,255,0.02)_100%)] shadow-[inset_0_1px_0_rgba(224,212,255,0.18)]'

export default function BrowseControls({
  query,
  onQueryChange,
  sort,
  onSortChange,
  sorts,
  onReset,
  canReset,
}: BrowseControlsProps) {
  const [draft, setDraft] = useState(query)

  /*
   * Re-sync when the committed query changes from outside this component —
   * Back/Forward, a Reset, or a link into /browse?q=…. Comparing before setting
   * keeps the user's own typing from being clobbered by the debounced write
   * that their typing caused.
   */
  useEffect(() => {
    setDraft((current) => (current === query ? current : query))
  }, [query])

  return (
    <div className="relative mt-8 flex flex-wrap items-center gap-3">
      <div
        className={`flex flex-[1_1_360px] items-center gap-[10px] rounded-pill border border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.065)_0%,rgba(255,255,255,0.02)_100%)] py-1 pr-[6px] pl-4 shadow-[inset_0_1px_0_rgba(224,212,255,0.18),0_18px_36px_-30px_rgba(0,0,0,0.9)]`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#7C7697"
          strokeWidth="1.9"
          strokeLinecap="round"
          aria-hidden="true"
          className="h-4 w-4 flex-none"
        >
          <circle cx="11" cy="11" r="6.4" />
          <path d="m20.5 20.5-4.2-4.2" />
        </svg>
        <input
          type="search"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            onQueryChange(event.target.value)
          }}
          aria-label="Search the catalogue by name, task or tag"
          placeholder="Search by name, task or tag"
          className="min-w-0 flex-auto border-0 bg-transparent px-1 py-3 text-[15px] tracking-[-0.006em] text-ink outline-none"
        />
      </div>

      <label className="sr-only" htmlFor="browse-sort">
        Sort results
      </label>
      <select
        id="browse-sort"
        value={sort}
        onChange={(event) => onSortChange(event.target.value as SortOption)}
        /* Empty until the taxonomy lands: a sort the API does not know is a 400,
           so the control offers the server's list or nothing. */
        disabled={sorts.length === 0}
        className={`${PILL} cursor-pointer px-4 text-[14px] font-medium text-[#E4DEF5] outline-none disabled:cursor-default disabled:opacity-50`}
      >
        {sorts.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onReset}
        disabled={!canReset}
        className={`${PILL} inline-flex cursor-pointer items-center gap-2 px-[18px] text-[14px] font-medium text-muted-soft transition-[color,border-color] duration-300 hover:border-[rgba(178,150,255,0.32)] hover:text-[#EFE9FF] disabled:cursor-default disabled:opacity-40 disabled:hover:border-white/[0.09] disabled:hover:text-muted-soft`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          aria-hidden="true"
          className="h-[14px] w-[14px]"
        >
          <path d="M4.5 12a7.5 7.5 0 1 0 2.6-5.7" />
          <path d="M4.2 4.6v3.3h3.3" />
        </svg>
        Reset
      </button>
    </div>
  )
}
