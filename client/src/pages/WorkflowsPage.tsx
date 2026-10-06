import { useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import AutomationSearchInput from '@/components/automations/AutomationSearchInput'
import { AutomationResultSkeleton } from '@/components/automations/AutomationResultCard'
import { StatePanel } from '@/components/catalogue/BrowseStates'
import WorkflowCard from '@/components/workflows/WorkflowCard'
import WorkflowNicheChips from '@/components/workflows/WorkflowNicheChips'
import { useAutomations } from '@/hooks/useAutomations'
import { useToolIndex } from '@/hooks/useToolIndex'
import { SEARCH_DEBOUNCE_MS } from '@/hooks/useTools'
import { MAX_AUTOMATIONS } from '@/services/automations'
import { isNiche, type AutomationFilters, type NicheName } from '@/types/automation'

/*
 * /workflows — the one workflow listing on the site.
 *
 * ── One listing, not two ─────────────────────────────────────────────────────
 *
 * This page used to render 19 editorial homepage setups while /automations ("Guides") listed the real guide catalogue. They are now
 * one page: this route, this design, that data. /automations redirects here
 * (App.tsx, and a 301 in vercel.json), and each card opens the guide itself at
 * /automations/:niche/:slug — the prerendered SEO page, unchanged.
 *
 * The homepage's "AI for Your Work" is a taster of this same data, drawn from
 * GET /api/automations/home; its "Explore all niches" lands on the chip row
 * here (`#niches`).
 *
 * ── The data path ────────────────────────────────────────────────────────────
 *
 *   WorkflowsPage → useAutomations → services/automations.ts
 *                                      → GET /api/automations?q=&niche=&limit=50
 *
 * The same hook, the same service and the same server-side search the Guides
 * page used. No copy of the catalogue lives in the client.
 *
 * ── The URL is the state ─────────────────────────────────────────────────────
 *
 * `q` and `niche`, exactly as /automations had them, so the redirect carries
 * every old filtered link across untouched. A typed query leaves one history
 * entry, not one per keystroke; an unknown `niche` is dropped rather than sent,
 * because the API answers an unknown niche with a 400.
 *
 * ── The cap ──────────────────────────────────────────────────────────────────
 *
 * The API returns at most 50 results and has no cursor, but counts every match.
 * So the status line reports the real total and says when only the first 50
 * are shown — search and the niche chips are how the rest are reached.
 */

export default function WorkflowsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters: AutomationFilters = useMemo(() => {
    const niche = searchParams.get('niche')
    return {
      q: searchParams.get('q') ?? '',
      ...(isNiche(niche) ? { niche } : {}),
    }
  }, [searchParams])

  /*
   * The shared catalogue read (cached once per page load, and usually already
   * resolved by the homepage), only to draw matched tools' own monograms.
   */
  const { index: toolIndex, isLoading: toolsLoading, failed: toolsFailed } = useToolIndex()
  const toolsStatus = toolsLoading ? 'loading' : toolIndex === undefined || toolsFailed ? 'unavailable' : 'ready'

  /* Typing debounces; a chip click does not. */
  const typingRef = useRef(false)

  const results = useAutomations(filters, {
    debounceMs: typingRef.current ? SEARCH_DEBOUNCE_MS : 0,
    limit: MAX_AUTOMATIONS,
  })

  /**
   * Writes the next filters to the URL. The first keystroke of a query pushes a
   * history entry and the rest replace it, so Back undoes the whole query and
   * not the chip click before it.
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

  return (
    <section className="relative mx-auto max-w-site px-8 pt-16 pb-[88px]">
      {/* The two drifting mesh glows the design puts behind a catalogue screen. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[2%] left-[-14%] h-[540px] w-[56%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(124,88,244,0.2)_0%,rgba(96,52,210,0.06)_48%,transparent_76%)] blur-[48px] [animation:akMeshA_74s_cubic-bezier(.45,0,.55,1)_infinite]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[34%] right-[-16%] h-[620px] w-[52%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(154,110,255,0.15)_0%,rgba(202,168,255,0.05)_46%,transparent_74%)] blur-[54px] [animation:akMeshB_92s_cubic-bezier(.45,0,.55,1)_infinite]"
      />

      <header className="relative text-center">
        <p className="text-[11.5px] tracking-[0.2em] text-accent uppercase">Complete AI workflows</p>
        <h1 className="mx-auto mt-3 text-[clamp(34px,5vw,52px)] font-bold tracking-[-0.04em] text-balance text-ink">
          Workflows
        </h1>
        <p className="mx-auto mt-[14px] max-w-[58ch] text-[15.5px] leading-[1.65] tracking-[-0.006em] text-pretty text-muted-dim">
          Step-by-step AI workflows for real jobs &mdash; the tools to use, the order to run them
          in, and the prompts. Describe a task or pick who it&rsquo;s for.
        </p>
      </header>

      <div className="relative mx-auto max-w-[760px]">
        <AutomationSearchInput
          query={filters.q}
          onQueryChange={(q) => update({ q }, { fromTyping: true })}
        />
      </div>

      <WorkflowNicheChips
        id="niches"
        selected={filters.niche}
        onSelect={(niche?: NicheName) => update({ niche })}
      />

      <div className="relative mt-[26px]">
        {/* The cards' titles are h3s; this keeps the outline h1 → h2 → h3. */}
        <h2 className="sr-only">Results</h2>
        <div className="mb-[18px] flex items-baseline justify-between gap-4">
          <p className="text-[14px] text-muted-dim" aria-live="polite">
            {results.isLoading && 'Loading workflows…'}
            {results.error && !results.isLoading && 'Workflows unavailable'}
            {countKnown && (
              <>
                <span className="font-semibold text-[#E4DEF5]">{countText}</span>{' '}
                {count === 1 ? 'workflow matches' : 'workflows match'}
                {shown < count && (
                  <span className="text-muted-dim"> · showing the first {shown.toLocaleString()}</span>
                )}
              </>
            )}
          </p>
          {countKnown && filters.q.trim() && <p className="text-[13px] text-muted-dim">Best match first</p>}
        </div>

        {results.isLoading ? (
          <AutomationResultSkeleton count={6} />
        ) : results.error ? (
          <StatePanel
            role="alert"
            title="Workflows could not be loaded"
            detail={results.error}
            action={{ label: 'Try again', onClick: results.retry }}
          />
        ) : shown === 0 ? (
          <StatePanel
            role="status"
            title="Nothing matches that search"
            detail="Try fewer or different words, or choose All."
            action={{ label: 'Reset search', onClick: reset }}
          />
        ) : (
          /*
           * The Workflows grid, with the `min(336px,100%)` guard on the lower
           * bound so a track never pushes a narrow phone sideways.
           */
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(336px,100%),1fr))] gap-[18px]">
            {results.automations.map((automation, index) => (
              <WorkflowCard
                key={`${automation.niche}/${automation.slug}`}
                automation={automation}
                position={index}
                toolIndex={toolIndex}
                toolsStatus={toolsStatus}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
