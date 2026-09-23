import { useEffect, useState } from 'react'
import PlanIdleState from '@/components/assistant/PlanIdleState'
import { PlanSteps } from '@/components/assistant/PlanBodies'
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
 * ── Why the panel is capped at the chat panel's height ───────────────────
 *
 * The design sets `overflow-y: auto` here but no height, which worked only
 * because its scripted plan was short. A real plan — several tools, several
 * steps — can be taller than the 474px chat panel beside it, and in a stretch
 * row the tallest item sets the row height: the panel grew the whole glass
 * shell instead of scrolling, pushing the page down. Capping at 474px is what
 * makes the design's own `overflow-y: auto` mean something.
 *
 * That scroll belongs to the STEPS, not to the panel. When the section itself
 * scrolled, a four-step plan put the footer's buttons below the fold — the
 * reader had to scroll a panel that gives no sign it scrolls to find the two
 * links it exists to offer. The steps region owns the overflow now and the
 * footer sits outside it, so the way out is always on screen.
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

  return (
    <section
      aria-label={label}
      className="relative flex max-h-[474px] min-w-[min(100%,300px)] flex-[1_1_330px] flex-col gap-[10px] overflow-hidden rounded-card-lg border border-[rgba(178,150,255,0.13)] bg-[linear-gradient(168deg,rgba(124,88,244,0.12)_0%,rgba(255,255,255,0.03)_46%,rgba(255,255,255,0.012)_100%)] p-[15px] shadow-[inset_0_1px_0_rgba(232,222,255,0.15),0_20px_44px_-46px_rgba(124,88,244,0.6)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[40%] left-[10%] h-px bg-[linear-gradient(90deg,transparent,rgba(196,168,255,0.6),transparent)]"
      />

      {/*
       * Everything above the footer scrolls; the footer does not. The section
       * used to be the scroller itself, which put the buttons at the bottom of
       * 617px of content inside a 474px box — below the fold, on the one
       * element the panel exists to lead to. The cap is unchanged and so is
       * the design's `overflow-y: auto`; only WHICH box owns it moved.
       *
       * `min-h-0` is what makes it scroll rather than grow: a flex item's
       * default `min-height: auto` refuses to shrink below its content, so
       * without it this region would push the section past 474px.
       */}
      <div className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
      </div>

      {/*
       * The footer: up to two ways out of the panel, and no row at all when
       * the reply earned neither. Pinned — it sits outside the scroller above,
       * so a plan long enough to scroll never carries the buttons off-screen.
       *
       * The hairline rule is what makes the pin legible. Without it a step card
       * clipped mid-sentence at the scroll boundary sits flush against the
       * title line and reads as colliding with it; the rule says the content
       * above ended because it was cut, not because it finished. Same
       * `border-t border-hairline` separator SubmitPage puts above its own
       * buttons, at this panel's 10px rhythm rather than the form's 24px.
       *
       * The guide comes first because it is the closer answer to what was
       * asked — one written procedure for this exact task, against a list of
       * tools the reader still has to assemble. It is only ever present when
       * the server's gate passed the match (ASSISTANT.automationMinTitleWeight
       * server-side), so its prominence is never spent on a coincidence.
       *
       * `flex-wrap` rather than `whitespace-nowrap` on a narrow panel: the two
       * stack onto separate rows instead of overflowing, which matters because
       * this column can be as narrow as 300px and the section is capped at
       * 474px with the steps above sharing that space.
       */}
      {(automation || stepCount > 0) && (
        <div className="flex flex-col gap-[10px] border-t border-hairline pt-[10px]">
          {/*
           * What the guide button opens. The button is the action and names
           * the kind of thing; this names the one. Not a link — two hit areas
           * onto the same route reads as two destinations — and one row only,
           * with the full text on the title attribute, so a long guide name
           * costs the steps no height.
           */}
          {automation && (
            <p
              title={automation.title}
              className="truncate text-[13px] leading-[1.45] font-medium tracking-[-0.01em] text-[#D3CCE6]"
            >
              {automation.title}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-[10px]">
            {automation && (
              <Button
                variant="gradient"
                to={automationPath(automation.niche, automation.slug)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Step-by-step guide <span aria-hidden="true">→</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </Button>
            )}

            {/* Same destination, same disabled-until-revealed treatment, same
                styling it has always had — only the tab it lands in changed. */}
            {stepCount > 0 && (
              <button
                type="button"
                onClick={seeTheseTools}
                disabled={!complete}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-pill border px-[15px] py-[9px] text-[12.5px] font-semibold transition-[color,border-color,background-color] duration-300 ${
                  complete
                    ? 'border-[rgba(178,150,255,0.5)] bg-[rgba(124,88,244,0.2)] text-[#F1EAFF] hover:border-[rgba(196,168,255,0.6)] hover:text-white'
                    : 'cursor-default border-white/[0.09] bg-white/[0.03] text-[#7E7899]'
                }`}
              >
                See these tools
                <span aria-hidden="true" className="text-[14px]">
                  →
                </span>
                <span className="sr-only"> (opens in a new tab)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
