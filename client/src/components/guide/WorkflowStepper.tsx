import { type Ref, useEffect, useRef } from 'react'
import CopyButton from '@/components/ui/CopyButton'
import { ResourceList } from '@/components/guide/GuideResources'
import GuideToolCard from '@/components/guide/GuideToolCard'
import {
  ArrowIcon,
  BulbIcon,
  CheckIcon,
  EYEBROW,
  ExternalIcon,
  WINDOW,
  WindowRim,
} from '@/components/guide/guideStyles'
import { useGuideProgress } from '@/hooks/useGuideProgress'
import type { GuideStep, GuideTool } from '@/types/guide'

/*
 * The interactive workflow — the page's centre of gravity.
 *
 * One window, three regions: the step rail (where am I), the open step (what
 * do I do), and the aside (what does it with, what comes next). At lg they
 * sit side by side like the reference; below it the rail becomes a
 * horizontally scrolling strip above the step and the aside drops beneath it,
 * so a phone gets the same three answers in reading order instead of a
 * shrunken desktop.
 *
 * ── Every step is in the DOM ─────────────────────────────────────────────────
 *
 * Only the open step is visible, but all of them render — the rest with
 * `hidden` — so each step's heading, instructions and prompt are crawlable
 * text on the page, and `#step-2` links resolve to a real element.
 *
 * ── Focus ────────────────────────────────────────────────────────────────────
 *
 * Moving between steps (rail, Next, Previous) moves focus to the new step's
 * heading, and scrolls the window's top back into view when a long step on a
 * phone had carried it off-screen. The first render does neither.
 */

interface WorkflowStepperProps {
  /** Progress storage key — niche and slug. */
  guideKey: string
  steps: GuideStep[]
  tools: GuideTool[]
}

