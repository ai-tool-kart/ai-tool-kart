import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AutomationResultSkeleton } from '@/components/automations/AutomationResultCard'
import { StatePanel } from '@/components/catalogue/BrowseStates'
import WorkflowCard from '@/components/workflows/WorkflowCard'
import WorkflowNicheChips from '@/components/workflows/WorkflowNicheChips'
import { useHomeAutomations } from '@/hooks/useAutomations'
import { useToolIndex } from '@/hooks/useToolIndex'
import { isNiche, type AutomationCard, type NicheName } from '@/types/automation'

/*
 * "AI for Your Work" — the homepage's taster of the workflow library.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="AI for your work"`. It
 * follows Popular Ways in the final design, and does so here.
 *
 * ── The data path ────────────────────────────────────────────────────────────
 *
 *   AiForYourWorkSection
 *     ├─ useHomeAutomations ─ services/automations.ts ─ GET /api/automations/home
 *     └─ useToolIndex ─ services/tools.ts ─ GET /api/tools (paged, cached once)
 *
 * The same guide records /workflows lists, through the same repository — no
 * copy of them lives in the client. Which niches appear, in what order, how
 * many guides each, and how they are ranked are all the server's
 * (config/limits.ts HOME_WORKFLOWS, automations/home.ts). Nothing here names a
 * niche or a guide.
 *
 * The tool index only draws matched tools' own monograms on the cards, and is
 * the read the homepage already makes — not a second catalogue request.
 *
 * ── Filtering ────────────────────────────────────────────────────────────────
 *
 * One request when the section mounts; the response holds "All" and every
 * offered niche, so a chip is a lookup in memory — no request, no URL, no
 * history entry. This is a browsing aid on the homepage; /workflows is the
 * shareable, filterable destination, and both CTAs below lead there.
 *
 * ── Where a card goes ────────────────────────────────────────────────────────
 *
 * Every card is a WorkflowCard: a real link to its guide at
 * /automations/:niche/:slug. None of them opens the assistant.
 *
 * ── Failure ──────────────────────────────────────────────────────────────────
 *
 * If the selection cannot be read the section shows the site's error panel with
 * a retry, inside its own bounds — the rest of the homepage is unaffected. If
 * the catalogue cannot be read, the cards keep everything but their monograms.
 */

/**
 * Placeholder cards while loading. Sized to the server's per-niche count
 * (HOME_WORKFLOWS.perNiche) so the grid does not reflow when the cards land;
 * it decides nothing about how many cards are shown.
 */
const SKELETON_CARDS = 6

/* The section's own centred wrap, as the setup chips were drawn before. */
const CHIP_ROW = 'mt-7 flex flex-wrap justify-center gap-2'

const CTA =
  'inline-flex items-center gap-[9px] rounded-pill border border-[rgba(178,150,255,0.28)] bg-[rgba(124,90,246,0.12)] px-[22px] py-[11px] text-[14px] font-semibold text-[#D3C4FF] transition-[border-color,background,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[2px] hover:border-[rgba(196,168,255,0.5)] hover:bg-[rgba(124,90,246,0.2)] hover:text-[#D3C4FF]'

export default function AiForYourWorkSection() {
  /* `undefined` is "All", the default. */
  const [niche, setNiche] = useState<NicheName | undefined>(undefined)
  const home = useHomeAutomations()
  const { index: toolIndex, isLoading: toolsLoading, failed: toolsFailed } = useToolIndex()
  const toolsStatus = toolsLoading ? 'loading' : toolIndex === undefined || toolsFailed ? 'unavailable' : 'ready'

  /* Only niches the client knows — the same guard /workflows applies to its URL. */
  const niches = useMemo(
    () => (home.data?.niches ?? []).filter((group) => isNiche(group.niche)),
    [home.data],
  )
  const nicheNames = useMemo(() => niches.map((group) => group.niche as NicheName), [niches])

  /* A niche only ever shows its own guides; a niche not returned shows none. */
  const cards: AutomationCard[] =
    niche === undefined
      ? (home.data?.all.items ?? [])
      : (niches.find((group) => group.niche === niche)?.items ?? [])

  return (
    <section className="relative pt-[92px] pb-[88px]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(19,14,36,0)_0%,rgba(19,14,36,0.8)_14%,rgba(19,14,36,0.8)_86%,rgba(19,14,36,0)_100%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[6%] left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.09),transparent)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] bottom-0 left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.055),transparent)]"
      />
      {/* The violet bloom the design floats behind the heading. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[20%] left-1/2 h-[300px] w-[min(820px,90%)] -translate-x-1/2 bg-[radial-gradient(55%_55%_at_50%_50%,rgba(124,88,244,0.13)_0%,transparent_72%)] blur-[30px]"
      />

      <div className="relative mx-auto max-w-site px-8">
        <div data-reveal="0" className="text-center">
          <div className="text-[11.5px] tracking-[0.2em] text-accent uppercase">
            Complete AI setups
          </div>
          <h2 className="mx-auto mt-3 text-[clamp(30px,3.2vw,40px)] leading-[1.08] font-bold tracking-[-0.032em] text-pretty text-ink">
            AI for Your Work
          </h2>
          <p className="mx-auto mt-[14px] max-w-[58ch] text-[15px] leading-[1.62] tracking-[-0.006em] text-pretty text-muted-dim">
            Pick the kind of work you&rsquo;re doing. Every card is a whole setup &mdash; the
            tools that work together, the order to run them in, and the prompts.
          </p>
        </div>

        <WorkflowNicheChips
          selected={niche}
          onSelect={setNiche}
          niches={nicheNames}
          className={CHIP_ROW}
          label="Filter setups by kind of work"
        />

        {/*
         * The design's `repeat(auto-fit,minmax(336px,1fr))`, with the standard
         * `min(336px,100%)` guard on the lower bound. Without it a track stays
         * 336px wide inside a narrower container and pushes the page sideways —
         * which it does below about a 400px viewport.
         */}
        <div className="mt-[26px]">
          {home.isLoading ? (
            <AutomationResultSkeleton count={SKELETON_CARDS} />
          ) : home.error ? (
            <StatePanel
              role="alert"
              title="Setups could not be loaded"
              detail={home.error}
              action={{ label: 'Try again', onClick: home.retry }}
            />
          ) : cards.length === 0 ? (
            <StatePanel
              role="status"
              title="No setups here yet"
              detail="Choose another kind of work, or browse every workflow."
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(336px,100%),1fr))] gap-[18px]">
              {cards.map((automation, position) => (
                <WorkflowCard
                  key={`${automation.niche}/${automation.slug}`}
                  automation={automation}
                  position={position}
                  toolIndex={toolIndex}
                  toolsStatus={toolsStatus}
                />
              ))}
            </div>
          )}
        </div>

        <div data-reveal="0" className="mt-[30px] flex flex-wrap justify-center gap-3">
          <Link to="/workflows#niches" className={CTA}>
            Explore all niches
            <span aria-hidden="true" className="text-[15px]">
              →
            </span>
          </Link>
          <Link to="/workflows" className={CTA}>
            Browse all setups
            <span aria-hidden="true" className="text-[15px]">
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}
