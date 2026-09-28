import { Link } from 'react-router-dom'
import { GuideSection } from '@/components/guide/GuideSections'
import { CheckIcon, PROSE } from '@/components/guide/guideStyles'
import type { GuideStep, GuideTool } from '@/types/guide'

/*
 * The written walkthrough — the article's explanation of each step, below the
 * interactive window.
 *
 * The window is for DOING a step (instructions, prompt, the tool's button);
 * this is for UNDERSTANDING it: why the step exists, what to watch for, what
 * each tool contributes, what you should have afterwards. Each step is an H3
 * here, which is why the window renders its step titles as plain text when
 * this section exists — one heading per step in the page outline.
 *
 * Tools appear as a line under the prose, named with the reason they are
 * used: they serve the step, they are not the subject of it.
 *
 * Renders only for guides whose steps carry authored `explanation`.
 */

function ToolLine({ tool }: { tool: GuideTool }) {
  const name = <span className="font-semibold text-[#EDE8FA]">{tool.name}</span>
  return (
    <li className="text-[14.5px] leading-[1.6] text-pretty text-[#B9B2CF]">
      {tool.catalogueSlug ? (
        <Link
          to={`/browse?tools=${encodeURIComponent(tool.catalogueSlug)}`}
          className="underline decoration-white/25 underline-offset-[3px] hover:decoration-accent"
        >
          {name}
        </Link>
      ) : (
        name
      )}
      {tool.why && <> — {tool.why}</>}
    </li>
  )
}

function StepExplained({ step }: { step: GuideStep }) {
  return (
    <section aria-labelledby={`explained-${step.id}-title`} className="border-t border-white/[0.07] pt-8">
      <p className="text-[12px] font-semibold tracking-[0.16em] text-accent uppercase">Step {step.number}</p>
      <h3
        id={`explained-${step.id}-title`}
        className="mt-2 text-[21px] leading-[1.3] font-semibold tracking-[-0.022em] text-balance text-ink-bright"
      >
        {step.title}
      </h3>

      {step.explanation.map((paragraph) => (
        <p key={paragraph} className={`mt-4 ${PROSE}`}>
          {paragraph}
        </p>
      ))}

      {step.tools.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#7E7899] uppercase">
            {step.tools.length === 1 ? 'Tool for this step' : 'Tools for this step'}
          </p>
          <ul className="mt-2 flex list-none flex-col gap-1 p-0">
            {step.tools.map((tool) => (
              <ToolLine key={tool.name} tool={tool} />
            ))}
          </ul>
        </div>
      )}

      {step.expectedOutcome && (
        <p className="mt-5 flex gap-3 text-[14.5px] leading-[1.6] text-pretty text-[#D6EEDF]">
          <CheckIcon className="mt-[4px] h-4 w-4 flex-none text-[#8FE3B0]" />
          <span>
            <span className="font-semibold">You’ll have: </span>
            {step.expectedOutcome}
          </span>
        </p>
      )}
    </section>
  )
}

export default function GuideWalkthrough({ steps }: { steps: GuideStep[] }) {
  const explained = steps.filter((step) => step.explanation.length > 0)
  if (!explained.length) return null
  return (
    <GuideSection
      id="explained"
      eyebrow="Step by step"
      title="The workflow, explained"
      intro={
        <p>
          What each step is for and what to watch out for. To work through the steps, use the{' '}
          <a href="#workflow" className="underline underline-offset-[3px]">
            interactive workflow
          </a>{' '}
          above.
        </p>
      }
    >
      <div className="mt-8 flex flex-col gap-10">
        {explained.map((step) => (
          <StepExplained key={step.id} step={step} />
        ))}
      </div>
    </GuideSection>
  )
}
