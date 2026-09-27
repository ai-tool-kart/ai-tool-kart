import { useEffect, useState } from 'react'
import PlanIdleState from '@/components/assistant/PlanIdleState'
import { PlanSteps, PlanStepsSkeleton } from '@/components/assistant/PlanBodies'
import { PlanGraphIcon } from '@/components/assistant/icons'
import { automationPath } from '@/components/automations/labels'
import Button from '@/components/ui/Button'
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
 * ── The hero of the stage ─────────────────────────────────────────────────────
 *
 * This pane is the result the chat pane produces, so it is the wider of the
 * two (see AssistantStage) and is laid out to be understood at a glance: a
 * header bar that mirrors the chat's, the user's goal set as the plan's title
 * with a one-line summary of the workflow, then the numbered steps, each
 * as a workflow stage with the tools that do it (PlanBodies). The guide and "See these tools"
 * sit in a quieter footer — they act on the whole plan, so they are styled as
 * secondary to the per-step actions rather than competing with them.
 *
 * ── Height and scrolling ─────────────────────────────────────────────────────
 *
 * Beside the chat (lg and up) the panel is exactly the chat's height — the
 * viewport minus the fixed header and a margin, clamped to 560–680px, so the
 * whole stage fits on screen under the nav:
 * in a grid row the tallest item sets the row, so a long plan would otherwise
 * grow the whole glass shell instead of scrolling. The STEPS own that scroll,
 * not the panel, so the footer's two links are always on screen — a section
 * that scrolled as a whole used to carry them below the fold. The scrollbar
 * is thin but visible, since a shorter panel scrolls more often and a
 * hidden bar gave no sign there was a fourth step.
 *
 * Stacked (below lg) there is no cap: the plan simply takes the height it
 * needs and the page scrolls. A nested scroller on a phone is a trap, and
 * nothing sits beside the panel whose row it could stretch.
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

/**
 * Mirrors the design's `planStatus`, extended for the two states it lacked —
 * minus the design's own complete state, "Ready to run": a plan of catalogue
 * tools isn't something the site runs on the user's behalf, so the label
 * overpromised what "See these tools" actually does.
 */
function statusLabel(session: AssistantSession, complete: boolean): string {
  if (session.status === 'thinking') return 'Generating'
  if (session.status === 'error') return 'Paused'
  if (session.plan) return complete ? '' : 'Generating'
  if (session.hasStarted) return 'Needs a little more'
  return 'Ready when you are'
}

interface PlanPanelProps {
  session: AssistantSession
  /** Panel title, and its aria-label. Defaults to the design's own wording. */
  label?: string
}

