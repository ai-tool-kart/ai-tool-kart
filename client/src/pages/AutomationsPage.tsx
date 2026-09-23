import { useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import AutomationSearchInput from '@/components/automations/AutomationSearchInput'
import {
  AutomationResultGrid,
  AutomationResultSkeleton,
} from '@/components/automations/AutomationResultCard'
import NicheChipRow from '@/components/automations/NicheChipRow'
import { StatePanel } from '@/components/catalogue/BrowseStates'
import { useAutomations } from '@/hooks/useAutomations'
import { SEARCH_DEBOUNCE_MS } from '@/hooks/useTools'
import { MAX_AUTOMATIONS } from '@/services/automations'
import { isNiche, type AutomationFilters, type NicheName } from '@/types/automation'

/*
 * /automations — search task recipes, from GET /api/automations.
 *
 * Built to BrowsePage's shape (SPEC-automations.md §1a): the same heading
 * block and count pill, the same pill search control, a scrolling chip row,
 * and the same four exclusive result states in the same dashed panel.
 *
 * ── The URL is the state ─────────────────────────────────────────────────────
 *
 * `q` and `niche` live in the query string, so a search is shareable, survives
 * a reload and moves under Back/Forward — exactly as on Browse, including the
 * rule that a typed query leaves one history entry, not one per keystroke.
 * A `niche` the vocabulary does not know is dropped rather than sent: the API
 * answers an unknown niche with a 400 for the whole request.
 *
 * ── The count is the server's total ──────────────────────────────────────────
 *
 * The API returns at most 50 results but counts every match, so the pill and
 * the status line report the real number. When it is larger than what is
 * shown, the status line says so rather than letting 50 cards pass for all.
 */

export default function AutomationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters: AutomationFilters = useMemo(() => {
    const niche = searchParams.get('niche')
    return {
      q: searchParams.get('q') ?? '',
      ...(isNiche(niche) ? { niche } : {}),
    }
  }, [searchParams])

  /* Typing debounces; a chip click does not — as on Browse. */
  const typingRef = useRef(false)

  const results = useAutomations(filters, {
    debounceMs: typingRef.current ? SEARCH_DEBOUNCE_MS : 0,
    limit: MAX_AUTOMATIONS,
  })

  /**
   * Writes the next filters to the URL. The first keystroke of a query pushes
   * a history entry and the rest replace it, so Back undoes the whole query
   * and not the chip click before it (BrowsePage's rule, same reason).
   */
  const update = useCallback(
    (patch: Partial<AutomationFilters>, { fromTyping = false } = {}) => {
      const continuingToType = fromTyping && typingRef.current
      typingRef.current = fromTyping
      const next = { ...filters, ...patch }
      const params = new URLSearchParams()
      if (next.q.trim()) params.set('q', next.q)
      if (next.niche) params.set('niche', next.niche)
      setSearchParams(params, { replace: continuingToType })
    },
    [filters, setSearchParams],
  )

  const reset = useCallback(() => {
    typingRef.current = false
    setSearchParams(new URLSearchParams())
  }, [setSearchParams])

  const shown = results.automations.length
  const count = results.total
  const countKnown = !results.isLoading && !results.error
  const countText = count.toLocaleString()
  const filtered = filters.q.trim().length > 0 || filters.niche !== undefined

  return (
    <section className="relative mx-auto max-w-site px-8 pt-16">
      {/* The same two drifting mesh glows as Browse. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[4%] left-[-12%] h-[520px] w-[58%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(124,88,244,0.2)_0%,rgba(96,52,210,0.06)_48%,transparent_76%)] blur-[46px] [animation:akMeshA_72s_cubic-bezier(.45,0,.55,1)_infinite]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[26%] right-[-16%] h-[600px] w-[52%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(154,110,255,0.16)_0%,rgba(202,168,255,0.05)_46%,transparent_74%)] blur-[52px] [animation:akMeshB_88s_cubic-bezier(.45,0,.55,1)_infinite]"
      />

      <header className="relative flex flex-wrap items-end justify-between gap-7">
        <div>
          <p className="text-[11.5px] tracking-[0.2em] text-accent uppercase">Automations</p>
          <h1 className="mt-3 text-[clamp(34px,5vw,52px)] font-bold tracking-[-0.04em] text-ink">
            Find an AI automation
          </h1>
          <p className="mt-[14px] max-w-[56ch] text-[15.5px] leading-[1.65] tracking-[-0.006em] text-pretty text-muted-dim">
            Describe a task in your own words. Each result is a short recipe: the tool to open, a
            prompt to start from, and how it works.
          </p>
        </div>
        <div className="inline-flex items-center gap-[9px] rounded-pill border border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.022)_100%)] px-4 py-[10px] shadow-[inset_0_1px_0_rgba(224,212,255,0.18)]">
          <span
            aria-hidden="true"
            className="h-[6px] w-[6px] rounded-full bg-[#9BE7C4] shadow-[0_0_9px_2px_rgba(120,220,170,0.6)]"
          />
          <span className="text-[13.5px] font-semibold text-[#E4DEF5]">
            {countKnown ? `${countText} ${count === 1 ? 'automation' : 'automations'}` : '— automations'}
          </span>
          {countKnown && filtered && <span className="text-[13px] text-[#615C7A]">· filtered</span>}
        </div>
      </header>

      <AutomationSearchInput query={filters.q} onQueryChange={(q) => update({ q }, { fromTyping: true })} />

      <NicheChipRow selected={filters.niche} onSelect={(niche?: NicheName) => update({ niche })} />

      <div className="relative mt-[22px]">
        {/* The cards' titles are h3s; this keeps the outline h1 → h2 → h3. */}
        <h2 className="sr-only">Results</h2>
        <div className="mb-[18px] flex items-baseline justify-between gap-4">
          <p className="text-[14px] text-muted-dim" aria-live="polite">
            {results.isLoading && 'Loading automations…'}
            {results.error && !results.isLoading && 'Automations unavailable'}
            {countKnown && (
              <>
                <span className="font-semibold text-[#E4DEF5]">{countText}</span>{' '}
                {count === 1 ? 'automation matches' : 'automations match'}
                {shown < count && (
                  <span className="text-[#615C7A]"> · showing the first {shown.toLocaleString()}</span>
                )}
              </>
            )}
          </p>
          {countKnown && filters.q.trim() && <p className="text-[13px] text-[#615C7A]">Best match first</p>}
        </div>

        {results.isLoading ? (
          <AutomationResultSkeleton count={6} />
        ) : results.error ? (
          <StatePanel
            role="alert"
            title="Automations could not be loaded"
            detail={results.error}
            action={{ label: 'Try again', onClick: results.retry }}
          />
        ) : shown === 0 ? (
          <StatePanel
            role="status"
            title="Nothing matches that search"
            detail="Try fewer or different words, or clear the niche."
            action={{ label: 'Reset search', onClick: reset }}
          />
        ) : (
          <AutomationResultGrid automations={results.automations} />
        )}
      </div>
    </section>
  )
}
