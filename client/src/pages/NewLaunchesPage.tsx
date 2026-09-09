import { useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BrowseErrorState } from '@/components/catalogue/BrowseStates'
import CatalogueToolCard from '@/components/catalogue/CatalogueToolCard'
import LaunchChipRow, { type LaunchChip } from '@/components/launches/LaunchChipRow'
import LaunchGroupHeading, {
  LAUNCH_GRID_CLASS,
} from '@/components/launches/LaunchGroupHeading'
import LaunchHeroCard from '@/components/launches/LaunchHeroCard'
import NewLaunchesSkeleton from '@/components/launches/NewLaunchesSkeleton'
import { useTaxonomy } from '@/hooks/useTaxonomy'
import { useToolIndex } from '@/hooks/useToolIndex'
import type { Tool, ToolCategoryName } from '@/types/tool'
import { countAddedThisWeek, formatAddedLabel, groupLaunchesByDate } from '@/utils/launchDates'
import { sortByRecency } from '@/utils/recency'

/*
 * /new-launches — the catalogue in the order it arrived.
 *
 * Source: AI Tool Kart Site.dc.html, `sc-if isLaunches`: the header with its
 * live count pill, the newest tool as a hero, the category chip rail, then
 * cards under date headings.
 *
 * ── One read, and the same one the homepage uses ─────────────────────────────
 *
 *   NewLaunchesPage
 *     └─ useToolIndex ─ services/tools.ts ─ GET /api/tools (shared, cached once)
 *
 * The SAME module-level read that Featured, AI for Your Work and the homepage's
 * Recently Added rail already wait on, ordered by the SAME `sortByRecency`. That
 * is not an optimisation, it is the correctness argument: this page and that
 * rail are two views of one chronology, and giving them separate queries would
 * be two definitions of "newest" that could disagree. Navigating here from the
 * homepage costs no request at all.
 *
 * Filtering and grouping then happen over the array the page already holds — no
 * request per chip, no request per category, no per-tool lookups.
 *
 * ── What is NOT reused ───────────────────────────────────────────────────────
 *
 * `useTools` is Browse's hook: server-side query, filter and pagination against
 * the API. It is the right tool for Browse and the wrong one here, because this
 * page needs the whole catalogue in date order to group it and to count each
 * category honestly — both of which are properties of the complete set, not of
 * a page of it.
 *
 * Taxonomy is read only to know which category names exist, so a hand-edited
 * `?cat=` can be rejected against the catalogue's own vocabulary rather than a
 * hardcoded list.
 */

/** Chip order follows the catalogue's own taxonomy order, after "All". */
function buildChips(launches: Tool[], categories: ToolCategoryName[]): LaunchChip[] {
  const counts = new Map<ToolCategoryName, number>()
  for (const tool of launches) counts.set(tool.cat, (counts.get(tool.cat) ?? 0) + 1)

  return [
    { label: 'All', count: launches.length },
    /*
     * A category with no launches is dropped rather than shown as "Video 0".
     * The design has no zero chips because its list covered every category it
     * listed; a chip that leads to the empty state is a dead end the reader has
     * to discover by clicking.
     */
    ...categories
      .filter((category) => (counts.get(category) ?? 0) > 0)
      .map((category) => ({
        category,
        label: category,
        count: counts.get(category) ?? 0,
      })),
  ]
}

