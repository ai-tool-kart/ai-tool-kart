import { useEffect, useRef, useState } from 'react'
import { BoltIcon, SavingsRowIconGlyph } from '@/components/savings/icons'
import { SAVINGS_COPY } from '@/data/savings'
import type { WorkSavingsEstimate } from '@/types/workSavings'

/*
 * What a selected role's week looks like.
 *
 * Source: AI Tool Kart Site.dc.html, the `savMetrics` / `savRows` block inside
 * the savings selector card: three metric rows, then the same Time / Cost /
 * Effort comparison narrowed to this kind of work, then the footnote.
 *
 * ── Every figure here is written, not computed ───────────────────────────────
 *
 * There is no arithmetic in this file and there must never be. The hours, the
 * percentage range and the effort phrase are read straight off the record; the
 * only number this component derives is the intermediate frame of the count-up
 * below, which is a rendering detail and never displayed as a result.
 *
 * The footnote says what the numbers are. The handoff's own footnote read
 * "Median across a typical week", which claims a measurement nobody made — see
 * SAVINGS_COPY in data/savings.ts for what replaced it and why.
 */

/** Column tints, matching the general table's. */
const CELL_NEUTRAL = 'bg-[linear-gradient(180deg,rgba(12,14,13,0.9),rgba(8,10,9,0.92))]'
const CELL_WITHOUT = 'bg-[linear-gradient(180deg,rgba(14,12,12,0.9),rgba(9,8,8,0.92))]'
const CELL_WITH = 'bg-[linear-gradient(180deg,rgba(10,22,17,0.92),rgba(7,16,12,0.94))]'

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
 *    early would print a number the catalogue never said;
 *  - it respects `prefers-reduced-motion` by jumping straight there;
 *  - it cancels on unmount and on a change mid-flight, so two rapid selections
 *    cannot leave two animations fighting over one number.
 *
 * rAF rather than the handoff's `setInterval`: same effect, but it stops when
 * the tab is hidden and never queues frames the browser will not paint.
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

interface RoleSavingsPanelProps {
  estimate: WorkSavingsEstimate
}

export default function RoleSavingsPanel({ estimate }: RoleSavingsPanelProps) {
  const hours = useCountUp(estimate.hoursSavedPerWeek)

  return (
    /*
     * `key` on the role means React remounts this subtree when the selection
     * changes, which is what re-runs the entrance animation — the handoff swaps
     * between two keyframes to force the same restart.
     */
    <div key={estimate.id} className="mt-4 [animation:akRise_.42s_cubic-bezier(.16,.84,.44,1)_both]">
      <div className="flex flex-col gap-2">
        <div className={METRIC_ROW}>
          <span className="flex flex-none items-center gap-2">
            <SavingsRowIconGlyph icon="time" className="h-[14px] w-[14px] text-[#8FE3B8]" />
            <span className={METRIC_LABEL}>{SAVINGS_COPY.metricLabels.time}</span>
          </span>
          {/*
           * `tabular-nums` so the digits do not reflow while counting, and
           * aria-live off: a number ticking up would be announced repeatedly.
           * The settled value is in the DOM for a screen reader to read on
           * demand, which is the right amount of noise for a figure like this.
           */}
          <span className={`${METRIC_VALUE} text-[27px] tabular-nums`}>{hours} hrs/week</span>
        </div>

        <div className={METRIC_ROW}>
          <span className="flex flex-none items-center gap-2">
            <SavingsRowIconGlyph icon="cost" className="h-[14px] w-[14px] text-[#8FE3B8]" />
            <span className={METRIC_LABEL}>{SAVINGS_COPY.metricLabels.cost}</span>
          </span>
          <span className={`${METRIC_VALUE} text-[27px]`}>{estimate.costSaved}</span>
        </div>

        <div className={METRIC_ROW}>
          <span className="flex flex-none items-center gap-2">
            <BoltIcon className="h-[14px] w-[14px] text-[#8FE3B8]" />
            <span className={METRIC_LABEL}>{SAVINGS_COPY.metricLabels.effort}</span>
          </span>
          <span className={`${METRIC_VALUE} text-[16.5px]`}>{estimate.effortSaved}</span>
        </div>
      </div>

      {/*
       * The same three dimensions as the general table, narrowed to this role,
       * and stacked: the dimension sits on its own full-width row above its two
       * cells, which is the handoff's layout and keeps the sentences readable in
       * a 340px column.
       *
       * Still a real table. The column names are visually carried by the general
       * table above and would be noise repeated here, so they live in an
       * `sr-only` <thead> — a screen reader still hears "Time, Without AI, …"
       * rather than six unlabelled cells.
       */}
      <table className="mt-[10px] w-full table-fixed border-separate border-spacing-px overflow-hidden rounded-[18px] border border-white/[0.075] bg-white/[0.05]">
        <caption className="sr-only">
          What changes for a {estimate.role.toLowerCase()}, without AI and with it
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Without AI</th>
            <th scope="col">With AI</th>
          </tr>
        </thead>
        {estimate.rows.map((row) => (
          <tbody key={row.dimension}>
            <tr>
              <th
                scope="colgroup"
                colSpan={2}
                className={`${CELL_NEUTRAL} px-[15px] py-[9px] text-left text-[10.5px] font-semibold tracking-[0.16em] text-[#8A968F] uppercase`}
              >
                {row.dimension}
              </th>
            </tr>
            <tr>
              <td
                className={`${CELL_WITHOUT} px-[15px] py-[13px] align-middle text-[13px] leading-[1.45] tracking-[-0.006em] text-pretty text-[#96909A]`}
              >
                {row.without}
              </td>
              <td
                className={`${CELL_WITH} px-[15px] py-[13px] align-middle text-[13px] leading-[1.45] font-semibold tracking-[-0.008em] text-pretty text-[#A9EFC9]`}
              >
                {row.withAi}
              </td>
            </tr>
          </tbody>
        ))}
      </table>

      <p className="mt-[11px] text-[12.5px] tracking-[-0.004em] text-[#6F8378]">
        {SAVINGS_COPY.estimateNote}
      </p>
    </div>
  )
}
