import { type Ref, useEffect, useRef } from 'react'
import CopyButton from '@/components/ui/CopyButton'
import { ResourceList } from '@/components/guide/GuideResources'
import GuideToolCard from '@/components/guide/GuideToolCard'
import { ArrowIcon, BulbIcon, CheckIcon, ExternalIcon, WINDOW, WindowRim } from '@/components/guide/guideStyles'
import { useGuideProgress } from '@/hooks/useGuideProgress'
import type { GuideStep } from '@/types/guide'

/*
 * The interactive workflow — where the reader stops reading and does the job.
 *
 * ── What every step answers, in reading order ────────────────────────────────
 *
 *   where am I        the progress header and the step rail
 *   what am I doing   the step title and its one-line description
 *   why               "Why this step" — the article's explanation, folded
 *   which tool        the tool row: name and WHY this step uses it
 *   what to do        numbered instructions, then the prompt to copy
 *   what result       "You should now have" — last, just above the controls
 *   what's next       "Up next" beside the one primary button
 *
 * One column of content beside the rail — no separate tool panel — so the
 * window reads as part of the article rather than as a dashboard, and on a
 * phone the order above IS the scroll order.
 *
 * ── Action hierarchy ─────────────────────────────────────────────────────────
 *
 * The only filled button is progression: "Mark done & continue". Tool links
 * and an editor's CTA are text or outline — they support the step.
 *
 * ── Every step is in the DOM ─────────────────────────────────────────────────
 *
 * Only the open step is visible, but all of them render — the rest `hidden`
 * — so every step's text is in the prerendered HTML and `#step-2` resolves.
 *
 * ── Focus ────────────────────────────────────────────────────────────────────
 *
 * Moving between steps moves focus to the new step's title and brings the
 * window's top back into view if a long step on a phone had scrolled it away.
 * The first render does neither.
 */

interface WorkflowStepperProps {
  /** Progress storage key — niche and slug. */
  guideKey: string
  steps: GuideStep[]
  /**
   * 'p' when the article's written walkthrough (GuideWalkthrough) already
   * gives each step its H3 — one heading per step in the outline.
   */
  stepTitleAs?: 'h3' | 'p'
  /** Where the completion state points: the result checklist, else related guides. */
  resultHref: string
  resultLabel: string
}

const LABEL = 'text-[11px] font-semibold tracking-[0.14em] text-[#A39CBC] uppercase'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/* ─── Where am I ──────────────────────────────────────────────────────────── */

