import { useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SetupCard from '@/components/aiSetups/SetupCard'
import { automationPath } from '@/components/automations/labels'
import SetupCategoryChips from '@/components/aiSetups/SetupCategoryChips'
import { AI_SETUPS } from '@/data/aiSetups'
import { useToolIndex } from '@/hooks/useToolIndex'
import { SETUP_CATEGORIES, type ResolvedSetup, type SetupCategory } from '@/types/aiSetup'
import { composeSetupRequest, librarySetupsForCategory, resolveSetup } from '@/utils/aiSetups'

/*
 * /workflows — the whole AI setup library.
 *
 * The nav has carried a "Workflows" item since the final design's export, and
 * until now it pointed at /browse because no screen existed behind it. This is
 * that screen.
 *
 * ── Nothing here is a new design ─────────────────────────────────────────────
 *
 * The card, the tool stack, the workflow strip and the filter chips are the
 * SAME components the homepage's "AI for Your Work" section draws
 * (components/aiSetups/*), rendering the SAME editorial library
 * (data/aiSetups.ts) against the SAME shared catalogue read. This page composes
 * them at full length; it does not restyle them, and it introduces no card,
 * chip or tone of its own. The header block follows New Launches, which is the
 * established shape for a catalogue-backed page.
 *
 * ── What differs from the homepage section, and why ──────────────────────────
 *
 *   ALL MEANS ALL      the section's "All" chip is a curated six, because it is
 *                      a taster with a link out of it. Here it is all nineteen.
 *                      See `librarySetupsForCategory`.
 *
 *   THE CHIP IS IN     the section filters in component state: it is a browsing
 *   THE URL            aid, not a destination. This is a destination, so a
 *                      filtered view has to be shareable and has to move
 *                      correctly under Back and Forward — the same reasoning
 *                      Browse and New Launches already apply.
 *
 * ── The data path ────────────────────────────────────────────────────────────
 *
 *   WorkflowsPage
 *     ├─ data/aiSetups.ts   19 editorial setups, tools held as slugs only
 *     └─ useToolIndex ─ services/tools.ts ─ GET /api/tools (shared, cached once)
 *
 * The same module-level read Featured, AI for Your Work and New Launches
 * already wait on, so arriving here from the homepage costs no request at all.
 * Filtering is then a pass over nineteen objects with nothing fetched.
 *
 * ── Failure ──────────────────────────────────────────────────────────────────
 *
 * A setup is editorial and reads perfectly well without its tool tiles, so a
 * failed catalogue read degrades the cards rather than becoming the page's
 * problem — exactly as it does in the homepage section. There is deliberately
 * no error panel and no retry button here: unlike New Launches, this page's
 * content is not the catalogue, and a page-level error over nineteen perfectly
 * readable setups would be claiming a failure the reader cannot see.
 */

/** The query parameter carrying the chip, so a filtered library is shareable. */
const CATEGORY_PARAM = 'kind'

export default function WorkflowsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { index, isLoading, failed } = useToolIndex()

  /*
   * The URL is the state, re-derived rather than mirrored into useState, so a
   * pasted link and a Back button take the identical path through the
   * component. A hand-edited `?kind=Bogus` degrades to "All" rather than to an
   * empty page.
   */
  const category = useMemo<SetupCategory | undefined>(() => {
    const raw = searchParams.get(CATEGORY_PARAM)
    return SETUP_CATEGORIES.find((known) => known === raw)
  }, [searchParams])

  const resolved = useMemo(
    () => librarySetupsForCategory(AI_SETUPS, category).map((setup) => resolveSetup(setup, index)),
    [category, index],
  )

  const toolsStatus = isLoading ? 'loading' : index === undefined || failed ? 'unavailable' : 'ready'

  const selectCategory = useCallback(
    (next: SetupCategory | undefined) => {
      const params = new URLSearchParams(searchParams)
      if (next) params.set(CATEGORY_PARAM, next)
      else params.delete(CATEGORY_PARAM)
      setSearchParams(params)
    },
    [searchParams, setSearchParams],
  )

  /*
   * "View Setup" opens the setup's step-by-step guide when one was chosen for
   * it (`setup.automation`, hand-picked — see data/aiSetups.ts). Otherwise it
   * opens the setup in the assistant, which is where a setup becomes a plan
   * you can refine. The rest of this note is about that second path.
   *
   * The assistant lives on the homepage, so the composed sentence travels in
   * router state and useHomeAssistant sends it on arrival, scrolling the stage
   * into view with the same `ask` the hero uses. State rather than a query
   * parameter on purpose: it is a message, not a filter — it should not sit in
   * the address bar, should not be bookmarkable, and must not survive a reload
   * as a turn that sends itself again.
   *
   * The sentence itself comes from the shared `composeSetupRequest`, the same
   * one the homepage card uses, so both surfaces ask the assistant the same
   * question. No recommendation logic runs here: the server grounds every tool
   * it names against the catalogue.
   */
  const openSetup = useCallback(
    (entry: ResolvedSetup) => {
      const guide = entry.setup.automation
      if (guide) {
        navigate(automationPath(guide.niche, guide.slug))
        return
      }
      navigate('/', { state: { assistantMessage: composeSetupRequest(entry) } })
    },
    [navigate],
  )

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
        <p className="text-[11.5px] tracking-[0.2em] text-accent uppercase">Complete AI setups</p>
        <h1 className="mx-auto mt-3 text-[clamp(34px,5vw,52px)] font-bold tracking-[-0.04em] text-balance text-ink">
          Workflows
        </h1>
        <p className="mx-auto mt-[14px] max-w-[58ch] text-[15.5px] leading-[1.65] tracking-[-0.006em] text-pretty text-muted-dim">
          Every setup in one place &mdash; the tools that work together, the order to run them
          in, and the prompts. Pick the kind of work you&rsquo;re doing.
        </p>
      </header>

      <SetupCategoryChips selected={category} onSelect={selectCategory} />

      {/*
       * The section's own grid: `repeat(auto-fit,minmax(336px,1fr))` with the
       * standard `min(336px,100%)` guard on the lower bound, without which a
       * track stays 336px wide inside a narrower container and pushes the page
       * sideways below about a 400px viewport.
       */}
      <div className="mt-[26px] grid grid-cols-[repeat(auto-fit,minmax(min(336px,100%),1fr))] gap-[18px]">
        {resolved.map((entry) => (
          <SetupCard
            key={entry.setup.id}
            resolved={entry}
            toolsStatus={toolsStatus}
            onOpen={openSetup}
          />
        ))}
      </div>
    </section>
  )
}
