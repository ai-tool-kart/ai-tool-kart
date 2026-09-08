/*
 * The workflow strip inside a setup card: Research → Outline → Draft → Edit.
 *
 * Source: AI Tool Kart Site.dc.html, the `s.flow` loop — a 13px inset panel on a
 * barely-there white fill, the steps separated by arrows with the last arrow
 * omitted.
 *
 * The stages are EDITORIAL. They are the curator's account of how the setup is
 * run, not anything the tool API knows: the server's own `WORKFLOW_STAGES`
 * vocabulary is a closed ten-value list for grounding the assistant's plans,
 * while these are the setup's own words ("Shoot", "Clean", "Retouch"). Forcing
 * them onto that vocabulary would rewrite the design's copy to fit an internal
 * enum.
 *
 * The panel wraps rather than scrolls or truncates, so a narrow card breaks the
 * sequence onto two lines with every step still readable, which is what the
 * design's `flex-wrap` does.
 */

interface SetupStageStripProps {
  stages: string[]
}

export default function SetupStageStrip({ stages }: SetupStageStripProps) {
  if (stages.length === 0) return null

  return (
    <div className="relative flex flex-wrap items-center gap-[7px] rounded-[13px] border border-white/[0.06] bg-white/[0.026] px-3 py-[10px]">
      {stages.map((stage, index) => (
        <span
          key={stage}
          className="inline-flex items-center gap-[7px] text-[12px] font-semibold tracking-[-0.004em] text-[#C6BFDA]"
        >
          {stage}
          {index < stages.length - 1 && (
            <span aria-hidden="true" className="text-[11px] text-[#6B6488]">
              →
            </span>
          )}
        </span>
      ))}
    </div>
  )
}
