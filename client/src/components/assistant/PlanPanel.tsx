import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PlanIdleState from '@/components/assistant/PlanIdleState'
import PlanSection from '@/components/assistant/PlanSection'
import {
  PlanAgents,
  PlanNote,
  PlanSteps,
  PlanTools,
  PlanWorkflow,
} from '@/components/assistant/PlanBodies'
import { PLAN_SECTIONS } from '@/data/assistant'
import type { AssistantSession } from '@/hooks/useAssistant'
import type { AssistantPlan } from '@/types/assistant'

/*
 * The right half of the stage: "Your AI Plan".
 *
 * Source: AI Tool Kart Site.dc.html, the panel beside `[data-panel]`. Six
 * sections in a fixed order, each filling in behind a tick, and an idle state
 * that shows what is coming before anything is asked.
 *
 * ── Progressive reveal, against a real request ───────────────────────────────
 *
 * The prototype had no server, so it faked generation: `runPlan()` stepped a
 * counter 0→6 on a 240ms cadence and each section "arrived" on its own. A real
 * turn returns all six at once, roughly a second later.
 *
 * Deleting the cadence would make the panel snap, which loses the design's whole
 * point — the right window visibly answering the left one. Faking it in the
 * other direction, by dribbling out content we already hold, would be theatre.
 * So the timing is kept and re-pointed at the truth: while the request is in
 * flight every section is a shimmering skeleton, and the moment the plan lands
 * the same 200ms + 240ms/section stagger reveals what actually arrived. The
 * animation now describes rendering rather than pretending to describe work.
 *
 * ── Why the panel is capped at the chat panel's height ───────────────────
 *
 * The design sets `overflow-y: auto` here but no height, which worked only
 * because its scripted plan was short. A real plan — five tools, five numbered
 * steps — is taller than the 474px chat panel beside it, and in a stretch row
 * the tallest item sets the row height: the panel grew the whole glass shell
 * instead of scrolling, pushing the page down by ~250px. Capping at 474px is
 * what makes the design's own `overflow-y: auto` mean something.
 */

const SECTION_COUNT = PLAN_SECTIONS.length
/** The design's `runPlan()` cadence, kept exactly. */
const REVEAL_DELAY_MS = 200
const REVEAL_STEP_MS = 240

/**
 * Reveals sections one at a time once `plan` is present.
 *
 * Resets to zero whenever a new request starts, so a refined plan re-fills the
 * panel rather than mutating in place — the design's behaviour on every turn.
 */
function usePlanReveal(plan: AssistantPlan | undefined, busy: boolean): number {
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    if (busy || !plan) {
      setRevealed(0)
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(SECTION_COUNT)
      return
    }

    setRevealed(0)
    const timers = Array.from({ length: SECTION_COUNT }, (_unused, index) =>
      window.setTimeout(() => setRevealed(index + 1), REVEAL_DELAY_MS + index * REVEAL_STEP_MS),
    )
    return () => timers.forEach(window.clearTimeout)
  }, [plan, busy])

  return revealed
}

/** Mirrors the design's `planStatus`, extended for the two states it lacked. */
function statusLabel(session: AssistantSession, complete: boolean): string {
  if (session.status === 'thinking') return 'Generating'
  if (session.status === 'error') return 'Paused'
  if (session.plan) return complete ? 'Ready to run' : 'Generating'
  if (session.hasStarted) return 'Needs a little more'
  return 'Ready when you are'
}

interface PlanPanelProps {
  session: AssistantSession
}

export default function PlanPanel({ session }: PlanPanelProps) {
  const navigate = useNavigate()
  const busy = session.status === 'thinking'
  const revealed = usePlanReveal(session.plan, busy)
  const plan = session.plan
  const complete = Boolean(plan) && revealed >= SECTION_COUNT

  /* The design's chips all lead to the catalogue. Browse is the only surface
     that can receive them today; tool pages arrive with the catalogue migration. */
  const search = (query: string) => navigate(`/browse?q=${encodeURIComponent(query)}`)

  const bodyFor = (key: (typeof PLAN_SECTIONS)[number]['key']) => {
    if (!plan) return null
    switch (key) {
      case 'tools':
        return <PlanTools tools={plan.tools} onOpenTool={(tool) => search(tool.name)} />
      case 'agents':
        return <PlanAgents agents={plan.agents} onSearch={search} />
      case 'workflow':
        return <PlanWorkflow workflow={plan.workflow} />
      case 'prompts':
        return <PlanNote text={plan.prompts} />
      case 'comparison':
        return <PlanNote text={plan.comparison} />
      case 'steps':
        return <PlanSteps steps={plan.steps} />
    }
  }

  return (
    <section
      aria-label="Your AI Plan"
      className="relative flex max-h-[474px] min-w-[min(100%,300px)] flex-[1_1_330px] flex-col gap-[10px] overflow-y-auto rounded-card-lg border border-[rgba(178,150,255,0.13)] bg-[linear-gradient(168deg,rgba(124,88,244,0.12)_0%,rgba(255,255,255,0.03)_46%,rgba(255,255,255,0.012)_100%)] p-[15px] shadow-[inset_0_1px_0_rgba(232,222,255,0.15),0_20px_44px_-46px_rgba(124,88,244,0.6)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[40%] left-[10%] h-px bg-[linear-gradient(90deg,transparent,rgba(196,168,255,0.6),transparent)]"
      />

      <div className="flex items-center gap-[10px]">
        <h2 className="text-[11.5px] tracking-[0.18em] text-[#C6B2FF] uppercase">Your AI Plan</h2>
        <div className="ml-auto inline-flex items-center gap-[7px] text-[11.5px] whitespace-nowrap text-[#8A83A6]">
          {busy && (
            <span
              aria-hidden="true"
              className="h-[11px] w-[11px] rounded-full border-[1.6px] border-[rgba(196,168,255,0.3)] border-t-[#C8AEFF] [animation:akSpin_.8s_linear_infinite]"
            />
          )}
          {statusLabel(session, complete)}
        </div>
      </div>

      {/*
       * The API names the plan and the design has no slot for it, so it goes
       * directly under the heading it titles. Dropping it would throw away the
       * one line that says what the six sections below are collectively FOR.
       */}
      {plan && revealed > 0 && (
        <p className="text-[13px] leading-[1.45] font-medium tracking-[-0.01em] text-pretty text-[#D3CCE6] [animation:akFade_.4s_ease_both]">
          {plan.title}
        </p>
      )}

      {!session.hasStarted ? (
        <PlanIdleState />
      ) : (
        <div className="flex flex-col gap-2 [animation:akFade_.4s_ease_both]">
          {PLAN_SECTIONS.map((section, index) => (
            <PlanSection
              key={section.key}
              label={section.label}
              icon={section.icon}
              done={revealed > index}
              animated={busy}
            >
              {bodyFor(section.key)}
            </PlanSection>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => search(session.understood?.goal ?? plan?.title ?? '')}
        disabled={!complete}
        className={`mt-auto inline-flex cursor-pointer items-center gap-2 self-start rounded-pill border px-[15px] py-[9px] text-[12.5px] font-semibold transition-[color,border-color,background-color] duration-300 ${
          complete
            ? 'border-[rgba(178,150,255,0.5)] bg-[rgba(124,88,244,0.2)] text-[#F1EAFF] hover:border-[rgba(196,168,255,0.6)] hover:text-white'
            : 'cursor-default border-white/[0.09] bg-white/[0.03] text-[#7E7899]'
        }`}
      >
        Open the full plan
        <span aria-hidden="true" className="text-[14px]">
          →
        </span>
      </button>
    </section>
  )
}
