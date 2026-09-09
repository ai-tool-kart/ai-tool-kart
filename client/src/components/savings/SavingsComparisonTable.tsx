import { SavingsRowIconGlyph } from '@/components/savings/icons'
import { GENERAL_SAVINGS_ROWS } from '@/data/savings'

/*
 * The general Time / Cost / Effort comparison.
 *
 * Source: AI Tool Kart Site.dc.html, the `savingsRows` table inside
 * `data-screen-label="Savings"`. Three columns over three rows, built as the
 * handoff builds it — a 1px-gap flex grid whose "borders" are the container's
 * background showing through between cells, which is what lets each column carry
 * its own tint without a border colour fighting it.
 *
 * ── Semantics ────────────────────────────────────────────────────────────────
 *
 * A real <table> with a real <thead>, not the handoff's nest of divs. This IS
 * tabular data — three dimensions against two conditions — and the markup should
 * say so: a screen reader announces "Time, Without AI, 20+ hrs a week" instead
 * of reading nine disconnected cells. The visual result is identical, because
 * the layout is driven by the same flex rules either way.
 *
 * ── The content is editorial ─────────────────────────────────────────────────
 *
 * Nothing here is computed from the catalogue and nothing is fetched. See
 * data/savings.ts, which also holds every sentence in this section that makes a
 * claim.
 */

/** Column tints. The design gives each condition its own ground. */
const CELL_NEUTRAL = 'bg-[linear-gradient(180deg,rgba(12,14,13,0.9),rgba(8,10,9,0.92))]'
const CELL_WITHOUT = 'bg-[linear-gradient(180deg,rgba(14,12,12,0.9),rgba(9,8,8,0.92))]'
const CELL_WITH = 'bg-[linear-gradient(180deg,rgba(10,22,17,0.92),rgba(7,16,12,0.94))]'

/*
 * Cell padding tightens below `sm`. At a 360px viewport the table has about
 * 294px to work with, and the design's 20px padding on every cell leaves the
 * first column too narrow for the word "Dimension" to fit at all.
 */
const HEAD =
  'px-3 py-[15px] text-[10px] tracking-[0.1em] uppercase text-left font-normal sm:px-5 sm:text-[11px] sm:tracking-[0.16em]'
const CELL = 'px-3 py-4 sm:p-5'
/*
 * The dimension column takes a larger share on narrow screens, where a
 * percentage of a small table is a very small column. Above `sm` it is the
 * design's own proportion.
 */
const DIMENSION_COL = 'w-[34%] sm:w-[28%]'

export default function SavingsComparisonTable() {
  return (
    <div className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-white/[0.055] shadow-[inset_0_1px_0_rgba(224,244,232,0.14),0_2px_6px_rgba(0,0,0,0.45),0_36px_68px_-44px_rgba(0,0,0,0.95)]">
      {/*
       * `border-separate` with a 1px spacing reproduces the handoff's hairlines:
       * the container's translucent background shows through the gaps, so the
       * rules are the same colour as the panel edge and need no border of their
       * own. `w-full` with `table-fixed` keeps the three columns from being
       * re-proportioned by whichever cell happens to hold the longest sentence.
       */}
      <table className="w-full table-fixed border-separate border-spacing-px bg-white/[0.05]">
        <thead>
          <tr>
            <th scope="col" className={`${HEAD} ${CELL_NEUTRAL} ${DIMENSION_COL} text-[#6F7A74]`}>
              Dimension
            </th>
            <th scope="col" className={`${HEAD} ${CELL_WITHOUT} text-[#8A8288]`}>
              Without AI
            </th>
            <th scope="col" className={`${HEAD} ${CELL_WITH} text-[#8FE3B8]`}>
              With AI
            </th>
          </tr>
        </thead>
        <tbody>
          {GENERAL_SAVINGS_ROWS.map((row) => (
            <tr key={row.dimension}>
              <th scope="row" className={`${CELL_NEUTRAL} ${CELL} text-left align-middle font-normal`}>
                <span className="flex items-center gap-[11px]">
                  {/* Decorative: the label carries the meaning, so it goes first when the
                      column has no room for both. */}
                  <span className="hidden h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] border border-white/[0.09] bg-white/[0.03] text-[#A9B4AE] sm:flex">
                    <SavingsRowIconGlyph icon={row.icon} className="h-4 w-4" />
                  </span>
                  <span className="text-[15px] font-semibold tracking-[-0.014em] text-[#EDF1EF]">
                    {row.dimension}
                  </span>
                </span>
              </th>
              <td
                className={`${CELL_WITHOUT} ${CELL} align-middle text-[14.5px] leading-[1.45] tracking-[-0.008em] break-words text-pretty text-[#96909A]`}
              >
                {row.without}
              </td>
              <td className={`${CELL_WITH} ${CELL} align-middle`}>
                <span className="block text-[16px] font-bold tracking-[-0.02em] text-[#A9EFC9] sm:text-[18px]">
                  {row.withAi}
                </span>
                {/* `break-words`: at a 320px viewport a single long word ("subscriptions.")
                    is wider than the column, and without this it spills past the
                    cell's tint rather than wrapping. */}
                <span className="mt-1 block text-[12.5px] break-words text-pretty text-[#7A9689]">
                  {row.note}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
