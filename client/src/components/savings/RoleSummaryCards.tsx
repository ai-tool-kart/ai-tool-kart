import { useEffect, useRef, useState } from 'react'
import { BoltIcon, SavingsRowIconGlyph } from '@/components/savings/icons'
import { SAVINGS_COPY } from '@/data/savings'
import type { WorkSavingsEstimate } from '@/types/workSavings'

/*
 * The three summary cards for a selected kind of work.
 *
 * Source: AI Tool Kart Site.dc.html, the `savMetrics` block inside the savings
 * selector card: time saved, cost saved, effort reduced.
 *
 * ── What this used to be ─────────────────────────────────────────────────────
 *
 * This was RoleSavingsPanel, and it drew these three cards AND a second, smaller
 * Time/Cost/Effort comparison beneath them. That nested table showed exactly the
 * data the main table now shows, so it has been removed rather than moved: two
 * tables of the same three rows, a column apart, is the same fact twice. The
 * main comparison is the one table, and it is role-specific.
 *
 * ── Every figure here is written, not computed ───────────────────────────────
 *
 * There is no arithmetic in this file and there must never be. The hours, the
 * percentage range and the effort phrase are read straight off the record; the
 * only number derived anywhere is the intermediate frame of the count-up below,
 * which is a rendering detail and never a displayed result.
 *
 * The cards and the comparison table read the SAME record — the section resolves
 * one estimate and hands it to both — so the two halves of the section cannot
 * disagree about a role.
 */

const METRIC_ROW =
  'flex items-center gap-3 rounded-tile border border-[rgba(120,226,172,0.24)] bg-[linear-gradient(180deg,rgba(74,208,148,0.13)_0%,rgba(74,208,148,0.04)_100%)] px-4 py-[13px] shadow-[inset_0_1px_0_rgba(196,246,220,0.2)]'
const METRIC_LABEL = 'text-[10.5px] tracking-[0.17em] uppercase text-[#7FA491]'
const METRIC_VALUE =
  'min-w-0 flex-auto text-right font-bold leading-[1.22] tracking-[-0.026em] text-pretty text-[#DFFAEC]'

/**
 * Counts from the previous hours figure to the new one.
 *
 * The handoff tweens this number on every role change (`tweenSavHrs`, 640ms,
 * cubic ease-out) and it is the section's one piece of motion, so it is kept.
 * Three things it does that a naive interval does not:
 *
 *  - it settles EXACTLY on the target, so the displayed figure is always the
 *    record's own value once the animation ends — a tween that stops a frame
 *    early would print a number the record never said;
 *  - it respects `prefers-reduced-motion` by jumping straight there;
 *  - it cancels on unmount and on a change mid-flight, so two rapid selections
 *    cannot leave two animations fighting over one number.
 *
 * rAF rather than the handoff's `setInterval`: same effect, but it stops when
 * the tab is hidden and never queues frames the browser will not paint. When the
 * tab comes back the first live frame is already past the duration, so it
 * settles on the target rather than resuming a stale animation.
 */
function useCountUp(target: number): number {
  const [value, setValue] = useState(target)
  /*
   * The live figure, mirrored into a ref.
   *
   * The effect needs to know where to count FROM without depending on the state
   * it is setting — a dependency on `value` would tear the tween down and
   * rebuild it on every frame. Writing each frame to the ref as well keeps an
   * interrupted tween continuing from where it stopped rather than snapping
   * back, and needs no lint suppression to do it.
   */
  const currentRef = useRef(target)

  useEffect(() => {
    const from = currentRef.current
    if (from === target) return

    const settle = (next: number) => {
      currentRef.current = next
      setValue(next)
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      settle(target)
      return
    }

    const DURATION = 640
    const start = performance.now()
    let frame = requestAnimationFrame(function step(now: number) {
      const progress = Math.min(1, (now - start) / DURATION)
      const eased = 1 - Math.pow(1 - progress, 3)
      // Settles EXACTLY on the target: a tween stopping a frame early would
      // print a number the record never said.
      settle(progress >= 1 ? target : Math.round(from + (target - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(step)
    })

    return () => cancelAnimationFrame(frame)
  }, [target])

  return value
}

interface RoleSummaryCardsProps {
  estimate: WorkSavingsEstimate
}

export default function RoleSummaryCards({ estimate }: RoleSummaryCardsProps) {
  const hours = useCountUp(estimate.hoursSavedPerWeek)

  return (
    <div className="mt-4 flex flex-col gap-2 [animation:akFade_.32s_ease-out_both]">
      <div className={METRIC_ROW}>
        <span className="flex flex-none items-center gap-2">
          <SavingsRowIconGlyph dimension="Time" className="h-[14px] w-[14px] text-[#8FE3B8]" />
          <span className={METRIC_LABEL}>{SAVINGS_COPY.metricLabels.time}</span>
        </span>
        {/*
         * `tabular-nums` so the digits do not reflow while counting. No
         * aria-live: a number ticking up would be announced on every frame, and
         * the settled value is in the DOM to be read on demand.
         */}
        <span className={`${METRIC_VALUE} text-[24px] tabular-nums sm:text-[27px]`}>
          {hours} hrs/week
        </span>
      </div>

      <div className={METRIC_ROW}>
        <span className="flex flex-none items-center gap-2">
          <SavingsRowIconGlyph dimension="Cost" className="h-[14px] w-[14px] text-[#8FE3B8]" />
          <span className={METRIC_LABEL}>{SAVINGS_COPY.metricLabels.cost}</span>
        </span>
        <span className={`${METRIC_VALUE} text-[24px] sm:text-[27px]`}>{estimate.costSaved}</span>
      </div>

      <div className={METRIC_ROW}>
        <span className="flex flex-none items-center gap-2">
          <BoltIcon className="h-[14px] w-[14px] text-[#8FE3B8]" />
          <span className={METRIC_LABEL}>{SAVINGS_COPY.metricLabels.effort}</span>
        </span>
        <span className={`${METRIC_VALUE} text-[15px] sm:text-[16.5px]`}>
          {estimate.effortSaved}
        </span>
      </div>
    </div>
  )
}
