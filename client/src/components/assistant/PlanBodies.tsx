import { Fragment } from 'react'
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
 * Every tool name, the pick and each "Also good", opens that tool on Browse.
 * See ToolLink.
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

/*
 * A tool name that opens that tool on Browse — the destination "See these
 * tools" uses for the whole plan, narrowed to one slug, and in a new tab for
 * the same reason: the conversation stays where it is.
 *
 * The NAME is the link, not the row. A row-sized target would sit on top of
 * the "Also good" names, which are links too, and nested interactive content
 * is invalid; stretching one link across the row instead would stop the
 * tool's line being selectable text. The caller passes the colour the text
 * had before (the base `a` rule would otherwise paint it --color-link), so the
 * step reads exactly as before until it is hovered or focused.
 */
function ToolLink({ tool, className }: { tool: AssistantPlanStep['tool']; className: string }) {
  return (
    <a
      href={`/browse?tools=${encodeURIComponent(tool.slug)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} rounded-[4px] underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      {tool.name}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

export function PlanSteps({ steps }: { steps: AssistantPlanStep[] }) {
  return (
    <ol className="flex list-none flex-col gap-[10px] p-0">
      {steps.map((step, index) => (
        <li
          key={step.tool.id}
          className="flex items-start gap-[11px] rounded-[14px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(12,10,22,0.82),rgba(8,7,16,0.88))] px-[13px] py-3"
        >
          <span
            aria-hidden="true"
            className="flex h-[19px] w-[19px] flex-none items-center justify-center rounded-[6px] border border-[rgba(178,150,255,0.3)] bg-[rgba(124,88,244,0.14)] text-[10.5px] font-bold text-[#C8AEFF]"
          >
            {index + 1}
          </span>
          <div className="flex min-w-0 flex-col gap-[3px]">
            <p className="text-[12.5px] font-semibold tracking-[-0.006em] text-[#EFEAFB]">
              {step.action}
            </p>
            <p className="text-[12.5px] leading-[1.45] tracking-[-0.006em] text-pretty text-[#C0B9D6]">
              <ToolLink tool={step.tool} className="font-medium text-[#D3CCE6]" />
              {' — '}
              {step.tool.plainLine ?? step.tool.tagline}
            </p>
            <span className="mt-[2px] inline-flex w-fit items-center rounded-pill border border-white/[0.09] bg-white/[0.03] px-[8px] py-[2px] text-[10.5px] font-semibold tracking-[0.04em] text-[#9E97B8] uppercase">
              {priceLabel(step.tool.pricingTier)}
            </span>
            {step.alsoGood.length > 0 && (
              <p className="text-[11px] leading-[1.4] tracking-[-0.006em] text-pretty text-[#8A83A6]">
                Also good:{' '}
                {step.alsoGood.map((tool, index) => (
                  <Fragment key={tool.id}>
                    {index > 0 && ', '}
                    <ToolLink tool={tool} className="text-inherit" />
                  </Fragment>
                ))}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
