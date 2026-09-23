import type { AssistantPlanStep } from '@/types/assistant'

/*
 * The plan's steps — the only content "Your AI Plan" renders now.
 *
 * Each step is one plain-language action, the one tool that does it, that
 * tool's own plain-language line, and a free/paid label. Nothing here is
 * written by the model: `action` comes from the server's STAGE_ACTIONS map
 * and the description and pricing label are read straight off the hydrated
 * tool — `plainLine` when the record has one, its `tagline` otherwise.
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
              <span className="font-medium text-[#D3CCE6]">{step.tool.name}</span>
              {' — '}
              {step.tool.plainLine ?? step.tool.tagline}
            </p>
            <span className="mt-[2px] inline-flex w-fit items-center rounded-pill border border-white/[0.09] bg-white/[0.03] px-[8px] py-[2px] text-[10.5px] font-semibold tracking-[0.04em] text-[#9E97B8] uppercase">
              {priceLabel(step.tool.pricingTier)}
            </span>
            {step.alsoGood.length > 0 && (
              <p className="text-[11px] leading-[1.4] tracking-[-0.006em] text-pretty text-[#8A83A6]">
                Also good: {step.alsoGood.map((tool) => tool.name).join(', ')}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
