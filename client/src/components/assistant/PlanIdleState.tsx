import { PlanGraphIcon } from '@/components/assistant/icons'

/*
 * The plan panel before anything has been asked.
 *
 * Source: AI Tool Kart Site.dc.html, the `planIdle` branch, simplified: the
 * design's six-section preview grid named sections ("Tools", "Workflow",
 * "Prompts"…) the panel no longer has. What survives is the haloed graph mark
 * and the invitation — the part that is still true.
 */

export default function PlanIdleState() {
  return (
    <div className="flex flex-col items-center gap-[10px] px-[2px] pt-[26px] pb-[14px]">
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

      <div className="mt-[6px] flex items-center gap-2 text-[11.5px] text-[#6E6884]">
        <span
          aria-hidden="true"
          className="h-[6px] w-[6px] rounded-full bg-[#9C7BF0] shadow-[0_0_10px_2px_rgba(156,123,240,0.7)] [animation:akPulse_3.4s_ease-in-out_infinite]"
        />
        Ready — nothing generated yet
      </div>
    </div>
  )
}
