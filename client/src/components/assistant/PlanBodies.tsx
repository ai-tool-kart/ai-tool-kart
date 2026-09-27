import Monogram from '@/components/ui/Monogram'
import type { AssistantPlanStep } from '@/types/assistant'

/*
 * The plan's steps — the stages of a workflow, not a list of tools.
 *
 * Each step reads top to bottom as: the action (the stage, in plain words),
 * what finishing it means, then the tools that do it. Nothing here is written
 * by the model: `action` and `purpose` come from the server's STAGE_ACTIONS and
 * STAGE_PURPOSES maps, and every tool is the catalogue's own hydrated record.
 *
 * ── Hierarchy ────────────────────────────────────────────────────────────────
 *
 * The action is the card's title and the largest text in it. Tools sit in a
 * quieter "Tools used" row as small chips — still easy to spot, never the
 * focal point. The lead tool is a chip with its monogram and free/paid label;
 * the step's runners-up (`alsoGood`) follow as plain "or" names. A chip's
 * tooltip carries the tool's own one-liner (`plainLine`, else `tagline`).
 *
 * ── Where the step's link goes ───────────────────────────────────────────────
 *
 * "View tools for this step" opens Browse narrowed to exactly this step's
 * tools — the lead and its runners-up — the same `/browse?tools=` destination
 * "See these tools" uses for the whole plan, in a new tab so the conversation
 * stays where it is. It is the step's only link: chips are labels, so the card
 * has one clear way forward rather than several routes to the same page.
 *
 * The numbered rail on the left, joined by a connector, is the sequence; the
 * card switches from stacked to side-by-side on its CONTAINER's width
 * (`@container` on the list), since the plan panel is two thirds of the stage
 * on desktop and full width when stacked.
 */

/**
 * "Free" is a claim only a fully free tool can make — a freemium tool has a
 * paid tier behind it, so it reads "Free plan" instead: still a yes/no
 * answer to "can I start without paying?", but not a promise the tool
 * itself doesn't make.
 */
function priceLabel(pricingTier: AssistantPlanStep['tool']['pricingTier']): string {
  if (pricingTier === 'free') return 'Free'
  if (pricingTier === 'freemium') return 'Free plan'
  return 'Paid'
}

/** Browse, narrowed to the given tools. */
function browseHref(tools: AssistantPlanStep['tool'][]): string {
  return `/browse?tools=${tools.map((tool) => encodeURIComponent(tool.slug)).join(',')}`
}

/** Two-digit step number, "01" — the workflow sequence the rail shows. */
function stepNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

export function PlanSteps({ steps }: { steps: AssistantPlanStep[] }) {
  return (
    <ol className="@container flex list-none flex-col p-0">
      {steps.map((step, index) => {
        const last = index === steps.length - 1
        return (
          <li
            key={step.tool.id}
            className="relative flex gap-2 pb-[10px] last:pb-0 [animation:akRise_.5s_cubic-bezier(.16,.84,.44,1)_both] @[520px]:gap-4"
          >
            {/* The rail: the step's place in the sequence, then a connector
                down to the next one. */}
            <div
              aria-hidden="true"
              className="flex w-[22px] flex-none flex-col items-center pt-[14px] @[520px]:w-[30px]"
            >
              <span className="bg-[linear-gradient(180deg,#F4EEFF_0%,#B99BFF_100%)] bg-clip-text text-[15px] leading-none font-semibold tracking-[-0.02em] text-transparent tabular-nums">
                {stepNumber(index)}
              </span>
              {!last && (
                <span className="mt-[10px] w-px flex-auto bg-[linear-gradient(180deg,rgba(178,150,255,0.4),rgba(178,150,255,0.06))]" />
              )}
            </div>

            <article className="flex min-w-0 flex-auto flex-col gap-[10px] rounded-[16px] border border-white/[0.075] bg-[linear-gradient(180deg,rgba(22,18,40,0.86),rgba(10,8,20,0.92))] px-[14px] py-3 shadow-[inset_0_1px_0_rgba(232,222,255,0.08),0_14px_30px_-26px_rgba(0,0,0,0.9)] transition-[border-color] duration-300 hover:border-[rgba(178,150,255,0.22)] @[520px]:px-[18px]">
              <div className="flex flex-col gap-1">
                <h3 className="text-[16.5px] leading-[1.3] font-semibold tracking-[-0.02em] text-[#F4F0FD]">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.action}
                </h3>
                <p className="text-[13px] leading-[1.5] tracking-[-0.006em] text-pretty text-[#B9B2CF]">
                  {step.purpose}
                </p>
              </div>

              <div className="flex flex-col gap-3 @[520px]:flex-row @[520px]:items-center @[520px]:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-x-[10px] gap-y-2">
                  <span className="text-[10px] font-semibold tracking-[0.14em] text-[#7E7899] uppercase">
                    Tools used
                  </span>
                  <span
                    title={step.tool.plainLine ?? step.tool.tagline}
                    className="inline-flex items-center gap-[7px] rounded-pill border border-white/[0.09] bg-white/[0.035] py-[3px] pr-[10px] pl-[3px]"
                  >
                    <Monogram mono={step.tool.mono} size="xs" />
                    <span className="text-[12.5px] font-medium tracking-[-0.006em] text-[#E4DEF4]">
                      {step.tool.name}
                    </span>
                    <span className="text-[10.5px] text-[#8A83A6]">
                      · {priceLabel(step.tool.pricingTier)}
                    </span>
                  </span>
                  {step.alsoGood.length > 0 && (
                    <span className="text-[11.5px] tracking-[-0.006em] text-[#8A83A6]">
                      or {step.alsoGood.map((tool) => tool.name).join(', ')}
                    </span>
                  )}
                </div>

                <a
                  href={browseHref([step.tool, ...step.alsoGood])}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit flex-none items-center gap-2 rounded-pill border border-[rgba(178,150,255,0.42)] bg-[linear-gradient(180deg,rgba(138,104,248,0.3),rgba(96,62,220,0.2))] px-[14px] py-[7px] text-[12.5px] font-semibold whitespace-nowrap text-[#F1EAFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_20px_-14px_rgba(116,80,244,0.9)] transition-[border-color,color,transform] duration-250 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px hover:border-[rgba(206,184,255,0.7)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  View tools for this step
                  <span aria-hidden="true" className="text-[14px]">
                    →
                  </span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            </article>
          </li>
        )
      })}
    </ol>
  )
}

/** Placeholder rows while a turn is in flight — same rail and card geometry. */
export function PlanStepsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="@container flex flex-col gap-[10px]">
      {Array.from({ length: count }, (_unused, index) => (
        <div key={index} className="flex gap-2 @[520px]:gap-4">
          <div className="flex w-[22px] flex-none justify-center pt-[15px] @[520px]:w-[30px]">
            <span className="h-[12px] w-[18px] rounded-[4px] bg-white/[0.06]" />
          </div>
          <div className="flex flex-auto flex-col gap-[10px] rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-4">
            <span className="h-[12px] w-[36%] rounded-full bg-white/[0.08]" />
            <span className="h-[8px] w-[74%] rounded-full bg-white/[0.05]" />
            <span className="mt-1 h-[20px] w-[30%] rounded-full bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}