function StepRail({
  steps,
  active,
  completed,
  onSelect,
}: {
  steps: GuideStep[]
  active: number
  completed: ReadonlySet<number>
  onSelect: (index: number) => void
}) {
  const listRef = useRef<HTMLOListElement>(null)
  const placedRef = useRef(false)

  // Below lg the rail is a horizontal strip: keep the open step in view in it.
  // scrollLeft only — scrollIntoView would move the page as well.
  useEffect(() => {
    const list = listRef.current
    const item = list?.children[active] as HTMLElement | undefined
    if (!list || !item || list.scrollWidth <= list.clientWidth) return
    // Instant on first render (a restored step 3 should simply be in view),
    // smooth when the reader moves.
    list.scrollTo({ left: item.offsetLeft - 16, behavior: placedRef.current ? 'smooth' : 'instant' })
    placedRef.current = true
  }, [active])

  return (
    <nav aria-label="Workflow steps" className="min-w-0">
      <ol ref={listRef} className="relative -mx-1 flex list-none gap-2 overflow-x-auto p-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:p-0">
        {steps.map((step, index) => {
          const isActive = index === active
          const isDone = completed.has(index)
          return (
            <li key={step.id} className="flex-none lg:flex-auto">
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={isActive ? 'step' : undefined}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-[14px] border px-3 py-[10px] text-left transition-[background-color,border-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  isActive
                    ? 'border-[rgba(178,150,255,0.3)] bg-[rgba(124,88,244,0.16)]'
                    : 'border-transparent hover:bg-white/[0.04]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[12px] font-bold tabular-nums ${
                    isDone
                      ? 'bg-[linear-gradient(180deg,#9B7BFF,#6A45EE)] text-white'
                      : isActive
                        ? 'border border-[rgba(196,168,255,0.6)] bg-[rgba(124,88,244,0.3)] text-white'
                        : 'border border-white/[0.14] text-[#8A83A6]'
                  }`}
                >
                  {isDone ? <CheckIcon className="h-[14px] w-[14px]" /> : step.number}
                </span>
                <span
                  className={`text-[13.5px] leading-[1.35] font-medium whitespace-nowrap lg:whitespace-normal ${
                    isActive ? 'text-ink' : isDone ? 'text-[#C0B9D6]' : 'text-[#8A83A6]'
                  }`}
                >
                  {step.title}
                  <span className="sr-only">{isDone ? ' (done)' : ''}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function PromptBlock({ prompt }: { prompt: string }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-white/[0.1] bg-[rgba(6,5,12,0.7)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-[10px]">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-[#8A83A6] uppercase">Prompt</span>
        <CopyButton text={prompt} label="Copy prompt" copiedLabel="Copied ✓" />
      </div>
      <p className="px-4 py-4 font-mono text-[13px] leading-[1.7] whitespace-pre-wrap text-[#DCD5EE]">{prompt}</p>
    </div>
  )
}

/** The step's one outbound action: the editor's CTA, else its first linked tool. */
function StepAction({ step }: { step: GuideStep }) {
  const tool = step.tools.find((candidate) => candidate.url)
  const action = step.cta
    ? { label: step.cta.label, url: step.cta.url }
    : tool?.url
      ? { label: tool.urlIsToolSite ? `Open ${tool.name}` : `Read about ${tool.name}`, url: tool.url }
      : undefined
  if (!action) return null
  return (
    <a
      href={action.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group inline-flex w-fit items-center gap-2 rounded-pill border border-[rgba(178,150,255,0.42)] bg-[linear-gradient(180deg,rgba(138,104,248,0.3),rgba(96,62,220,0.2))] px-4 py-[9px] text-[13.5px] font-semibold text-[#F1EAFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_20px_-14px_rgba(116,80,244,0.9)] transition-[border-color,color] duration-200 hover:border-[rgba(206,184,255,0.7)] hover:text-white"
    >
      {action.label}
      <ExternalIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-px group-hover:-translate-y-px" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function StepPanel({
  step,
  hidden,
  headingRef,
}: {
  step: GuideStep
  hidden: boolean
  headingRef?: Ref<HTMLHeadingElement>
}) {
  return (
    <div id={step.id} hidden={hidden} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-[clamp(20px,2.2vw,24px)] leading-[1.25] font-semibold tracking-[-0.025em] text-ink-bright outline-none"
        >
          <span className="sr-only">Step {step.number}: </span>
          {step.title}
        </h3>
        {step.body && <p className="text-[15px] leading-[1.65] text-pretty text-[#C0B9D6]">{step.body}</p>}
        {step.prompt && !step.body && (
          <p className="text-[15px] leading-[1.65] text-pretty text-[#C0B9D6]">
            Copy the prompt, adjust the details to your own situation, then run it.
          </p>
        )}
      </div>

      {step.instructions.length > 0 && (
        <ol className="flex list-none flex-col gap-[10px] p-0">
          {step.instructions.map((instruction, index) => (
            <li key={instruction} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[rgba(124,88,244,0.2)] text-[11px] font-bold text-[#C8AEFF] tabular-nums"
              >
                {index + 1}
              </span>
              <span className="text-[14.5px] leading-[1.55] text-pretty text-[#D3CCE6]">{instruction}</span>
            </li>
          ))}
        </ol>
      )}

      <StepAction step={step} />

      {step.prompt && <PromptBlock prompt={step.prompt} />}

      {step.expectedOutcome && (
        <p className="flex gap-3 rounded-[14px] border border-[rgba(143,227,176,0.2)] bg-[rgba(143,227,176,0.05)] px-4 py-3 text-[13.5px] leading-[1.55] text-pretty text-[#D6EEDF]">
          <CheckIcon className="mt-[2px] h-4 w-4 flex-none text-[#8FE3B0]" />
          <span>
            <span className="font-semibold">When this step is done: </span>
            {step.expectedOutcome}
          </span>
        </p>
      )}

      {step.tips.length > 0 && (
        <div className="flex gap-3 rounded-[14px] border border-[rgba(250,204,21,0.18)] bg-[rgba(250,204,21,0.05)] px-4 py-3 text-[13.5px] leading-[1.55] text-pretty text-[#E9E1C4]">
          <BulbIcon className="mt-px h-[18px] w-[18px] flex-none text-[#F5D565]" />
          {step.tips.length === 1 ? (
            <p>
              <span className="font-semibold">Tip: </span>
              {step.tips[0]}
            </p>
          ) : (
            <div>
              <p className="font-semibold">Tips</p>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
                {step.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {step.resources.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#7E7899] uppercase">Step resources</p>
          <ResourceList resources={step.resources} className="mt-2" />
        </div>
      )}
    </div>
  )
}

function StepAside({
  step,
  next,
  tools,
  onNext,
}: {
  step: GuideStep
  next: GuideStep | undefined
  tools: GuideTool[]
  onNext: () => void
}) {
  const label = 'text-[11px] font-semibold tracking-[0.14em] text-[#7E7899] uppercase'
  const own = step.tools.length > 0
  const shown = own ? step.tools : tools
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
      <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.025] p-4">
        <p className={label}>
          {own
            ? shown.length === 1
              ? 'Tool used in this step'
              : 'Tools used in this step'
            : shown.length === 1
              ? 'Tool in this workflow'
              : 'Tools in this workflow'}
        </p>
        <ul className="mt-3 flex list-none flex-col gap-4 p-0">
          {shown.map((tool) => (
            <li key={tool.name}>
              <GuideToolCard tool={tool} compact={!own || shown.length > 1} />
            </li>
          ))}
        </ul>

        {step.alternatives.length > 0 && (
          <div className="mt-4 border-t border-white/[0.07] pt-3">
            <p className={label}>Alternatives</p>
            <ul className="mt-2 flex list-none flex-col gap-2 p-0 text-[13px]">
              {step.alternatives.map((tool) => (
                <li key={tool.name}>
                  <span className="font-medium text-[#DCD5EE]">{tool.name}</span>
                  {tool.why && <span className="text-[#8A83A6]"> — {tool.why}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {next ? (
        <button
          type="button"
          onClick={onNext}
          className="group flex cursor-pointer items-center gap-3 rounded-[16px] border border-white/[0.07] bg-white/[0.025] p-4 text-left transition-[border-color,background-color] duration-200 hover:border-accent-line hover:bg-accent-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border border-white/[0.14] text-[12.5px] font-bold text-[#C8AEFF]">
            {next.number}
          </span>
          <span className="min-w-0 flex-auto">
            <span className={`block ${label}`}>Up next</span>
            <span className="mt-1 block text-[14px] font-medium text-ink">{next.title}</span>
          </span>
          <ArrowIcon className="h-4 w-4 flex-none text-accent transition-transform duration-200 group-hover:translate-x-[3px]" />
        </button>
      ) : (
        <a
          href="#related"
          className="group flex items-center gap-3 rounded-[16px] border border-white/[0.07] bg-white/[0.025] p-4 transition-[border-color,background-color] duration-200 hover:border-accent-line hover:bg-accent-wash"
        >
          <span className="min-w-0 flex-auto">
            <span className={`block ${label}`}>Last step</span>
            <span className="mt-1 block text-[14px] font-medium text-ink">See related workflows</span>
          </span>
          <ArrowIcon className="h-4 w-4 flex-none text-accent transition-transform duration-200 group-hover:translate-x-[3px]" />
        </a>
      )}
    </div>
  )
}

export default function WorkflowStepper({ guideKey, steps, tools }: WorkflowStepperProps) {
  const { active, completed, finished, goTo, completeAndContinue, reset } = useGuideProgress(
    guideKey,
    steps.length,
  )
  const windowRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const movedRef = useRef(false)

  useEffect(() => {
    if (!movedRef.current) return
    headingRef.current?.focus({ preventScroll: true })
    const top = windowRef.current?.getBoundingClientRect().top ?? 0
    if (top < 0) windowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [active])

  const move = (action: () => void) => {
    movedRef.current = true
    action()
  }

  const step = steps[active]
  if (!step) return null
  const isLast = active === steps.length - 1
  const isDone = completed.has(active)
  const percent = Math.round((completed.size / steps.length) * 100)

  return (
    <div ref={windowRef} className={`${WINDOW} scroll-mt-[176px]`}>
      <WindowRim />

      {/* Progress: where the reader is, and how much is done. */}
      <div className="border-b border-white/[0.07] px-5 pt-5 pb-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[14px] font-semibold text-ink" aria-live="polite">
            Step {step.number} <span className="font-normal text-[#8A83A6]">of {steps.length}</span>
          </p>
          <p className="text-[12.5px] text-[#8A83A6] tabular-nums">{percent}% complete</p>
        </div>
        <div
          role="progressbar"
          aria-label="Workflow progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={completed.size}
          aria-valuetext={`${completed.size} of ${steps.length} steps done`}
          className="mt-3 h-[5px] overflow-hidden rounded-pill bg-white/[0.07]"
        >
          <div
            className="h-full rounded-pill bg-[linear-gradient(90deg,#A488FF,#6A45EE)] shadow-[0_0_12px_rgba(150,110,255,0.7)] transition-[width] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {finished && (
        <div
          role="status"
          className="flex flex-col gap-3 border-b border-white/[0.07] bg-[linear-gradient(90deg,rgba(124,88,244,0.18),rgba(124,88,244,0.04))] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
        >
          <p className="flex items-center gap-3 text-[14px] font-medium text-ink">
            <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[linear-gradient(180deg,#9B7BFF,#6A45EE)] text-white">
              <CheckIcon className="h-[14px] w-[14px]" />
            </span>
            Workflow complete — every step is done.
          </p>
          <div className="flex flex-none items-center gap-4 text-[13px] font-semibold">
            <a href="#related" className="text-accent underline-offset-2 hover:underline">
              Try a related workflow →
            </a>
            <button
              type="button"
              onClick={() => move(reset)}
              className="cursor-pointer text-muted-soft underline-offset-2 hover:text-ink hover:underline"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)_260px] lg:gap-0 lg:p-0">
        <div className="min-w-0 lg:border-r lg:border-white/[0.07] lg:p-4">
          <StepRail steps={steps} active={active} completed={completed} onSelect={(index) => move(() => goTo(index))} />
        </div>

        <div className="min-w-0 lg:p-7">
          <p className={`${EYEBROW} mb-3`}>
            Step {step.number}
            {isDone && <span className="ml-2 tracking-normal text-[#8FE3B0] normal-case">· Done</span>}
          </p>
          {steps.map((candidate, index) => (
            <StepPanel
              key={candidate.id}
              step={candidate}
              hidden={index !== active}
              headingRef={index === active ? headingRef : undefined}
            />
          ))}

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            {active > 0 && (
              <button
                type="button"
                onClick={() => move(() => goTo(active - 1))}
                className="cursor-pointer rounded-pill border border-white/[0.09] px-5 py-[11px] text-[14px] font-medium text-muted-soft transition-[border-color,color,background-color] duration-200 hover:border-accent-line hover:bg-accent-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                ← Previous
              </button>
            )}
            <button
              type="button"
              onClick={() => move(completeAndContinue)}
              disabled={isLast && isDone}
              className="group inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill border border-white/[0.16] bg-[image:var(--gradient-cta)] px-[22px] py-[11px] text-[14px] font-semibold text-white shadow-button transition-[box-shadow,opacity] duration-300 hover:shadow-button-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50 disabled:hover:shadow-button sm:ml-auto"
            >
              {isLast ? (isDone ? 'All steps done' : 'Mark done & finish') : isDone ? 'Next step' : 'Mark done & continue'}
              {!(isLast && isDone) && (
                <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-[3px]" />
              )}
            </button>
          </div>
        </div>

        <div className="min-w-0 lg:border-l lg:border-white/[0.07] lg:p-4">
          <StepAside
            step={step}
            next={steps[active + 1]}
            tools={tools}
            onNext={() => move(() => goTo(active + 1))}
          />
        </div>
      </div>
    </div>
  )
}
