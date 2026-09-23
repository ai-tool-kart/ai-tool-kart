import CopyButton from '@/components/ui/CopyButton'
import type { AutomationStep, AutomationTool } from '@/types/automation'

/*
 * An automation's steps, numbered.
 *
 * Styled like the assistant plan's step list (components/assistant/PlanBodies
 * PlanSteps) — the same row panel and 19px violet number square — but its own
 * component on its own type: an automation step is title + body + optional
 * prompt/tip, not a plan step's action + tool.
 *
 * A step's `prompt` renders in a bordered block with a CopyButton. A step that
 * names a tool (`toolName`, step 1 of the derived three) links that tool from
 * the automation's own tool list: the step carries the name, the tool carries
 * the url (see server deriveSteps.ts).
 */

const ROW =
  'flex items-start gap-[11px] rounded-[14px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(12,10,22,0.82),rgba(8,7,16,0.88))] px-[13px] py-3'

const NUMBER =
  'flex h-[19px] w-[19px] flex-none items-center justify-center rounded-[6px] border border-[rgba(178,150,255,0.3)] bg-[rgba(124,88,244,0.14)] text-[10.5px] font-bold text-[#C8AEFF]'

interface AutomationStepListProps {
  steps: AutomationStep[]
  /** The automation's tools, so a step's toolName can resolve to a link. */
  tools: AutomationTool[]
}

export default function AutomationStepList({ steps, tools }: AutomationStepListProps) {
  return (
    <ol className="flex list-none flex-col gap-[10px] p-0">
      {steps.map((step, index) => {
        const linked = step.toolName ? tools.find((tool) => tool.name === step.toolName && tool.url) : undefined
        return (
          <li key={`${index}-${step.title}`} className={ROW}>
            <span aria-hidden="true" className={NUMBER}>
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-auto flex-col gap-[6px]">
              <h3 className="text-[14px] font-semibold tracking-[-0.006em] text-[#EFEAFB]">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </h3>
              <p className="text-[14px] leading-[1.6] tracking-[-0.006em] text-pretty text-[#C0B9D6]">
                {step.body}
              </p>

              {linked?.url && (
                <a
                  href={linked.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="w-fit text-[13px] font-semibold text-accent underline-offset-2 hover:underline"
                >
                  Open {linked.name}
                  <span aria-hidden="true"> ↗</span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}

              {step.prompt && (
                <div className="mt-1 flex flex-col gap-3 rounded-[12px] border border-white/[0.09] bg-white/[0.03] p-[14px]">
                  <p className="text-[13.5px] leading-[1.6] whitespace-pre-wrap text-[#D3CCE6]">{step.prompt}</p>
                  <div>
                    <CopyButton text={step.prompt} label="Copy prompt" />
                  </div>
                </div>
              )}

              {step.tip && (
                <p className="text-[12.5px] leading-[1.5] text-pretty text-[#8A83A6]">
                  <span className="font-semibold">Note: </span>
                  {step.tip}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
