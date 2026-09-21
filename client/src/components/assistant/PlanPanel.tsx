import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PlanIdleState from '@/components/assistant/PlanIdleState'
import { PlanSteps } from '@/components/assistant/PlanBodies'
import type { AssistantSession } from '@/hooks/useAssistant'
import type { AssistantPlan } from '@/types/assistant'

/*
 * The right half of the stage: "Your AI Plan".
 *
 * Source: AI Tool Kart Site.dc.html, the panel beside `[data-panel]`. The
 * design showed six ticked sections (Tools, Agents, Workflow, Prompts,
 * Comparison, Steps); the plan itself is simpler now — a goal line and a short
 * list of steps, each with one tool — so this panel shows exactly that and
 * nothing more. There is no "done" tick to show, because there is no
 * multi-section reveal left to mark complete.
 *
 * ── Progressive reveal, against a real request ───────────────────────────────
 *
 * The prototype had no server, so it faked generation: `runPlan()` stepped a
 * counter on a 240ms cadence and each section "arrived" on its own. A real
 * turn returns every step at once, roughly a second later.
 *
 * Deleting the cadence would make the panel snap, which loses the design's
 * whole point — the right window visibly answering the left one. So the
 * timing is kept and re-pointed at the truth: while the request is in flight
 * the panel shows a shimmering skeleton, and the moment the plan lands its
 * steps reveal one at a time on the same 200ms + 240ms/step stagger. The
 * animation now describes rendering rather than pretending to describe work.
 *
 * ── Why the panel is capped at the chat panel's height ───────────────────
 *
 * The design sets `overflow-y: auto` here but no height, which worked only
 * because its scripted plan was short. A real plan — several tools, several
 * steps — can be taller than the 474px chat panel beside it, and in a stretch
 * row the tallest item sets the row height: the panel grew the whole glass
 * shell instead of scrolling, pushing the page down. Capping at 474px is what
 * makes the design's own `overflow-y: auto` mean something.
 */

/** The design's `runPlan()` cadence, kept exactly. */
const REVEAL_DELAY_MS = 200
const REVEAL_STEP_MS = 240

/**
 * Reveals steps one at a time once `plan` is present.
 *
 * Resets to zero whenever a new request starts, so a refined plan re-fills the
 * panel rather than mutating in place — the design's behaviour on every turn.
 */
function usePlanReveal(plan: AssistantPlan | undefined, busy: boolean): number {
  const [revealed, setRevealed] = useState(0)
  const stepCount = plan?.steps.length ?? 0

  useEffect(() => {
    if (busy || stepCount === 0) {
      setRevealed(0)
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(stepCount)
      return
    }

    setRevealed(0)
    const timers = Array.from({ length: stepCount }, (_unused, index) =>
      window.setTimeout(() => setRevealed(index + 1), REVEAL_DELAY_MS + index * REVEAL_STEP_MS),
    )
    return () => timers.forEach(window.clearTimeout)
  }, [plan, busy, stepCount])

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
  /** Panel title, and its aria-label. Defaults to the design's own wording. */
  label?: string
}

export default function PlanPanel({ session, label = 'Your AI Plan' }: PlanPanelProps) {
  const navigate = useNavigate()
  const busy = session.status === 'thinking'
  const plan = session.plan
  const revealed = usePlanReveal(plan, busy)
  const stepCount = plan?.steps.length ?? 0
  const complete = Boolean(plan) && revealed >= stepCount && stepCount > 0

  /* Exactly the plan's tools, not a text query — a click carries the slugs
     the plan already named rather than asking Browse to re-guess them. */
  const seeTheseTools = () => {
    if (!plan || plan.steps.length === 0) return
    const slugs = [...new Set(plan.steps.map((step) => step.tool.slug))]
    navigate(`/browse?tools=${slugs.map(encodeURIComponent).join(',')}`)
  }

  return (
    <section
      aria-label={label}
      className="relative flex max-h-[474px] min-w-[min(100%,300px)] flex-[1_1_330px] flex-col gap-[10px] overflow-y-auto rounded-card-lg border border-[rgba(178,150,255,0.13)] bg-[linear-gradient(168deg,rgba(124,88,244,0.12)_0%,rgba(255,255,255,0.03)_46%,rgba(255,255,255,0.012)_100%)] p-[15px] shadow-[inset_0_1px_0_rgba(232,222,255,0.15),0_20px_44px_-46px_rgba(124,88,244,0.6)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[40%] left-[10%] h-px bg-[linear-gradient(90deg,transparent,rgba(196,168,255,0.6),transparent)]"
      />

      <div className="flex items-center gap-[10px]">
        <h2 className="text-[11.5px] tracking-[0.18em] text-[#C6B2FF] uppercase">{label}</h2>
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
       * The goal line reads back the user's own words, so they can see the
       * plan is built on exactly what they asked for.
       */}
      {plan && revealed > 0 && (
        <p className="text-[13px] leading-[1.45] font-medium tracking-[-0.01em] text-pretty text-[#D3CCE6] [animation:akFade_.4s_ease_both]">
          Your goal: {plan.goal}
        </p>
      )}

      {!session.hasStarted ? (
        <PlanIdleState />
      ) : plan ? (
        <div className="[animation:akFade_.4s_ease_both]">
          <PlanSteps steps={plan.steps.slice(0, revealed)} />
        </div>
      ) : (
        <PlanIdleState />
      )}

      <button
        type="button"
        onClick={seeTheseTools}
        disabled={!complete}
        className={`mt-auto inline-flex cursor-pointer items-center gap-2 self-start rounded-pill border px-[15px] py-[9px] text-[12.5px] font-semibold transition-[color,border-color,background-color] duration-300 ${
          complete
            ? 'border-[rgba(178,150,255,0.5)] bg-[rgba(124,88,244,0.2)] text-[#F1EAFF] hover:border-[rgba(196,168,255,0.6)] hover:text-white'
            : 'cursor-default border-white/[0.09] bg-white/[0.03] text-[#7E7899]'
        }`}
      >
        See these tools
        <span aria-hidden="true" className="text-[14px]">
          →
        </span>
      </button>
    </section>
  )
}
