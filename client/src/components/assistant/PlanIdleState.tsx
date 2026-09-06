import { PLAN_SECTIONS } from '@/data/assistant'
import { PlanGraphIcon, PlanSectionIcon } from '@/components/assistant/icons'

/*
 * The plan panel before anything has been asked.
 *
 * Source: AI Tool Kart Site.dc.html, the `planIdle` branch. It is not a blank
 * slate: a haloed graph mark, the invitation, and the six section names as a
 * 2×3 grid of chips that wake one after another on a 6s cycle staggered 0.5s
 * apart. Between them they tell the reader what will appear here, in the order
 * it will appear, before they have typed a word.
 */

export default function PlanIdleState() {
  return (
    <div className="flex flex-col gap-[14px] px-[2px] pt-[6px] pb-[2px]">
      <div className="flex flex-col items-center gap-[10px] pt-[14px] pb-1">
        <span className="relative flex h-[52px] w-[52px] items-center justify-center rounded-[17px] border border-[rgba(178,150,255,0.3)] bg-[linear-gradient(158deg,rgba(167,139,250,0.22),rgba(255,255,255,0.03))] text-[#D8C8FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_34px_-14px_rgba(167,139,250,0.9)]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[6px] rounded-[22px] bg-[radial-gradient(circle_at_50%_50%,rgba(167,139,250,0.28),rgba(167,139,250,0)_70%)] [animation:akHalo_4.5s_ease-in-out_infinite]"
          />
          <PlanGraphIcon className="relative h-[23px] w-[23px]" />
        </span>
        <p className="max-w-[26ch] text-center text-[13.5px] leading-[1.5] tracking-[-0.008em] text-pretty text-[#A9A3C0]">
          Ask the assistant on the left — your plan builds here.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {PLAN_SECTIONS.map((section, index) => (
          <div
            key={section.key}
            className="flex items-center gap-2 rounded-[12px] border border-white/[0.08] bg-white/[0.028] px-[10px] py-[9px] text-muted-dim"
            style={{ animation: `akChipWake 6s ease-in-out ${index * 0.5}s infinite` }}
          >
            <PlanSectionIcon path={section.icon} className="h-[14px] w-[14px] flex-none" />
            <span className="text-[12px] font-semibold tracking-[-0.004em] whitespace-nowrap">
              {/* The design's idle chip says "Compare"; the section it stands
                  for is "Comparison". Kept as the design wrote it. */}
              {section.key === 'comparison' ? 'Compare' : section.label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-[2px] flex items-center gap-2 text-[11.5px] text-[#6E6884]">
        <span
          aria-hidden="true"
          className="h-[6px] w-[6px] rounded-full bg-[#9C7BF0] shadow-[0_0_10px_2px_rgba(156,123,240,0.7)] [animation:akPulse_3.4s_ease-in-out_infinite]"
        />
        Ready — nothing generated yet
      </div>
    </div>
  )
}
