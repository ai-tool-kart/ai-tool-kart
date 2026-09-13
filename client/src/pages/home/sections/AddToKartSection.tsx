import AddOptionCard from '@/components/addToKart/AddOptionCard'
import { ShareSetupIcon, SubmitToolIcon } from '@/components/addToKart/icons'
import { SUBMIT_ROUTE, WORKFLOWS_ROUTE } from '@/data/navigation'

/*
 * "Add to AI Tool Kart" — the page's closing call to action.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="Add to the Kart"`: a
 * 30px-radius frame drawn with a padding-box / border-box gradient pair (CSS
 * has no other way to express a gradient border), two blurred violet blooms
 * behind it, the centred header, then two cards.
 *
 * It REPLACES pages/home/sections/CtaBanner.tsx, which was built from the FIRST
 * design export: a flat violet banner reading "Built something? Get it in front
 * of 190,000 monthly searchers" with two buttons in a row. This is the same
 * section redesigned, not a new one beside it.
 *
 * ── The moving rectangle is gone ─────────────────────────────────────────────
 *
 * The handoff floats a third layer over this frame: a 28%-wide rotated bar of
 * white gradient parked at `left:-40%` and driven across the whole section by
 * `akSweep` on a 26s loop. It is removed, not reproduced, and `@keyframes
 * akSweep` was deleted with it — this was its only consumer.
 *
 * The two blooms are KEPT but drawn STATIC. In the handoff they also drift, on
 * `akMeshA`/`akMeshB` 54–66s loops. Those keyframes stay in styles/animations.css
 * because BrowsePage still uses them; this section simply no longer references
 * them, so the glow is depth rather than motion. To restore the drift, add
 * `[animation:akMeshB_54s_cubic-bezier(.45,0,.55,1)_infinite]` to the first
 * bloom and the `akMeshA_66s` equivalent to the second.
 *
 * Nothing else in the section animates on a timer. What is left is the entry
 * reveal every section has, and hover on the two cards.
 *
 * ── Where the two cards go ───────────────────────────────────────────────────
 *
 * Both destinations are named constants from data/navigation.ts rather than
 * literals, so "Submit" cannot drift away from the nav pill's "Submit Your
 * Tool", and "Share Setup" follows the nav's Workflows item to whatever it
 * points at — the setup library at /workflows.
 */

/* The design's gradient border: fill on padding-box, border on border-box. */
const FRAME_BACKGROUND =
  'linear-gradient(180deg,rgba(13,10,24,0.94) 0%,rgba(8,7,15,0.96) 100%) padding-box,' +
  'linear-gradient(158deg,rgba(232,222,255,0.5) 0%,rgba(178,150,255,0.2) 26%,rgba(255,255,255,0.045) 58%,rgba(206,186,255,0.34) 100%) border-box'

export default function AddToKartSection() {
  return (
    <section className="mx-auto max-w-site px-8 pt-24">
      <div
        data-reveal="0"
        style={{ background: FRAME_BACKGROUND }}
        className="relative overflow-hidden rounded-hero border border-transparent p-[clamp(30px,3.6vw,50px)] shadow-[inset_0_1px_0_rgba(226,214,255,0.18),0_2px_6px_rgba(0,0,0,0.5),0_40px_80px_-46px_rgba(72,34,180,0.7)]"
      >
        {/* The two blooms that give the frame its depth. Static — see above. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[-60%] right-[-18%] h-[220%] w-[66%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(154,110,255,0.32)_0%,rgba(202,168,255,0.1)_46%,rgba(202,168,255,0)_74%)] blur-[38px]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-90%] left-[-14%] h-[200%] w-[58%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(124,88,244,0.24)_0%,rgba(96,52,210,0.07)_48%,transparent_76%)] blur-[44px]"
        />

        <div className="relative text-center">
          <div className="text-[11.5px] tracking-[0.2em] text-[#C6B2FF] uppercase">
            Add to AI Tool Kart
          </div>
          <h2 className="mx-auto mt-[14px] max-w-[22ch] text-[clamp(30px,3.3vw,40px)] leading-[1.08] font-bold tracking-[-0.032em] text-balance text-white">
            Built something useful? Add it to the Kart.
          </h2>
          <p className="mx-auto mt-[14px] max-w-[52ch] text-[16px] leading-[1.62] text-pretty text-body">
            Free listings, reviewed in 48 hours. No pay-to-rank, ever.
          </p>
        </div>

        <div className="relative mt-8 flex flex-wrap items-stretch justify-center gap-4">
          <AddOptionCard
            title="Submit a Tool"
            body="Add your AI tool to the directory. Reviewed by an editor in 48 hours, listed with the date it was tested."
            cta="Submit"
            to={SUBMIT_ROUTE}
            icon={<SubmitToolIcon className="h-5 w-5" />}
          />
          <AddOptionCard
            title="Share an AI Setup"
            body="Share the workflow or tool combination that works for you — credited, and open for others to run."
            cta="Share Setup"
            to={WORKFLOWS_ROUTE}
            icon={<ShareSetupIcon className="h-5 w-5" />}
          />
        </div>
      </div>
    </section>
  )
}
