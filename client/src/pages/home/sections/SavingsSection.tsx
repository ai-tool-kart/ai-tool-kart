import { useMemo, useState } from 'react'
import { ChevronDownIcon, InfoIcon, PersonIcon } from '@/components/savings/icons'
import RoleSavingsPanel from '@/components/savings/RoleSavingsPanel'
import SavingsComparisonTable from '@/components/savings/SavingsComparisonTable'
import SavingsValueStrip from '@/components/savings/SavingsValueStrip'
import Select from '@/components/ui/Select'
import { SAVINGS_COPY } from '@/data/savings'
import { useWorkSavings } from '@/hooks/useWorkSavings'

/*
 * "See What AI Can Save You" — the value section.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="Savings"`. It follows
 * How People Are Using AI in the final design, and does so here. A green-lit
 * band: the general comparison and its value strip on the left, a role picker
 * and its answer on the right.
 *
 * ── Two halves, two lifetimes ────────────────────────────────────────────────
 *
 * The left side is STATIC EDITORIAL CONTENT (data/savings.ts). The right side is
 * BACKEND-DRIVEN (GET /api/work-savings). That split is the section's whole
 * failure story: when the endpoint is unreachable the table, the strip and the
 * heading are all still on screen and still true, and only the picker degrades.
 * Putting the general table behind the same request would have thrown away the
 * part of the section that never needed to be fetched.
 *
 *   SavingsSection
 *     ├─ data/savings.ts                                   (static, always there)
 *     └─ useWorkSavings → services/workSavings.ts
 *                           → GET /api/work-savings        (one request, cached)
 *
 * Selecting a role is local state over the fetched set — no request per change.
 *
 * ── What these numbers are ───────────────────────────────────────────────────
 *
 * Written estimates, not measurements. The handoff's subtitle claimed "medians
 * from our own test logs"; there are no test logs, so that sentence is not
 * carried over. Every claim in this section lives in SAVINGS_COPY so the honest
 * wording is one edit away the day real benchmarking exists. See data/savings.ts.
 *
 * ── Not the assistant ────────────────────────────────────────────────────────
 *
 * This picker talks to nothing. It reads a written estimate off a record the
 * page already holds; there is no model call, no retrieval and no conversation.
 * The role names are kept compatible with the catalogue's own vocabulary
 * (`catalogueRole` on the server) so the two never drift, but that is a shared
 * vocabulary rather than a shared system.
 */

export default function SavingsSection() {
  const { estimates, isLoading, failed } = useWorkSavings()
  const [role, setRole] = useState('')

  const roles = useMemo(() => estimates.map((estimate) => estimate.role), [estimates])
  const selected = useMemo(
    () => estimates.find((estimate) => estimate.role === role),
    [estimates, role],
  )

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
      {/* The slow green bloom behind the table. */}
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
         * The design's two columns, as flex bases rather than a grid: they wrap
         * to a single column on their own at the point the table would start
         * squeezing, which is what gives the tablet layout for free.
         */}
        <div data-reveal="0.06" className="mt-[30px] flex flex-wrap items-start gap-5">
          <div className="flex min-w-[min(100%,440px)] flex-[3_1_480px] flex-col gap-4">
            <SavingsComparisonTable />
            <SavingsValueStrip />
          </div>

          <div className="flex min-w-[min(100%,300px)] flex-[2_1_340px] flex-col gap-[14px] px-[14px] py-[60px]">
            <div>
              <h3 className="text-[clamp(19px,1.7vw,22px)] leading-[1.18] font-bold tracking-[-0.026em] text-pretty text-[#F1F6F3]">
                {SAVINGS_COPY.selectorHeading}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.55] tracking-[-0.006em] text-pretty text-muted-dim">
                {SAVINGS_COPY.selectorSubtitle}
              </p>
            </div>

            <div className="rounded-[26px] border border-[rgba(120,226,172,0.2)] bg-[linear-gradient(180deg,rgba(11,27,20,0.94)_0%,rgba(7,15,12,0.96)_100%)] p-[18px] shadow-[inset_0_1px_0_rgba(196,246,220,0.15),0_2px_6px_rgba(0,0,0,0.45),0_34px_64px_-46px_rgba(0,0,0,0.95),0_0_64px_-44px_rgba(74,208,148,0.55)]">
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
                <RoleSavingsPanel estimate={selected} />
              ) : (
                /*
                 * The idle panel, which doubles as the failure state: if the
                 * estimates never arrive the picker is disabled and this says so
                 * in one quiet line. No banner, no retry — the section's main
                 * content is the table to the left and it is unaffected.
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
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