export default function PlanPanel({ session, label = 'Your AI Plan' }: PlanPanelProps) {
  const busy = session.status === 'thinking'
  const plan = session.plan
  const automation = session.automation
  const revealed = usePlanReveal(plan, busy)
  const stepCount = plan?.steps.length ?? 0
  const complete = Boolean(plan) && revealed >= stepCount && stepCount > 0

  /*
   * Exactly the plan's tools, not a text query — a click carries the slugs the
   * plan already named rather than asking Browse to re-guess them.
   *
   * `window.open` and not `target="_blank"`, because this is a <button> and
   * always has been: it is disabled until the steps finish revealing, and an
   * anchor cannot be disabled. Converting it to a link to gain the attribute
   * would mean re-inventing that disabled state with aria-disabled and
   * pointer-events, which is more moving parts than the one call below. The
   * window feature string carries the same guarantees `rel` would.
   */
  const seeTheseTools = () => {
    if (!plan || plan.steps.length === 0) return
    const slugs = [...new Set(plan.steps.map((step) => step.tool.slug))]
    window.open(`/browse?tools=${slugs.map(encodeURIComponent).join(',')}`, '_blank', 'noopener,noreferrer')
  }

  const status = statusLabel(session, complete)

  return (
    <section
      aria-label={label}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-card-lg border border-[rgba(178,150,255,0.16)] bg-[linear-gradient(168deg,rgba(124,88,244,0.13)_0%,rgba(255,255,255,0.03)_42%,rgba(255,255,255,0.012)_100%)] shadow-[inset_0_1px_0_rgba(232,222,255,0.15),0_20px_44px_-46px_rgba(124,88,244,0.6)] lg:h-[clamp(560px,calc(100svh-164px),680px)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[40%] left-[10%] h-px bg-[linear-gradient(90deg,transparent,rgba(196,168,255,0.6),transparent)]"
      />

      {/* Header bar — the same anatomy as the chat pane's, so the two read as
          one instrument: mark, title, one line of what it does, status. */}
      <header className="flex flex-none items-start gap-[10px] border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(124,90,246,0.1),rgba(124,90,246,0))] px-4 py-[14px] sm:px-5">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-chip border border-[rgba(178,150,255,0.3)] bg-[linear-gradient(158deg,rgba(167,139,250,0.26),rgba(255,255,255,0.03))] text-[#D8C8FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          <PlanGraphIcon className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-[2px]">
          <h2 className="text-[15px] font-semibold tracking-[-0.016em] text-[#EFEAFB]">{label}</h2>
          <span className="text-[12px] leading-[1.4] text-pretty text-subtle">
            A step-by-step workflow for your goal
          </span>
        </span>
        {status && (
          <span
            role="status"
            className="mt-[3px] ml-auto inline-flex items-center gap-[7px] text-[11.5px] whitespace-nowrap text-[#8A83A6]"
          >
            {busy && (
              <span
                aria-hidden="true"
                className="h-[11px] w-[11px] rounded-full border-[1.6px] border-[rgba(196,168,255,0.3)] border-t-[#C8AEFF] [animation:akSpin_.8s_linear_infinite]"
              />
            )}
            {status}
          </span>
        )}
      </header>

      {/*
       * Everything between the header and the footer scrolls on desktop.
       * `min-h-0` is what makes it scroll rather than grow: a flex item's
       * default `min-height: auto` refuses to shrink below its content. The
       * 32px fade at the bottom edge says "there is more" when a step is cut
       * by the scroll boundary; at the true end it only fades the padding.
       */}
      <div className="flex min-h-0 flex-auto flex-col gap-[18px] px-4 pt-[18px] pb-4 sm:px-5 lg:overflow-y-auto lg:overscroll-contain lg:[mask-image:linear-gradient(180deg,#000_calc(100%-32px),transparent)] lg:[scrollbar-color:rgba(178,150,255,0.28)_transparent] lg:[scrollbar-width:thin]">
        {/*
         * The goal reads back the user's own words as the plan's title, so
         * they can see the plan is built on exactly what they asked for.
         */}
        {plan && revealed > 0 && (
          <div className="flex flex-col gap-[6px] [animation:akFade_.4s_ease_both]">
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#8A83A6] uppercase">
              Your goal
            </p>
            <p className="text-[22px] leading-[1.2] font-semibold tracking-[-0.026em] text-balance text-ink-bright sm:text-[24px]">
              {plan.goal}
            </p>
            <p className="text-[13px] text-[#9E97B8]">
              A {stepCount}-step workflow built around your goal
            </p>
          </div>
        )}

        {busy ? (
          <PlanStepsSkeleton />
        ) : plan ? (
          <PlanSteps steps={plan.steps.slice(0, revealed)} />
        ) : (
          /* Beside the chat the panel is at least 560px tall; the faded step outline
             fills it with the shape of what is coming instead of empty glass.
             Stacked, it would only add scroll, so it is desktop-only. */
          <div className="flex flex-auto flex-col justify-center gap-6">
            <PlanIdleState />
            <div className="hidden opacity-70 [mask-image:linear-gradient(180deg,#000_0%,transparent_100%)] lg:block">
              <PlanStepsSkeleton />
            </div>
          </div>
        )}
      </div>

      {/*
       * The footer: up to two ways out of the whole plan, and no row at all
       * when the reply earned neither. Pinned outside the scroller above, so
       * a plan long enough to scroll never carries them off-screen.
       *
       * Both are deliberately quieter than the per-step "Explore" actions:
       * those are the plan's primary moves, these act on the plan as a whole.
       * The guide still comes first, because it is the closer answer to what
       * was asked — one written procedure for this exact task. It is only ever
       * present when the server's gate passed the match
       * (ASSISTANT.automationMinTitleWeight server-side).
       */}
      {(automation || stepCount > 0) && (
        <div className="flex flex-none flex-col gap-3 border-t border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.022),rgba(255,255,255,0))] px-4 py-[14px] sm:flex-row sm:items-center sm:px-5">
          {/*
           * What the guide button opens. The button is the action and names
           * the kind of thing; this names the one. Not a link — two hit areas
           * onto the same route read as two destinations — and truncated to
           * one row, with the full text on the title attribute.
           */}
          <p className="min-w-0 flex-auto truncate text-[12.5px] leading-[1.45] text-[#8A83A6]">
            {automation ? (
              <span title={automation.title}>
                Guide: <span className="text-[#C9C2DD]">{automation.title}</span>
              </span>
            ) : (
              'Every tool in this workflow, in one view'
            )}
          </p>

          <div className="flex flex-none flex-wrap items-center gap-[10px]">
            {automation && (
              <Button
                variant="ghost"
                to={automationPath(automation.niche, automation.slug)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Step-by-step guide <span aria-hidden="true">→</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </Button>
            )}

            {/* Same destination and the same disabled-until-revealed rule as
                ever; only the treatment moved to the secondary tier. */}
            {stepCount > 0 && (
              <button
                type="button"
                onClick={seeTheseTools}
                disabled={!complete}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-pill border px-[15px] py-2 text-[13px] font-semibold transition-[color,border-color,background-color] duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  complete
                    ? 'border-white/[0.09] text-ink hover:border-accent-line hover:bg-accent-wash-strong hover:text-accent'
                    : 'cursor-default border-white/[0.06] text-[#6E6884]'
                }`}
              >
                See these tools
                <span aria-hidden="true">→</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
