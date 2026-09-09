import { useMemo, useState } from 'react'
import { ChevronDownIcon, InfoIcon, PersonIcon } from '@/components/savings/icons'
import RoleSummaryCards from '@/components/savings/RoleSummaryCards'
import SavingsComparisonTable from '@/components/savings/SavingsComparisonTable'
import SavingsValueStrip from '@/components/savings/SavingsValueStrip'
import Select from '@/components/ui/Select'
import { GENERAL_SAVINGS_ROWS, SAVINGS_COPY, type SavingsTableRow } from '@/data/savings'
import { useWorkSavings } from '@/hooks/useWorkSavings'

/*
 * "See What AI Can Save You" — the value section.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="Savings"`. It follows
 * How People Are Using AI in the final design, and does so here.
 *
 * ── The layout, and why it is this way round ─────────────────────────────────
 *
 *   [ role selector + summary cards ]   [ comparison table ]
 *
 * The picker leads and the table answers. The section's earlier arrangement put
 * a static table first and the picker beside it, which read as two unrelated
 * panels — nothing on the left moved when the right-hand control changed. Now
 * the left column is the input and the right column is its output, so the
 * cause-and-effect is the reading order.
 *
 * ── One record feeds both columns ────────────────────────────────────────────
 *
 *   selected role
 *        ↓
 *   one WorkSavingsEstimate
 *        ↓
 *   summary cards (left)  +  comparison rows (right)
 *
 * `selected` below is resolved once and handed to both. Neither column holds
 * data of its own and neither can be refreshed independently, so the two cannot
 * disagree about a role — the failure mode of keeping "the cards' role" and
 * "the table's role" as separate state.
 *
 * ── Default state ────────────────────────────────────────────────────────────
 *
 * Before a role is chosen the table shows the generic benchmark rows
 * (data/savings.ts). Not an empty table, and not a role picked on the reader's
 * behalf: the section opens by saying what AI-assisted work looks like in
 * general, which is the honest answer to a question nobody has narrowed yet.
 * Those same rows are what stays on screen if the estimates cannot be loaded.
 *
 * ── What these numbers are ───────────────────────────────────────────────────
 *
 * Written estimates, not measurements. The handoff's subtitle claimed "medians
 * from our own test logs"; there are no test logs, so that sentence is not
 * carried over. Every claim in this section lives in SAVINGS_COPY. See
 * data/savings.ts.
 *
 * ── Not the assistant ────────────────────────────────────────────────────────
 *
 * This picker talks to nothing. It reads a written estimate off a record the
 * page already holds; there is no model call, no retrieval and no conversation.
 * Role names stay compatible with the catalogue's vocabulary (`catalogueRole` on
 * the server) so the two never drift, but that is a shared vocabulary rather
 * than a shared system.
 */

