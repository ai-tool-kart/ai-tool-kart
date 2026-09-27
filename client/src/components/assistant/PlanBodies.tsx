import { Fragment } from 'react'
import Monogram from '@/components/ui/Monogram'
import type { AssistantPlanStep } from '@/types/assistant'

/*
 * The plan's steps — the only content "Your AI Plan" renders now.
 *
 * Each step is one plain-language action, the one tool that does it, that
 * tool's own plain-language line, and a free/paid label. Nothing here is
 * written by the model: `action` comes from the server's STAGE_ACTIONS map
 * and the description and pricing label are read straight off the hydrated
 * tool — `plainLine` when the record has one, its `tagline` otherwise.
 *
 * ── Reading order ────────────────────────────────────────────────────────────
 *
 * Built to be scanned, not read: a numbered rail down the left (with a
 * connector, so the steps read as one workflow rather than a list), then per
 * card the action as an eyebrow, the tool as the card's title, one line on
 * what it does, and the step's own call to action.
 *
 * ── Where the links go ───────────────────────────────────────────────────────
 *
 * "Explore {tool}" opens that tool on Browse — the destination "See these
 * tools" uses for the whole plan, narrowed to one slug, in a new tab so the
 * conversation stays where it is. It is the step's ONE link to Browse: the
 * tool name used to be that link and is now plain text, because two hit areas
 * onto the same route read as two destinations.
 *
 * "Visit site" is the catalogue's own `url` for the tool — the answer to
 * "where can I use it?" — kept quiet beneath the main action so it never
 * competes with it. Every "Also good" name still opens its tool on Browse.
 *
 * The card switches from stacked to side-by-side on its CONTAINER's width
 * (`@container` on the list), not the viewport's: the plan panel is two thirds
 * of the stage on desktop and full width when stacked, so a viewport
 * breakpoint would guess wrong in both places.
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

/** Browse, narrowed to one tool. Shared by the step CTA and "Also good". */
function browseHref(slug: string): string {
  return `/browse?tools=${encodeURIComponent(slug)}`
}

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/*
 * A runner-up's name, opening that tool on Browse. The caller passes the
 * colour the text should have (the base `a` rule would otherwise paint it
 * --color-link).
 */
function ToolLink({ tool, className }: { tool: AssistantPlanStep['tool']; className: string }) {
  return (
    <a
      href={browseHref(tool.slug)}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} rounded-[4px] underline-offset-2 hover:underline focus-visible:underline ${FOCUS_RING}`}
    >
      {tool.name}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

/** Two-digit step number, "01" — the editorial numbering the rail uses. */
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
            {/* The rail: number, then a connector down to the next step. */}
            <div aria-hidden="true" className="flex w-[22px] flex-none flex-col items-center pt-[14px] @[520px]:w-[30px]">
              <span className="bg-[linear-gradient(180deg,#F4EEFF_0%,#B99BFF_100%)] bg-clip-text text-[15px] leading-none font-semibold tracking-[-0.02em] text-transparent tabular-nums">
                {stepNumber(index)}
              </span>
              {!last && (
                <span className="mt-[10px] w-px flex-auto bg-[linear-gradient(180deg,rgba(178,150,255,0.4),rgba(178,150,255,0.06))]" />
              )}
            </div>

            <article className="flex min-w-0 flex-auto flex-col gap-[14px] rounded-[16px] border border-white/[0.075] bg-[linear-gradient(180deg,rgba(22,18,40,0.86),rgba(10,8,20,0.92))] p-[14px] shadow-[inset_0_1px_0_rgba(232,222,255,0.08),0_14px_30px_-26px_rgba(0,0,0,0.9)] transition-[border-color] duration-300 hover:border-[rgba(178,150,255,0.22)] @[520px]:flex-row @[520px]:items-center @[520px]:gap-5 @[520px]:px-[18px] @[520px]:py-[14px]">
              <div className="flex min-w-0 flex-auto gap-[14px]">
                <span className="hidden @[420px]:block">
                  <Monogram mono={step.tool.mono} size="sm" />
                </span>
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <h3 className="text-[10.5px] font-semibold tracking-[0.16em] text-[#B49BFF] uppercase">
                    <span className="sr-only">Step {index + 1}: </span>
                    {step.action}
                  </h3>
                  <p className="flex flex-wrap items-center gap-x-[9px] gap-y-1">
                    <span className="text-[18px] leading-[1.25] font-semibold tracking-[-0.022em] text-[#F4F0FD]">
                      {step.tool.name}
                    </span>
                    <span className="inline-flex items-center rounded-pill border border-white/[0.09] bg-white/[0.03] px-[8px] py-[2px] text-[10px] font-semibold tracking-[0.06em] text-[#9E97B8] uppercase">
                      {priceLabel(step.tool.pricingTier)}
                    </span>
                  </p>
                  <p className="mt-[2px] text-[13px] leading-[1.5] tracking-[-0.006em] text-pretty text-[#B9B2CF]">
                    {step.tool.plainLine ?? step.tool.tagline}
                  </p>
                  {step.alsoGood.length > 0 && (
                    <p className="mt-[2px] text-[11.5px] leading-[1.4] tracking-[-0.006em] text-pretty text-[#8A83A6]">
                      Also good:{' '}
                      {step.alsoGood.map((tool, altIndex) => (
                        <Fragment key={tool.id}>
                          {altIndex > 0 && ', '}
                          <ToolLink tool={tool} className="text-inherit" />
                        </Fragment>
                      ))}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 @[420px]:pl-[56px] @[520px]:flex-col @[520px]:items-end @[520px]:pl-0">
                <a
                  href={browseHref(step.tool.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 rounded-pill border border-[rgba(178,150,255,0.42)] bg-[linear-gradient(180deg,rgba(138,104,248,0.3),rgba(96,62,220,0.2))] px-[15px] py-[8px] text-[12.5px] font-semibold whitespace-nowrap text-[#F1EAFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_20px_-14px_rgba(116,80,244,0.9)] transition-[border-color,background-color,color,transform] duration-250 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px hover:border-[rgba(206,184,255,0.7)] hover:text-white ${FOCUS_RING}`}
                >
                  Explore {step.tool.name}
                  <span aria-hidden="true" className="text-[14px]">
                    →
                  </span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                <a
                  href={step.tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`rounded-[4px] text-[11.5px] font-medium whitespace-nowrap text-[#8A83A6] transition-colors duration-250 hover:text-[#D3C4FF] ${FOCUS_RING}`}
                >
                  Visit site <span aria-hidden="true">↗</span>
                  <span className="sr-only"> (opens {step.tool.name}'s website in a new tab)</span>
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
    <div aria-hidden="true" className="@container flex flex-col gap-3">
      {Array.from({ length: count }, (_unused, index) => (
        <div key={index} className="flex gap-2 @[520px]:gap-4">
          <div className="flex w-[22px] flex-none justify-center pt-[14px] @[520px]:w-[30px]">
            <span className="h-[12px] w-[18px] rounded-[4px] bg-white/[0.06]" />
          </div>
          <div className="flex flex-auto items-center gap-[14px] rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-4">
            <span className="h-[42px] w-[42px] flex-none rounded-md bg-white/[0.06]" />
            <div className="flex flex-auto flex-col gap-2">
              <span className="h-[8px] w-[28%] rounded-full bg-white/[0.06]" />
              <span className="h-[12px] w-[40%] rounded-full bg-white/[0.08]" />
              <span className="h-[8px] w-[72%] rounded-full bg-white/[0.05]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
