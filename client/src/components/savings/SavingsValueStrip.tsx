import { CheckCircleIcon } from '@/components/savings/icons'
import { SAVINGS_VALUE_STRIP } from '@/data/savings'

/*
 * The green strip beneath the comparison table.
 *
 * Source: AI Tool Kart Site.dc.html, the `savingsSummary` row. Three ticked
 * labels summarising the table above.
 *
 * Decorative and non-interactive, exactly as the handoff has it — the labels
 * restate the three dimensions rather than linking anywhere, so making them
 * buttons would promise a destination that does not exist.
 */

export default function SavingsValueStrip() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-[30px] gap-y-[14px] rounded-card-lg border border-[rgba(120,226,172,0.28)] bg-[linear-gradient(180deg,rgba(74,208,148,0.14)_0%,rgba(74,208,148,0.045)_100%)] px-6 py-5 shadow-[inset_0_1px_0_rgba(196,246,220,0.24),0_2px_6px_rgba(0,0,0,0.4),0_30px_56px_-34px_rgba(48,164,112,0.55),0_0_70px_-34px_rgba(120,226,172,0.6)]">
      {SAVINGS_VALUE_STRIP.map((label) => (
        <span key={label} className="inline-flex items-center gap-[10px]">
          <CheckCircleIcon className="h-4 w-4 flex-none text-[#8FE3B8]" />
          <span className="text-[15.5px] font-semibold tracking-[-0.014em] text-[#E8F7EE]">
            {label}
          </span>
        </span>
      ))}
    </div>
  )
}