export default function SavingsSection() {
  const { estimates, isLoading, failed } = useWorkSavings()
  const [role, setRole] = useState('')

  const roles = useMemo(() => estimates.map((estimate) => estimate.role), [estimates])

  /** The one record everything on screen is drawn from. */
  const selected = useMemo(
    () => estimates.find((estimate) => estimate.role === role),
    [estimates, role],
  )

  /*
   * The table's rows and the cards' figures come from the same `selected`, so
   * there is exactly one thing to change when the dropdown changes.
   */
  const rows: readonly SavingsTableRow[] = selected ? selected.rows : GENERAL_SAVINGS_ROWS
  const sourceKey = selected ? selected.id : 'general'
  const tableCaption = selected
    ? `An indicative week for a ${selected.role.toLowerCase()}, without AI and with it`
    : 'An indicative week of AI-assisted work in general, without AI and with it'

  // The picker is dead weight until it has answers to give.
  const selectorDisabled = isLoading || failed || roles.length === 0

  return (
    <section className="relative pt-[92px] pb-[88px]">
      {/* The green band, and the hairlines that open and close it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,26,20,0)_0%,rgba(8,26,20,0.72)_14%,rgba(8,26,20,0.72)_86%,rgba(8,26,20,0)_100%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[6%] left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.09),transparent)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] bottom-0 left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.055),transparent)]"
      />
      {/* The slow green bloom behind the columns. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[62%] left-1/2 h-[340px] w-[min(820px,90%)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(54%_54%_at_50%_50%,rgba(74,208,148,0.14)_0%,transparent_72%)] blur-[42px] [animation:akBloomPulse_15s_ease-in-out_infinite]"
      />

      {/* The design narrows this section to 1080px, tighter than the rest. */}
      <div className="relative mx-auto max-w-[1080px] px-8">
        <div data-reveal="0" className="text-center">
          <div className="text-[11.5px] tracking-[0.2em] text-[#8FE3B8] uppercase">
            {SAVINGS_COPY.eyebrow}
          </div>
          <h2 className="mx-auto mt-3 text-[clamp(30px,3.2vw,40px)] leading-[1.08] font-bold tracking-[-0.032em] text-pretty text-ink">
            {SAVINGS_COPY.heading}
          </h2>
          <p className="mx-auto mt-[14px] max-w-[58ch] text-[15px] leading-[1.62] tracking-[-0.006em] text-pretty text-muted-dim">
            {SAVINGS_COPY.subtitle}
          </p>
        </div>

        {/*
         * Two columns as flex bases rather than a grid, so they wrap to a single
         * column on their own at the width the table would start squeezing.
         * `items-stretch` is what keeps the two panels the same height when they
         * are side by side, which the earlier arrangement did not do.
         *
         * The table takes the larger share (5 : 4). It carries nine cells of
         * prose; the selector carries a field and three short cards.
         */}
        <div data-reveal="0.06" className="mt-[30px] flex flex-wrap items-stretch gap-5">
          {/* ── Input: the picker and what it means for this reader ────────── */}
          <div className="flex min-w-[min(100%,320px)] flex-[4_1_380px] flex-col">
            <h3 className="text-[clamp(19px,1.7vw,22px)] leading-[1.18] font-bold tracking-[-0.026em] text-pretty text-[#F1F6F3]">
              {SAVINGS_COPY.selectorHeading}
            </h3>
            <p className="mt-2 text-[13.5px] leading-[1.55] tracking-[-0.006em] text-pretty text-muted-dim">
              {SAVINGS_COPY.selectorSubtitle}
            </p>

            {/* `flex-auto` so the panel fills the column and the two sides end
                level on a wide screen. */}
            <div className="mt-[18px] flex flex-auto flex-col rounded-[26px] border border-[rgba(120,226,172,0.2)] bg-[linear-gradient(180deg,rgba(11,27,20,0.94)_0%,rgba(7,15,12,0.96)_100%)] p-[18px] shadow-[inset_0_1px_0_rgba(196,246,220,0.15),0_2px_6px_rgba(0,0,0,0.45),0_34px_64px_-46px_rgba(0,0,0,0.95),0_0_64px_-44px_rgba(74,208,148,0.55)]">
              <label htmlFor="savings-role" className="sr-only">
                {SAVINGS_COPY.selectorLabel}
              </label>
              {/*
               * The two glyphs the handoff draws inside the field. They sit over
               * the select and are `pointer-events-none`, so every click, tap and
               * keystroke still reaches the real control underneath.
               */}
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-[15px] flex -translate-y-1/2 items-center text-[#8FE3B8]"
                >
                  <PersonIcon className="h-[15px] w-[15px]" />
                </span>
                <Select
                  id="savings-role"
                  variant="savings"
                  value={role}
                  onChange={setRole}
                  options={roles}
                  placeholder={SAVINGS_COPY.selectorPlaceholder}
                  disabled={selectorDisabled}
                  className={role ? 'text-[#EDF1EF]' : 'text-[#7E8B84]'}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-[15px] flex -translate-y-1/2 items-center text-[#71857C]"
                >
                  <ChevronDownIcon className="h-[14px] w-[14px]" />
                </span>
              </div>

              {selected ? (
                <RoleSummaryCards estimate={selected} />
              ) : (
                /*
                 * The idle panel, which doubles as the failure state: if the
                 * estimates never arrive the picker is disabled and this says so
                 * in one quiet line. No banner and no retry — the table beside it
                 * is unaffected and still answers the section's question.
                 */
                <p className="mt-4 flex items-start gap-[10px] rounded-tile border border-dashed border-[rgba(120,226,172,0.2)] bg-[rgba(74,208,148,0.045)] px-[17px] py-[15px] text-[13.5px] leading-[1.5] tracking-[-0.006em] text-pretty text-[#7E8B84]">
                  <InfoIcon className="mt-[2px] h-4 w-4 flex-none text-[#5F7B6E]" />
                  <span>
                    {failed
                      ? SAVINGS_COPY.unavailable
                      : role
                        ? SAVINGS_COPY.missingEstimate
                        : SAVINGS_COPY.idle}
                  </span>
                </p>
              )}

              {/*
               * The caveat sits with the headline figures rather than under the
               * table, because these three cards are where a number is most
               * likely to be taken at face value. `mt-auto` pins it to the foot
               * of the panel so it reads as a footnote at any panel height.
               */}
              <p className="mt-auto pt-4 text-[12.5px] leading-[1.5] tracking-[-0.004em] text-[#6F8378]">
                {SAVINGS_COPY.estimateNote}
              </p>
            </div>
          </div>

          {/* ── Output: the comparison, for whatever is selected ───────────── */}
          <div className="flex min-w-[min(100%,320px)] flex-[5_1_460px] flex-col gap-4">
            <SavingsComparisonTable rows={rows} sourceKey={sourceKey} caption={tableCaption} />
            <SavingsValueStrip />
          </div>
        </div>
      </div>
    </section>
  )
}
