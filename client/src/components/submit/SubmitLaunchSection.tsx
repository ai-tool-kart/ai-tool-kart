import { useEffect, useMemo } from 'react'
import SubmitSectionCard from '@/components/submit/SubmitSectionCard'
import type { LaunchPlan } from '@/types/submit'
import { buildLaunchWeeks, LAUNCH_WEEKS_OUT, type LaunchWeek } from '@/utils/launchWeeks'

/*
 * Step 4 — brofindai's "Pricing & Scheduling": a Free vs. paid launch plan,
 * then a calendar of launch weeks (utils/launchWeeks.ts).
 */

const STATUS_LABEL: Record<LaunchWeek['status'], string> = {
  featuredOnly: 'Featured only',
  open: 'Open',
}

const STATUS_DOT: Record<LaunchWeek['status'], string> = {
  featuredOnly: 'bg-[#E5C48C] shadow-[0_0_8px_1px_rgba(214,172,104,0.55)]',
  open: 'bg-[#9BE7C4] shadow-[0_0_8px_1px_rgba(120,220,170,0.55)]',
}

interface SubmitLaunchSectionProps {
  plan: LaunchPlan
  onPlanChange: (plan: LaunchPlan) => void
  launchWeekId: string
  onLaunchWeekChange: (id: string) => void
  /** Validation messages keyed by field name, from a 400's `fields` map. */
  errors: Record<string, string>
}

export default function SubmitLaunchSection({
  plan,
  onPlanChange,
  launchWeekId,
  onLaunchWeekChange,
  errors,
}: SubmitLaunchSectionProps) {
  const weeks = useMemo(buildLaunchWeeks, [])
  const firstOpenWeek = weeks.find((week) => week.status === 'open')

  const isSelectable = (week: LaunchWeek) => plan === 'featured' || week.status !== 'featuredOnly'

  // If a plan switch makes the picked week unavailable, clear it rather than
  // silently keeping a selection the current plan can no longer honour.
  useEffect(() => {
    const selected = weeks.find((week) => week.id === launchWeekId)
    if (selected && !isSelectable(selected)) onLaunchWeekChange('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  return (
    <SubmitSectionCard
      step={4}
      title="Pricing & launch scheduler"
      description="Free listings queue in order; Featured skips the line and gets the week's homepage placement."
    >
      <div data-field="plan" className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Launch plan" aria-describedby={errors.plan ? 'plan-error' : undefined} className="grid gap-4 sm:grid-cols-2">
          <PlanCard
            active={plan === 'free'}
            onClick={() => onPlanChange('free')}
            name="Free launch"
            price="$0"
            blurb="Joins the queue in submission order."
            features={['Full catalogue listing', 'Standard review', `First open week: ${firstOpenWeek?.label ?? '—'}`]}
          />
          <PlanCard
            active={plan === 'featured'}
            onClick={() => onPlanChange('featured')}
            name="Featured launch"
            price="$19"
            blurb="Priority review and the pick of the calendar."
            features={['Everything in Free', 'Any open week, including this one', 'Homepage placement for the week']}
            highlight
          />
        </div>
        {errors.plan && (
          <span id="plan-error" role="alert" className="text-[12.5px] leading-[1.5] text-pink">
            {errors.plan}
          </span>
        )}
      </div>

      <div data-field="launchWeekId" className="flex flex-col gap-3">
        <span className="text-[13px] tracking-[0.05em] uppercase text-subtle">
          Launch week <span className="text-accent">*</span>
        </span>
        <p className="-mt-1 text-[12.5px] leading-[1.5] text-muted-dim">
          Free launches start {firstOpenWeek?.label ?? 'soon'}, about {LAUNCH_WEEKS_OUT} weeks out. Featured can take any
          open week on the board.
        </p>
        <div
          role="radiogroup"
          aria-label="Launch week"
          aria-describedby={errors.launchWeekId ? 'launchWeekId-error' : undefined}
          className="grid grid-cols-2 gap-[10px] sm:grid-cols-3"
        >
          {weeks.map((week) => {
            const selectable = isSelectable(week)
            const active = launchWeekId === week.id
            return (
              <button
                key={week.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!selectable}
                onClick={() => onLaunchWeekChange(week.id)}
                className={`flex flex-col items-start gap-[6px] rounded-field border px-[14px] py-[12px] text-left transition-[border-color,background-color,transform] duration-200 ${
                  active
                    ? 'border-[rgba(178,150,255,0.5)] bg-[linear-gradient(180deg,rgba(124,88,244,0.28)_0%,rgba(124,88,244,0.09)_100%)] shadow-[inset_0_1px_0_rgba(240,232,255,0.3)]'
                    : selectable
                      ? 'border-white/[0.09] bg-white/[0.03] hover:-translate-y-px hover:border-accent-line hover:bg-accent-wash'
                      : 'cursor-not-allowed border-white/[0.05] bg-white/[0.015] opacity-45'
                }`}
              >
                <span className="text-[13.5px] font-semibold text-ink">{week.label}</span>
                <span className="inline-flex items-center gap-[6px] text-[11.5px] text-muted-dim">
                  <span aria-hidden="true" className={`h-[6px] w-[6px] flex-none rounded-full ${STATUS_DOT[week.status]}`} />
                  {STATUS_LABEL[week.status]}
                </span>
              </button>
            )
          })}
        </div>
        {errors.launchWeekId && (
          <span id="launchWeekId-error" role="alert" className="text-[12.5px] leading-[1.5] text-pink">
            {errors.launchWeekId}
          </span>
        )}
      </div>
    </SubmitSectionCard>
  )
}

interface PlanCardProps {
  active: boolean
  onClick: () => void
  name: string
  price: string
  blurb: string
  features: string[]
  highlight?: boolean
}

function PlanCard({ active, onClick, name, price, blurb, features, highlight }: PlanCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`relative flex flex-col gap-3 rounded-panel border p-5 text-left transition-[border-color,background-color,transform,box-shadow] duration-300 ${
        active
          ? 'border-[rgba(178,150,255,0.55)] bg-[linear-gradient(180deg,rgba(124,88,244,0.22)_0%,rgba(124,88,244,0.06)_100%)] shadow-[0_18px_36px_-26px_rgba(124,88,244,0.9)]'
          : 'border-hairline-strong bg-white/[0.025] hover:-translate-y-px hover:border-accent-line'
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 right-5 rounded-tag bg-accent-wash-strong px-[9px] py-[4px] text-[10.5px] font-bold tracking-[0.05em] uppercase text-accent">
          Skip the queue
        </span>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[16px] font-semibold text-ink">{name}</span>
        <span className="text-[20px] font-bold tracking-[-0.02em] text-ink">{price}</span>
      </div>
      <p className="text-[13px] leading-[1.55] text-muted-dim">{blurb}</p>
      <ul className="mt-1 flex flex-col gap-[7px]">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-[8px] text-[12.5px] text-muted-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-[2px] h-[13px] w-[13px] flex-none text-accent">
              <path d="m4 12.5 5 5L20 6" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
    </button>
  )
}
