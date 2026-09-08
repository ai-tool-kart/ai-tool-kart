/*
 * The editors' desk while the catalogue is being read.
 *
 * Holds the exact geometry the resolved section occupies — the two panels at
 * their flex bases, the 16:9 media slot, the 96px mark, the five square tiles —
 * so nothing on the page moves when the tools arrive. Only the parts that depend
 * on a tool are greyed; the section's own words ("Today's Pick", "Also
 * featured") are editorial and are shown immediately, because they are already
 * true.
 *
 * Nothing here pulses. A shimmer across a panel this large is more motion than
 * the wait deserves, and the rest of the page has none.
 */

const BAR = 'rounded-[6px] bg-white/[0.05]'

export default function FeaturedToolsSkeleton() {
  return (
    <div aria-hidden="true" className="relative mt-7 flex flex-wrap items-stretch gap-5">
      <div className="flex min-w-0 flex-[1_1_470px] flex-col rounded-hero border border-white/[0.07] bg-[linear-gradient(168deg,rgba(214,164,84,0.08)_0%,rgba(255,255,255,0.03)_100%)] p-[30px]">
        <div className="flex items-center gap-[10px]">
          <span className="h-8 w-8 flex-none rounded-[11px] border border-[rgba(229,196,140,0.24)] bg-white/[0.04]" />
          <span className="text-[17px] font-semibold tracking-[-0.014em] text-[#F8F2E6]">
            Today&rsquo;s Pick
          </span>
        </div>
        <div className="mt-[22px] aspect-[16/9] w-full rounded-card-lg border border-[rgba(252,238,208,0.12)] bg-white/[0.025]" />
        <div className="mt-[22px] flex items-center gap-4">
          <span className="h-24 w-24 flex-none rounded-panel border border-[rgba(252,238,208,0.14)] bg-white/[0.035]" />
          <div className="flex min-w-0 flex-auto flex-col gap-[10px]">
            <span className={`${BAR} h-[22px] w-[55%]`} />
            <span className={`${BAR} h-[12px] w-[35%]`} />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-[9px]">
          <span className={`${BAR} h-[12px] w-full`} />
          <span className={`${BAR} h-[12px] w-[72%]`} />
        </div>
        <div className="mt-auto flex items-center justify-between gap-[14px] pt-[26px]">
          <span className={`${BAR} h-[38px] w-[150px] rounded-pill`} />
          <span className="h-12 w-[140px] rounded-pill bg-[rgba(229,196,140,0.16)]" />
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_480px] flex-col rounded-panel-lg border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.01)_100%)] p-6">
        <div className="text-[17px] font-semibold tracking-[-0.014em] text-[#D8D2E4]">
          Also featured
        </div>
        <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="flex flex-col rounded-card border border-white/[0.06] bg-white/[0.02] p-[13px]"
            >
              <span className="aspect-square w-full rounded-field bg-white/[0.035]" />
              <span className={`${BAR} mt-[11px] h-[13px] w-[70%]`} />
              <span className={`${BAR} mt-[6px] h-[10px] w-[45%]`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
