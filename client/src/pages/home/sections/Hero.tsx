import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HeroSearch from '@/pages/home/sections/HeroSearch'
import KindTabs from '@/pages/home/sections/KindTabs'
import StatBlock from '@/components/ui/StatBlock'
import TypedWord from '@/components/ui/TypedWord'
import { HERO_INDEX_LINE, HERO_KINDS, HERO_WORD_CHAIN } from '@/data/hero'
import { HERO_STATS } from '@/data/stats'

/*
 * Home hero.
 *
 * Source: AI Tool Kart Site.dc.html, `section[data-screen-label="Hero"]` —
 * kind tabs, index line, the two-line headline whose first line types through
 * Task → Job → Niche → Business → Goal, sub-copy, the search shell, and the
 * proof strip of stat tiles.
 *
 * NOT YET BUILT: between the search and the stats the design places its two-pane
 * "AI Assistant / Your AI Plan" stage and the "Build Your AI Setup" card. Both
 * are conversational surfaces backed by POST /api/assistant/chat, which the
 * server already implements; they arrive in the milestone that wires that
 * endpoint up, so that they ship as the real thing rather than as a mock of it.
 *
 * The headline replaces the first export's "Every AI tool, sorted by …". Every
 * word of copy here is the final design's.
 */

export default function Hero() {
  const navigate = useNavigate()
  const [kind, setKind] = useState(HERO_KINDS[0].label)
  const [task, setTask] = useState<string | undefined>(undefined)

  /*
   * The design hands the query to its assistant panel. Until that panel exists,
   * this keeps the behaviour the app already has: a catalogue search, with the
   * query in the URL so the result is shareable and survives a reload.
   */
  function runTask(query: string) {
    setTask(query)
    navigate(`/browse?q=${encodeURIComponent(query)}`)
  }

  return (
    <section className="relative z-[1] mx-auto max-w-site px-8 pt-[125px] text-center">
      <KindTabs value={kind} onChange={setKind} />

      <div className="inline-flex items-center gap-[11px] text-[13.5px] tracking-[-0.005em] text-[#B3ACC8] [animation:akFade_1.2s_cubic-bezier(.16,.84,.44,1)_both]">
        <span
          aria-hidden="true"
          className="h-[9px] w-[9px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#F0E6FF,#9C5CF6_70%)] shadow-[0_0_14px_3px_rgba(156,92,246,0.85),0_0_32px_8px_rgba(156,92,246,0.35)] [animation:akPulse_3s_ease-in-out_infinite]"
        />
        {HERO_INDEX_LINE}
      </div>

      <h1 className="mx-auto mt-[30px] max-w-[1030px] pb-[10px] text-hero font-bold text-balance text-ink-bright">
        <span className="block [animation:akLineIn_1.25s_cubic-bezier(.16,.84,.44,1)_.1s_both]">
          Search Any{' '}
          <span className="whitespace-nowrap">
            <TypedWord
              words={HERO_WORD_CHAIN}
              className="bg-[linear-gradient(96deg,#FFFFFF_0%,#EADCFF_30%,#BE9CFF_62%,#FFFFFF_100%)] bg-[length:230%_100%] bg-clip-text text-transparent drop-shadow-[0_0_26px_rgba(167,139,250,0.34)] [animation:akGradient_30s_ease-in-out_infinite]"
            />
            <span
              aria-hidden="true"
              className="mx-[0.06em] inline-block h-[0.7em] w-[0.055em] rounded-[2px] bg-[linear-gradient(180deg,#F2E9FF,#8B5CF6)] shadow-[0_0_22px_rgba(167,139,250,0.85)] [animation:akCaret_1.05s_steps(1,end)_infinite]"
            />
            .
          </span>
        </span>
        <span className="block [animation:akLineIn_1.25s_cubic-bezier(.16,.84,.44,1)_.26s_both]">
          Get the Best AI for It.
        </span>
      </h1>

      <p className="mx-auto mt-[26px] max-w-[610px] text-[17px] leading-[1.62] text-pretty text-[#C0B9D9] [animation:akLineIn_1.25s_cubic-bezier(.16,.84,.44,1)_.42s_both]">
        One search gets you everything you need to get it done — the right tools, ready-to-use
        workflows, useful prompts, clear comparisons, and simple step-by-step guidance.
      </p>

      <HeroSearch onSubmit={runTask} activeTask={task} />

      <div data-reveal="0" className="mt-[65px]">
        <div className="flex items-center gap-[22px]">
          <div className="h-px flex-auto bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.16)_100%)]" />
          <div className="text-[11px] tracking-[0.22em] whitespace-nowrap text-white uppercase">
            Independent · tested · dated
          </div>
          <div className="h-px flex-auto bg-[linear-gradient(90deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_100%)]" />
        </div>
        <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4 text-left">
          {HERO_STATS.map((stat) => (
            <StatBlock key={stat.label} value={stat.value} label={stat.label} />
          ))}
        </div>
      </div>
    </section>
  )
}
