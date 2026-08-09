import Section from '@/components/layout/Section'
import Button from '@/components/ui/Button'

/*
 * Closing CTA banner. Two decorative animated layers sit behind the copy: a
 * drifting purple bloom (akMeshB) and a slow light sweep (akSweep, offset -6s).
 */

export default function CtaBanner() {
  return (
    <Section>
      <div
        data-reveal="0"
        className="relative flex flex-wrap items-center justify-between gap-10 overflow-hidden rounded-hero bg-[image:var(--gradient-banner)] p-14 shadow-[0_40px_70px_-40px_rgba(78,92,232,0.7)]"
      >
        <div
          aria-hidden="true"
          className="absolute top-[-70%] right-[-22%] h-[240%] w-[70%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(154,110,255,0.5)_0%,rgba(202,168,255,0.216)_45%,rgba(202,168,255,0)_72%)] blur-[26px] [animation:akMeshB_54s_cubic-bezier(.45,0,.55,1)_infinite]"
        />
        <div
          aria-hidden="true"
          className="absolute top-0 left-[-40%] h-full w-[28%] bg-[linear-gradient(100deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.09)_50%,rgba(255,255,255,0)_100%)] [animation:akSweep_26s_linear_infinite] [animation-delay:-6s]"
        />

        <div className="relative max-w-[560px]">
          <h2 className="text-[38px] leading-[1.06] font-bold tracking-[-0.032em] text-balance text-white">
            Built something? Get it in front of 190,000 monthly searchers.
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-white/[0.78]">
            Free listings, reviewed in 48 hours. No pay-to-rank, ever.
          </p>
        </div>

        <div className="relative flex flex-wrap gap-3">
          <Button variant="light" to="/submit">
            Submit a tool
          </Button>
          <Button variant="outlineLight" to="/pricing">
            See plans
          </Button>
        </div>
      </div>
    </Section>
  )
}
