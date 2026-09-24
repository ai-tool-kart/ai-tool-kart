import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SetupCard from '@/components/aiSetups/SetupCard'
import SetupCategoryChips from '@/components/aiSetups/SetupCategoryChips'
import { AI_SETUPS } from '@/data/aiSetups'
import { useToolIndex } from '@/hooks/useToolIndex'
import type { ResolvedSetup, SetupCategory } from '@/types/aiSetup'
import type { AssistantRequestSource } from '@/types/assistant'
import { composeSetupRequest, resolveSetup, setupsForCategory } from '@/utils/aiSetups'

/*
 * "AI for Your Work" — the homepage's setup library.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="AI for your work"`. It
 * follows Popular Ways in the final design, and does so here.
 *
 * Where Popular Ways asks "what outcome do you want" and answers with a filtered
 * shelf, this section answers with a whole SETUP: several catalogue tools, in an
 * order, with the prompts to run them. That is why the card is not the Browse
 * tool card and is not a variant of it.
 *
 * ── The data path ────────────────────────────────────────────────────────────
 *
 *   AiForYourWorkSection
 *     ├─ data/aiSetups.ts   19 editorial setups, tools held as slugs only
 *     └─ useToolIndex ─ services/tools.ts ─ GET /api/tools (paged, cached once)
 *
 * One read of the catalogue for the whole section — not one request per tool,
 * and not a fresh request per chip. Every name, monogram and tool count on
 * screen comes from a live record; everything else is editorial.
 *
 * ── Filtering ────────────────────────────────────────────────────────────────
 *
 * Local state, no URL and no network. Deliberate: this is a homepage browsing
 * aid rather than a destination, and it filters a list already in memory, so
 * neither a request nor a history entry is warranted. Browse remains the
 * shareable, back/forward-correct surface. /workflows, which is the same library
 * at full length, does put its chip in the URL — it is a destination, so a
 * filtered view there has to be shareable. Same components, different job.
 *
 * ── Where "View Setup" goes, and why it goes there ───────────────────────────
 *
 * Into the assistant, on this page — and NOT to /workflows, even though that
 * route now exists. This section's reader is already looking at the assistant
 * further up the same page; sending them to the library to come back again
 * would be a detour past the thing they wanted. /workflows makes the opposite
 * call for the same reason: it has no assistant of its own, so its cards
 * navigate here carrying the request.
 *
 * So the card composes one plain-English request out of the setup and its
 * resolved tools and sends it into the page's existing conversation, then scrolls
 * the answer into view. That is precisely what the design's own "Let's Build"
 * button does (components/assistant/BuildSetupCard.tsx), it reuses the one
 * assistant rather than adding a second, and the reply is grounded server-side
 * against the same catalogue the card's tiles came from.
 *
 * A setup DETAIL view is still unbuilt. When it arrives this becomes a
 * <Link to={`/setups/${id}`}> and `composeSetupRequest` moves to that page's
 * "ask the assistant" action — the setup type already carries a stable `id`.
 *
 * ── Failure ──────────────────────────────────────────────────────────────────
 *
 * If the catalogue cannot be read the cards keep their titles, descriptions,
 * workflow strips, badges, prompt counts and their CTA; they lose their tiles,
 * their name line and their tool count. Nothing about the homepage breaks and no
 * error is shown, because the section is still doing most of its job.
 */

interface AiForYourWorkSectionProps {
  /** Sends a turn to the page's assistant and scrolls its answer into view. */
  onAskAssistant: (message: string, source: AssistantRequestSource) => void
}

export default function AiForYourWorkSection({ onAskAssistant }: AiForYourWorkSectionProps) {
  const [category, setCategory] = useState<SetupCategory | undefined>(undefined)
  const { index, isLoading, failed } = useToolIndex()

  /*
   * `index` is a stable reference for the life of the page (one shared read), so
   * this recomputes only when the chip changes — filtering is a pass over 19
   * objects and a handful of map lookups, with nothing fetched or mutated.
   */
  const resolved = useMemo(
    () => setupsForCategory(AI_SETUPS, category).map((setup) => resolveSetup(setup, index)),
    [category, index],
  )

  const toolsStatus = isLoading ? 'loading' : index === undefined || failed ? 'unavailable' : 'ready'

  const openSetup = useCallback(
    (entry: ResolvedSetup) => onAskAssistant(composeSetupRequest(entry), 'setup'),
    [onAskAssistant],
  )

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

        <SetupCategoryChips selected={category} onSelect={setCategory} />

        {/*
         * The design's `repeat(auto-fit,minmax(336px,1fr))`, with the standard
         * `min(336px,100%)` guard on the lower bound. Without it a track stays
         * 336px wide inside a narrower container and pushes the page sideways —
         * which it does below about a 400px viewport.
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

        <div data-reveal="0" className="mt-[30px] flex justify-center">
          <Link
            to="/browse"
            className="inline-flex items-center gap-[9px] rounded-pill border border-[rgba(178,150,255,0.28)] bg-[rgba(124,90,246,0.12)] px-[22px] py-[11px] text-[14px] font-semibold text-[#D3C4FF] transition-[border-color,background,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[2px] hover:border-[rgba(196,168,255,0.5)] hover:bg-[rgba(124,90,246,0.2)] hover:text-[#D3C4FF]"
          >
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