function ProgressHeader({
  steps,
  active,
  completed,
  finished,
}: {
  steps: GuideStep[]
  active: number
  completed: ReadonlySet<number>
  finished: boolean
}) {
  const step = steps[active]
  return (
    <div className="border-b border-white/[0.07] px-5 pt-5 pb-4 sm:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* Announced on every move: the one line that says where the reader now is. */}
        <p className="min-w-0 text-[14px] font-semibold text-ink" aria-live="polite">
          Step {step.number} of {steps.length}
          <span className="font-normal text-[#A39CBC]"> · {step.title}</span>
        </p>
        <p className="flex items-center gap-2 text-[12.5px] text-[#A39CBC] tabular-nums">
          {finished && <CheckIcon className="h-[14px] w-[14px] text-[#8FE3B0]" />}
          {finished ? 'All steps done' : `${completed.size} of ${steps.length} done`}
        </p>
      </div>

      {/* One segment per step: done, current, upcoming. */}
      <div
        role="progressbar"
        aria-label="Workflow progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={completed.size}
        aria-valuetext={`${completed.size} of ${steps.length} steps done`}
        className="mt-3 flex gap-[5px]"
      >
        {steps.map((candidate, index) => (
          <span
            key={candidate.id}
            className={`h-[5px] flex-1 rounded-pill transition-[background-color,box-shadow] duration-300 ${
              completed.has(index)
                ? 'bg-[linear-gradient(90deg,#A488FF,#7C5AF6)] shadow-[0_0_10px_rgba(150,110,255,0.55)]'
                : index === active
                  ? 'bg-[rgba(164,136,255,0.45)]'
                  : 'bg-white/[0.08]'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * The step list. A vertical list beside the step at lg; below it, a row of
 * numbered buttons joined by a line — every step visible and tappable at
 * 360px without scrolling for a typical guide (it scrolls only past ~8).
 * Titles stay in the accessible name at every width.
 */
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
  return (
    <nav aria-label="Workflow steps" className="min-w-0">
      <ol className="flex list-none items-center overflow-x-auto p-1 [scrollbar-width:none] lg:flex-col lg:items-stretch lg:gap-1 lg:overflow-visible lg:p-0">
        {steps.map((step, index) => {
          const isActive = index === active
          const isDone = completed.has(index)
          const last = index === steps.length - 1
          return (
            <li key={step.id} className={`flex items-center lg:block ${last ? 'flex-none' : 'min-w-[44px] flex-1'}`}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={isActive ? 'step' : undefined}
                className={`flex flex-none cursor-pointer items-center gap-3 rounded-full text-left transition-[background-color,border-color] duration-200 lg:w-full lg:rounded-[14px] lg:border lg:px-3 lg:py-[10px] ${FOCUS} ${
                  isActive
                    ? 'lg:border-[rgba(178,150,255,0.3)] lg:bg-[rgba(124,88,244,0.14)]'
                    : 'lg:border-transparent lg:hover:bg-white/[0.04]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-[13px] font-bold tabular-nums transition-[background-color,border-color,box-shadow] duration-200 lg:h-[26px] lg:w-[26px] lg:text-[12px] ${
                    isDone
                      ? 'bg-[linear-gradient(180deg,#9B7BFF,#6A45EE)] text-white'
                      : isActive
                        ? 'border border-[rgba(196,168,255,0.7)] bg-[rgba(124,88,244,0.32)] text-white shadow-[0_0_0_4px_rgba(124,88,244,0.14)]'
                        : 'border border-white/[0.16] bg-[rgba(10,9,18,0.9)] text-[#A39CBC]'
                  }`}
                >
                  {isDone ? <CheckIcon className="h-[14px] w-[14px]" /> : step.number}
                </span>
                <span
                  className={`sr-only text-[13.5px] leading-[1.35] font-medium lg:not-sr-only ${
                    isActive ? 'text-ink' : isDone ? 'text-[#C9C2DD]' : 'text-[#A39CBC]'
                  }`}
                >
                  <span className="lg:sr-only">Step {step.number}: </span>
                  {step.title}
                  {isDone && <span className="sr-only"> (done)</span>}
                </span>
              </button>
              {!last && (
                <span
                  aria-hidden="true"
                  className={`mx-1 h-px flex-1 lg:hidden ${isDone ? 'bg-[rgba(164,136,255,0.6)]' : 'bg-white/[0.1]'}`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* ─── What to do ──────────────────────────────────────────────────────────── */

function PromptBlock({ prompt }: { prompt: string }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-white/[0.1] bg-[rgba(6,5,12,0.72)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] py-[8px] pr-2 pl-4">
        <span className={LABEL}>Prompt to use</span>
        <CopyButton text={prompt} label="Copy prompt" copiedLabel="Copied ✓" className={FOCUS} />
      </div>
      <p className="px-4 py-4 font-mono text-[13px] leading-[1.7] break-words whitespace-pre-wrap text-[#DCD5EE]">
        {prompt}
      </p>
    </div>
  )
}

/** The tools this step uses, with why — plus the editor's CTA and any alternatives. */
function StepTools({ step }: { step: GuideStep }) {
  if (!step.tools.length && !step.cta) return null
  return (
    <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.025] p-4">
      {step.tools.length > 0 && (
        <>
          <p className={LABEL}>{step.tools.length === 1 ? 'Tool for this step' : 'Tools for this step'}</p>
          <ul className="mt-3 flex list-none flex-col gap-4 p-0">
            {step.tools.map((tool) => (
              <li key={tool.name}>
                <GuideToolCard tool={tool} />
              </li>
            ))}
          </ul>
        </>
      )}

      {step.cta && (
        <a
          href={step.cta.url}
          target="_blank"
          rel="noreferrer noopener"
          className={`inline-flex items-center gap-2 rounded-pill border border-white/[0.12] px-[14px] py-[7px] text-[13px] font-semibold text-ink transition-[border-color,background-color] duration-200 hover:border-accent-line hover:bg-accent-wash hover:text-ink ${FOCUS} ${step.tools.length ? 'mt-4' : ''}`}
        >
          {step.cta.label}
          <ExternalIcon className="h-[14px] w-[14px]" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}

      {step.alternatives.length > 0 && (
        <div className="mt-4 border-t border-white/[0.07] pt-3">
          <p className="text-[13px] font-semibold text-[#C9C2DD]">Alternatives</p>
          <ul className="mt-1 flex list-none flex-col gap-1 p-0 text-[13px] leading-[1.55] text-pretty text-[#A39CBC]">
            {step.alternatives.map((tool) => (
              <li key={tool.name}>
                <span className="text-[#DCD5EE]">{tool.name}</span>
                {tool.why && <> — {tool.why}</>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StepPanel({
  step,
  total,
  hidden,
  headingRef,
  titleAs,
}: {
  step: GuideStep
  total: number
  hidden: boolean
  headingRef?: Ref<HTMLHeadingElement>
  titleAs: 'h3' | 'p'
}) {
  const Title = titleAs
  return (
    <div id={step.id} hidden={hidden} className="flex flex-col gap-6">
      {/* What am I doing */}
      <div>
        <Title
          ref={headingRef}
          tabIndex={-1}
          className="rounded-[6px] text-[clamp(21px,2.4vw,26px)] leading-[1.22] font-semibold tracking-[-0.026em] text-balance text-ink-bright outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <span className="sr-only">
            Step {step.number} of {total}:{' '}
          </span>
          {step.title}
        </Title>
        {step.body && <p className="mt-2 text-[15.5px] leading-[1.6] text-pretty text-[#C9C2DD]">{step.body}</p>}
        {step.prompt && !step.body && (
          <p className="mt-2 text-[15.5px] leading-[1.6] text-pretty text-[#C9C2DD]">
            Copy the prompt, adjust the details to your own situation, then run it.
          </p>
        )}

        {/* Why — the article's explanation, folded so the step stays scannable. */}
        {step.explanation.length > 0 && (
          <details className="group mt-3">
            <summary
              className={`inline-flex cursor-pointer list-none items-center gap-2 rounded-[6px] text-[13.5px] font-semibold text-accent select-none hover:text-link-hover [&::-webkit-details-marker]:hidden ${FOCUS}`}
            >
              <span
                aria-hidden="true"
                className="inline-block transition-transform duration-200 group-open:rotate-90"
              >
                ›
              </span>
              Why this step matters
            </summary>
            <div className="mt-2 flex flex-col gap-2 border-l-2 border-[rgba(178,150,255,0.35)] pl-4">
              {step.explanation.map((paragraph) => (
                <p key={paragraph} className="text-[14.5px] leading-[1.65] text-pretty text-[#C9C2DD]">
                  {paragraph}
                </p>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Which tool, and why */}
      <StepTools step={step} />

      {/* What exactly to do */}
      {step.instructions.length > 0 && (
        <div>
          <p className={LABEL}>Do this</p>
          <ol className="mt-3 flex list-none flex-col gap-3 p-0">
            {step.instructions.map((instruction, index) => (
              <li key={instruction} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[rgba(124,88,244,0.2)] text-[11px] font-bold text-[#C8AEFF] tabular-nums"
                >
                  {index + 1}
                </span>
                <span className="text-[15px] leading-[1.55] text-pretty text-[#DCD5EE]">{instruction}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {step.prompt && <PromptBlock prompt={step.prompt} />}

      {step.tips.length > 0 && (
        <div className="flex gap-3 text-[14px] leading-[1.6] text-pretty text-[#E9E1C4]">
          <BulbIcon className="mt-[2px] h-[18px] w-[18px] flex-none text-[#F5D565]" />
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
          <p className={LABEL}>Step resources</p>
          <ResourceList resources={step.resources} className="mt-2" />
        </div>
      )}

      {/* What result to expect — last, right above "what's next". */}
      {step.expectedOutcome && (
        <p className="flex gap-3 rounded-[14px] border border-[rgba(143,227,176,0.22)] bg-[rgba(143,227,176,0.06)] px-4 py-3 text-[14.5px] leading-[1.55] text-pretty text-[#D6EEDF]">
          <CheckIcon className="mt-[3px] h-4 w-4 flex-none text-[#8FE3B0]" />
          <span>
            <span className="font-semibold">You should now have: </span>
            {step.expectedOutcome}
          </span>
        </p>
      )}
    </div>
  )
}

/* ─── What's next ─────────────────────────────────────────────────────────── */

const PRIMARY = `group inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill border border-white/[0.16] bg-[image:var(--gradient-cta)] px-[22px] py-[12px] text-[14.5px] font-semibold text-white shadow-button transition-[box-shadow] duration-300 hover:text-white hover:shadow-button-hover ${FOCUS}`
const SECONDARY = `inline-flex cursor-pointer items-center justify-center rounded-pill border border-white/[0.1] px-5 py-[11px] text-[14px] font-medium text-[#C9C2DD] transition-[border-color,color,background-color] duration-200 hover:border-accent-line hover:bg-accent-wash hover:text-ink ${FOCUS}`

function Completion({
  total,
  resultHref,
  resultLabel,
  onRestart,
  focusRef,
}: {
  total: number
  resultHref: string
  resultLabel: string
  onRestart: () => void
  focusRef: Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role="status"
      className="mt-8 rounded-[18px] outline-none border border-[rgba(178,150,255,0.28)] bg-[linear-gradient(135deg,rgba(124,88,244,0.2),rgba(124,88,244,0.04))] p-5 sm:p-6"
    >
      <p className="flex items-center gap-3 text-[17px] font-semibold tracking-[-0.015em] text-ink">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[linear-gradient(180deg,#9B7BFF,#6A45EE)] text-white shadow-[0_0_18px_rgba(150,110,255,0.6)]">
          <CheckIcon className="h-4 w-4" />
        </span>
        Workflow complete
      </p>
      <p className="mt-2 text-[14.5px] leading-[1.6] text-pretty text-[#C9C2DD]">
        You’ve worked through all {total} steps. Any step can still be reopened from the list.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <a href={resultHref} className={PRIMARY}>
          {resultLabel}
          <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-[3px]" />
        </a>
        <button type="button" onClick={onRestart} className={SECONDARY}>
          Start over
        </button>
      </div>
    </div>
  )
}

export default function WorkflowStepper({
  guideKey,
  steps,
  stepTitleAs = 'h3',
  resultHref,
  resultLabel,
}: WorkflowStepperProps) {
  const { active, completed, finished, goTo, completeAndContinue, reset } = useGuideProgress(
    guideKey,
    steps.length,
  )
  const windowRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const completionRef = useRef<HTMLDivElement>(null)
  const movedRef = useRef(false)

  useEffect(() => {
    if (!movedRef.current) return
    headingRef.current?.focus({ preventScroll: true })
    const top = windowRef.current?.getBoundingClientRect().top ?? 0
    if (top < 0) windowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [active])

  // Finishing does not change the step, so it gets its own focus move: onto
  // the completion message, which a screen reader then reads out.
  useEffect(() => {
    if (movedRef.current && finished) completionRef.current?.focus({ preventScroll: false })
  }, [finished])

  const move = (action: () => void) => {
    movedRef.current = true
    action()
  }

  const step = steps[active]
  if (!step) return null
  const next = steps[active + 1]
  const isLast = !next
  const isDone = completed.has(active)
  const showCompletion = finished && isLast
  // The last step is done but an earlier one was skipped: send the reader back to it.
  const firstOpen = steps.findIndex((_, index) => !completed.has(index))
  const backToOpen = isLast && isDone && firstOpen >= 0

  return (
    <div ref={windowRef} className={`${WINDOW} scroll-mt-[176px]`}>
      <WindowRim />
      <ProgressHeader steps={steps} active={active} completed={completed} finished={finished} />

      <div className="grid gap-6 px-5 pt-5 pb-6 sm:px-7 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-0 lg:p-0">
        <div className="min-w-0 lg:border-r lg:border-white/[0.07] lg:p-4">
          <StepRail steps={steps} active={active} completed={completed} onSelect={(index) => move(() => goTo(index))} />
        </div>

        <div className="min-w-0 lg:px-9 lg:pt-8 lg:pb-9">
          <div className="max-w-[700px]">
            <p className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.18em] text-accent uppercase">
              Step {step.number}
              {isDone && (
                <span className="inline-flex items-center gap-1 rounded-pill bg-[rgba(143,227,176,0.1)] px-2 py-[2px] text-[10.5px] tracking-[0.08em] text-[#8FE3B0]">
                  <CheckIcon className="h-3 w-3" /> Done
                </span>
              )}
            </p>

            {steps.map((candidate, index) => (
              <StepPanel
                key={candidate.id}
                step={candidate}
                total={steps.length}
                hidden={index !== active}
                headingRef={index === active ? headingRef : undefined}
                titleAs={stepTitleAs}
              />
            ))}

            {showCompletion ? (
              <Completion
                total={steps.length}
                resultHref={resultHref}
                resultLabel={resultLabel}
                onRestart={() => move(reset)}
                focusRef={completionRef}
              />
            ) : (
              <div className="mt-8 flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-6 sm:flex-row sm:items-center">
                {active > 0 && (
                  <button type="button" onClick={() => move(() => goTo(active - 1))} className={SECONDARY}>
                    <span aria-hidden="true" className="mr-2">
                      ←
                    </span>
                    Previous<span className="sr-only"> step</span>
                  </button>
                )}
                <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row sm:items-center sm:gap-4">
                  {next && (
                    <p className="text-[13px] leading-[1.4] text-[#A39CBC] sm:max-w-[240px] sm:text-right">
                      Up next: <span className="text-[#DCD5EE]">{next.title}</span>
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => move(backToOpen ? () => goTo(firstOpen) : completeAndContinue)}
                    className={PRIMARY}
                  >
                    {backToOpen
                      ? `Back to step ${firstOpen + 1}`
                      : isLast
                        ? 'Mark done & finish'
                        : isDone
                          ? 'Next step'
                          : 'Mark done & continue'}
                    <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-[3px]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
