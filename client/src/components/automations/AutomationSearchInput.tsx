import { useEffect, useState } from 'react'

/*
 * The automations search box.
 *
 * Built from the exact classes of the search pill in
 * components/catalogue/BrowseControls.tsx — same shell, icon and input — but on
 * its own: automations have no sort, and BrowseControls requires one. It keeps
 * the same draft discipline as Browse: the input holds the reader's typing, the
 * page debounces it into the URL, and the field re-syncs when the URL changes
 * underneath it (Back, a reset, a pasted link).
 */

interface AutomationSearchInputProps {
  /** The committed query, from the URL. */
  query: string
  /** Called on every keystroke; the page debounces before it becomes a request. */
  onQueryChange: (query: string) => void
}

export default function AutomationSearchInput({ query, onQueryChange }: AutomationSearchInputProps) {
  const [draft, setDraft] = useState(query)

  useEffect(() => {
    setDraft((current) => (current === query ? current : query))
  }, [query])

  return (
    <div className="relative mt-8 flex flex-wrap items-center gap-3">
      <div className="flex flex-[1_1_360px] items-center gap-[10px] rounded-pill border border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.065)_0%,rgba(255,255,255,0.02)_100%)] py-1 pr-[6px] pl-4 shadow-[inset_0_1px_0_rgba(224,212,255,0.18),0_18px_36px_-30px_rgba(0,0,0,0.9)]">
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
          aria-label="Search automations by the task you want done"
          placeholder="Describe a task — e.g. follow up with clients automatically"
          className="min-w-0 flex-auto border-0 bg-transparent px-1 py-3 text-[15px] tracking-[-0.006em] text-ink outline-none"
        />
      </div>
    </div>
  )
}
