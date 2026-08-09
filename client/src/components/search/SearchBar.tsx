import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Select from '@/components/ui/Select'
import { ALL_CATEGORIES, CATEGORY_OPTIONS } from '@/data/filters'

/*
 * Hero search shell.
 *
 * Source: AI Tool Kart Site.dc.html, [data-search-shell]. The four inner
 * light layers (top hairline, bottom hairline, bottom wash, travelling shine)
 * are decorative and reproduced exactly; the shine uses the akShine keyframe.
 *
 * Submitting navigates to /browse with query params — the prototype had no URL,
 * so this is the routed equivalent of its `runSearch()` / Enter handler.
 */

export default function SearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>(ALL_CATEGORIES)

  function runSearch() {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (category !== ALL_CATEGORIES) params.set('cat', category)
    const search = params.toString()
    navigate(search ? `/browse?${search}` : '/browse')
  }

  return (
    <div
      data-search-shell="1"
      className="relative flex items-center gap-2 overflow-hidden rounded-search border border-hairline-strong bg-[image:var(--gradient-search)] py-[7px] pr-[7px] pl-4 shadow-search backdrop-blur-[3px] backdrop-saturate-[1.6] backdrop-brightness-[1.04] transition-[box-shadow,border-color,transform] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[3px] hover:border-[rgba(180,152,255,0.4)] hover:shadow-[inset_0_1.5px_0_rgba(255,255,255,0.42),inset_0_-1.5px_0_rgba(0,0,0,0.55),0_1px_2px_rgba(0,0,0,0.7),0_14px_26px_-12px_rgba(0,0,0,0.85),0_60px_104px_-40px_rgba(0,0,0,1),0_0_96px_-30px_rgba(140,98,255,0.62)]"
    >
      {/* Decorative light layers. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[10%] left-[10%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.58),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[20%] bottom-0 left-[20%] h-px bg-[linear-gradient(90deg,transparent,rgba(196,168,255,0.26),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 bottom-0 left-0 h-[42%] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(190,160,255,0.045)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 bottom-0 left-0 w-[24%] bg-[linear-gradient(100deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.11)_48%,rgba(255,255,255,0)_100%)] [animation:akShine_14s_cubic-bezier(.4,0,.6,1)_infinite]"
      />

      <span className="relative text-[17px] text-[#8A83A6]">⌕</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') runSearch()
        }}
        aria-label="Search tools"
        placeholder="Describe the job — “summarize sales calls”…"
        className="relative min-w-0 flex-auto border-0 bg-transparent px-1 py-[13px] text-[15.5px] tracking-[-0.011em] text-white outline-none"
      />
      <Select
        variant="search"
        value={category}
        onChange={setCategory}
        options={CATEGORY_OPTIONS}
        ariaLabel="Filter by category"
      />
      <button
        type="button"
        onClick={runSearch}
        data-magnet="1"
        className="relative flex-none cursor-pointer rounded-pill border border-white/20 bg-[linear-gradient(180deg,#B08CFF_0%,#8858F2_48%,#6A32DC_100%)] px-[22px] py-3 text-[14.5px] font-semibold whitespace-nowrap text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_10px_26px_-12px_rgba(136,88,242,0.9)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_18px_40px_-14px_rgba(136,88,242,1),0_0_46px_-14px_rgba(160,110,255,0.8)]"
      >
        Search
      </button>
    </div>
  )
}
