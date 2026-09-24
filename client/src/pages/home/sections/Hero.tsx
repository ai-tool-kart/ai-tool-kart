import { useState } from 'react'
import AssistantStage from '@/components/assistant/AssistantStage'
import BuildSetupCard from '@/components/assistant/BuildSetupCard'
import HeroSearch from '@/pages/home/sections/HeroSearch'
import KindTabs from '@/pages/home/sections/KindTabs'
import StatBlock from '@/components/ui/StatBlock'
import TypedWord from '@/components/ui/TypedWord'
import type { HomeAssistant } from '@/pages/home/useHomeAssistant'
import { HERO_INDEX_LINE, HERO_WORD_CHAIN } from '@/data/hero'
import { HERO_STATS } from '@/data/stats'

/*
 * Home hero.
 *
 * Source: AI Tool Kart Site.dc.html, `section[data-screen-label="Hero"]` —
 * kind tabs, index line, the two-line headline whose first line types through
 * Task → Job → Niche → Business → Goal, sub-copy, the search shell, and the
 * proof strip of stat tiles.
 *
 * Between the search and the stats sit the design's two-pane "AI Assistant /
 * Your AI Plan" stage and the "Build Your AI Setup" card. Both are surfaces onto
 * ONE conversation: the search box, the composer inside the chat panel and the
 * "Let's Build" button are three ways into the same POST /api/assistant/chat
 * thread, and a plan built from the setup card has to be refinable by the next
 * message typed in the chat.
 *
 * That session is no longer created here. The "AI for Your Work" cards further
 * down the page are a fourth way into the same thread, so it is owned one level
 * up in pages/home/useHomeAssistant.ts and handed in. Nothing else changed.
 *
 * The headline replaces the first export's "Every AI tool, sorted by …". Every
 * word of copy here is the final design's.
 */

/*
 * With an assistant (Home), the search feeds it and the stage and setup card
 * render below the search. Without one (/mcp-servers), neither renders and the
 * search goes wherever `onSearch` sends it — a page must pick a destination,
 * because a search box that fed no visible answer would be a dead end.
 */
type HeroAssistantProps =
  | {
      /** The page's one assistant conversation. See pages/home/useHomeAssistant.ts. */
      assistant: HomeAssistant
      onSearch?: never
    }
  | {
      assistant?: undefined
      /** Where the search and its task chips go when there is no assistant. */
      onSearch: (query: string) => void
    }

type HeroProps = HeroAssistantProps & {
  /**
   * Overrides for the embedded stage's three labels — "AI Assistant", "Your AI
   * Plan", "Build Your AI Setup" — so a kind other than Home's own "AI
   * Workflows" can brand the identical stage as its own, without a second copy
   * of this component. Home passes none, so its wording is exactly the
   * design's. Ignored without an assistant.
   */
  stageLabels?: {
    chat?: string
    plan?: string
    setup?: string
  }
  /** The headline's second line. Defaults to the design's own wording. */
  headlineSuffix?: string
}

export default function Hero({
  assistant,
  onSearch,
  stageLabels,
  headlineSuffix = 'Get the Best AI for It.',
}: HeroProps) {
  const [task, setTask] = useState<string | undefined>(undefined)

  /* The design hands the hero query straight to the assistant panel. */
  const runTask = (query: string) => {
    if (!assistant) {
      onSearch(query)
      return
    }
    setTask(query)
    assistant.ask(query)
  }

  return (
    <section className="relative z-[1] mx-auto max-w-site px-8 pt-[125px] text-center">
      <KindTabs />

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
          {headlineSuffix}
        </span>
      </h1>

      <p className="mx-auto mt-[26px] max-w-[610px] text-[17px] leading-[1.62] text-pretty text-[#C0B9D9] [animation:akLineIn_1.25s_cubic-bezier(.16,.84,.44,1)_.42s_both]">
        One search gets you everything you need to get it done — the right tools, ready-to-use
        workflows, useful prompts, clear comparisons, and simple step-by-step guidance.
      </p>

      <HeroSearch
        onSubmit={runTask}
        activeTask={task}
        busy={assistant?.session.status === 'thinking'}
      />

      {assistant && (
        <>
          <AssistantStage
            session={assistant.session}
            panelRef={assistant.stageRef}
            chatLabel={stageLabels?.chat}
            planLabel={stageLabels?.plan}
          />

          <BuildSetupCard
            onBuild={(message) => assistant.session.send(message, 'build')}
            onScrollToStage={assistant.revealStage}
            busy={assistant.session.status === 'thinking'}
            {...(stageLabels?.setup ? { label: stageLabels.setup } : {})}
          />
        </>
      )}

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