export default function NewLaunchesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { index, isLoading, failed, retry } = useToolIndex()
  const taxonomy = useTaxonomy()

  /*
   * One timestamp for the whole render.
   *
   * Held in a ref rather than recomputed, so a re-render caused by choosing a
   * chip cannot move the day boundary underneath the groups — a card must not
   * slide from "Today" to "Yesterday" because the reader clicked something at
   * midnight.
   */
  const nowRef = useRef(Date.now())
  const now = nowRef.current

  /** The whole catalogue, newest first. Undated records are dropped. */
  const launches = useMemo(
    () => (index ? sortByRecency(index.values()) : []),
    [index],
  )

  /* Stable identity, so the memos below key off the taxonomy landing rather
     than off a fresh `[]` allocated on every render. */
  const categories = useMemo<ToolCategoryName[]>(
    () => taxonomy.data?.categories ?? [],
    [taxonomy.data],
  )

  /*
   * The selected category, validated against the taxonomy. A hand-edited
   * `?cat=Bogus` degrades to "All" rather than to an empty page, and a repeated
   * `cat` takes the first that is real — this page's chips are single-select by
   * design, but the parameter name is Browse's so a URL carries between them.
   */
  const selected = useMemo(() => {
    if (categories.length === 0) return undefined
    return searchParams
      .getAll('cat')
      .find((value): value is ToolCategoryName =>
        (categories as string[]).includes(value),
      )
  }, [searchParams, categories])

  const filtered = useMemo(
    () => (selected ? launches.filter((tool) => tool.cat === selected) : launches),
    [launches, selected],
  )

  const chips = useMemo(() => buildChips(launches, categories), [launches, categories])
  const weekCount = useMemo(() => countAddedThisWeek(launches, now), [launches, now])

  /*
   * The newest match is the hero; everything after it is grouped below. Slicing
   * before grouping is what stops the hero appearing twice — the handoff does
   * not repeat it, and a duplicate card directly under the panel showing the
   * same tool reads as a rendering bug.
   *
   * Both come out of one memo: destructuring `filtered` in the render body
   * would allocate a fresh tail array every time and the grouping memo below it
   * would never hit, re-bucketing 66 records on every pointer move.
   */
  const { hero, groups } = useMemo(() => {
    const [first, ...rest] = filtered
    return { hero: first, groups: groupLaunchesByDate(rest, now) }
  }, [filtered, now])

  const selectCategory = useCallback(
    (category?: ToolCategoryName) => {
      const next = new URLSearchParams(searchParams)
      next.delete('cat')
      if (category) next.append('cat', category)
      setSearchParams(next)
    },
    [searchParams, setSearchParams],
  )

  /* One outage fails both endpoints, so one button revives both. */
  const retryAll = useCallback(() => {
    if (taxonomy.failed) taxonomy.retry()
    retry()
  }, [taxonomy, retry])

  const compare = useCallback(
    (tool: Tool) => navigate(`/compare?tool=${encodeURIComponent(tool.slug)}`),
    [navigate],
  )

  const showSkeleton = isLoading || (taxonomy.isLoading && !failed)
  /* A failed read knows nothing about the catalogue's size, so "0 this week"
     would be a false claim about it. The pill falls back to an em dash. */
  const countKnown = !showSkeleton && !failed

  return (
    <section className="relative mx-auto max-w-site px-8 pt-16">
      {/* The two drifting mesh glows the design puts behind this screen. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[2%] left-[-14%] h-[540px] w-[56%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(124,88,244,0.2)_0%,rgba(96,52,210,0.06)_48%,transparent_76%)] blur-[48px] [animation:akMeshA_74s_cubic-bezier(.45,0,.55,1)_infinite]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[34%] right-[-16%] h-[620px] w-[52%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(154,110,255,0.15)_0%,rgba(202,168,255,0.05)_46%,transparent_74%)] blur-[54px] [animation:akMeshB_92s_cubic-bezier(.45,0,.55,1)_infinite]"
      />

      <header className="relative flex flex-wrap items-end justify-between gap-7">
        <div>
          <p className="text-[11.5px] tracking-[0.2em] text-accent uppercase">What&rsquo;s new</p>
          <h1 className="mt-3 text-[clamp(34px,5vw,52px)] font-bold tracking-[-0.04em] text-ink">
            New launches
          </h1>
          <p className="mt-[14px] max-w-[54ch] text-[15.5px] leading-[1.65] tracking-[-0.006em] text-pretty text-muted-dim">
            Everything just added to the catalog, newest first — each one run through the same
            test brief before it lands here.
          </p>
        </div>
        {/* The design hardcodes its count; this is the real number of tools
            whose intake date falls inside the last seven days. */}
        <div className="inline-flex items-center gap-[9px] rounded-pill border border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.022)_100%)] px-4 py-[10px] shadow-[inset_0_1px_0_rgba(224,212,255,0.18)]">
          <span
            aria-hidden="true"
            className="h-[6px] w-[6px] rounded-full bg-[#9BE7C4] shadow-[0_0_9px_2px_rgba(120,220,170,0.6)] [animation:akPulse_3s_ease-in-out_infinite]"
          />
          <span className="text-[13.5px] font-semibold text-[#E4DEF5]">
            {countKnown ? `${weekCount} added this week` : '— added this week'}
          </span>
        </div>
      </header>

      {showSkeleton && <NewLaunchesSkeleton />}

      {!showSkeleton && failed && (
        <div className="relative mt-[34px]">
          <BrowseErrorState
            message="The catalogue did not respond, so there is nothing to date. Check the API and try again."
            onRetry={retryAll}
          />
        </div>
      )}

      {!showSkeleton && !failed && launches.length === 0 && (
        <div className="relative mt-[34px]">
          <EmptyPanel
            title="No launches recorded yet"
            detail="The catalogue has no dated intakes. New tools appear here the day they are listed."
          />
        </div>
      )}

      {!showSkeleton && !failed && launches.length > 0 && (
        <>
          {hero && <LaunchHeroCard tool={hero} now={now} />}

          <LaunchChipRow chips={chips} selected={selected} onSelect={selectCategory} />

          {groups.map((group) => (
            <section key={group.key} className="relative mt-[38px]">
              <LaunchGroupHeading label={group.label} count={group.tools.length} />
              <div className={`mt-5 ${LAUNCH_GRID_CLASS}`}>
                {group.tools.map((tool, position) => (
                  <CatalogueToolCard
                    key={tool.id}
                    tool={tool}
                    index={position}
                    onCompare={compare}
                    meta={<AddedMeta tool={tool} now={now} />}
                  />
                ))}
              </div>
            </section>
          ))}

          {/*
           * A category whose only launch became the hero leaves no groups. That
           * is not an empty result — the reader can see the tool — so it gets
           * no panel; the empty panel below is for a category with nothing at
           * all, which the chips make unreachable but a typed URL does not.
           */}
          {!hero && (
            <div className="relative mt-8">
              <EmptyPanel
                title="Nothing new in that category yet"
                detail="Check back tomorrow, or look at everything added this week."
                action={{ label: 'Show all launches', onClick: () => selectCategory(undefined) }}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** "Added 4 days ago" — the one line a launch card says that a Browse card does not. */
function AddedMeta({ tool, now }: { tool: Tool; now: number }) {
  const added = formatAddedLabel(tool, now)
  if (!added) return null

  return (
    <span className="inline-flex min-w-0 items-center gap-[5px] truncate text-[12px] text-[#615C7A]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        aria-hidden="true"
        className="h-[11px] w-[11px] flex-none"
      >
        <circle cx="12" cy="12" r="8.4" />
        <path d="M12 7.8V12l3 1.8" />
      </svg>
      Added {added}
    </span>
  )
}

/*
 * The design's dashed empty panel.
 *
 * Not reusing BrowseStates' `BrowseEmptyState`: that one carries Browse's own
 * copy ("Nothing matches those filters" / "Reset filters"), which is the wrong
 * sentence for a chronology. It shares the shape, not the words.
 */
function EmptyPanel({
  title,
  detail,
  action,
}: {
  title: string
  detail: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div
      role="status"
      className="rounded-panel border border-dashed border-white/[0.13] bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.016)_100%)] px-6 py-16 text-center"
    >
      <p className="text-[20px] font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-[10px] max-w-[52ch] text-[14.5px] leading-[1.55] text-pretty text-muted-dim">
        {detail}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 inline-flex h-[46px] cursor-pointer items-center gap-2 rounded-pill border border-white/[0.22] bg-[linear-gradient(180deg,#B08CFF_0%,#8858F2_48%,#6A32DC_100%)] px-[22px] text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_16px_32px_-14px_rgba(124,88,244,0.95)] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
