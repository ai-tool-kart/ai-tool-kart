import type { CSSProperties } from 'react'
import SetupStageStrip from '@/components/aiSetups/SetupStageStrip'
import SetupToolStack from '@/components/aiSetups/SetupToolStack'
import { SETUP_TONES } from '@/components/aiSetups/setupTone'
import type { ResolvedSetup } from '@/types/aiSetup'
import { setupMeta, setupToolNames } from '@/utils/aiSetups'

/*
 * One AI setup card.
 *
 * Source: AI Tool Kart Site.dc.html, the `workSetups` grid — the tool stack and
 * an optional badge, the tool-name line, title and two-line description, the
 * workflow strip, then the meta line and "View Setup".
 *
 * ── What is editorial here and what is the catalogue's ───────────────────────
 *
 *   editorial   title, description, stages, badge, workflow/agent/prompt counts,
 *               tone, and which tools the setup names
 *   catalogue   every tool NAME and MONOGRAM on the card, and the tool COUNT in
 *               the meta line — all of it read from live records
 *
 * The card never states a tool fact of its own. The name line is joined from the
 * resolved records rather than stored as a string, so a tool renamed in the
 * catalogue is renamed here, and a tool the catalogue no longer has disappears
 * from the stack and from the count together.
 *
 * ── Interaction ──────────────────────────────────────────────────────────────
 *
 * The shared design behaviours only: `[data-spot]` for the cursor spotlight and
 * rim, `[data-reveal="stagger"]` for the entry, both installed once by
 * hooks/useDesignInteractions.ts. No handlers here and no second animation
 * system.
 *
 * It is a `role="button"` div rather than a real <button> because the card holds
 * a heading and block content, which a <button> may not contain — the same
 * decision, and the same keyboard handling, as components/ui/SpotCard.tsx. It is
 * not a link: activating it starts an assistant turn on this page rather than
 * navigating. See AiForYourWorkSection.
 */

/** The custom properties the design drives its per-card colours through. */
interface ToneVars extends CSSProperties {
  '--acc': string
  '--glow': string
  '--t1': string
}

interface SetupCardProps {
  resolved: ResolvedSetup
  /**
   * How the catalogue read is going.
   *
   * The three states are drawn differently on purpose. While it is `loading` the
   * stack holds its shape with one empty tile per tool the setup names, so the
   * card does not jump when the monograms arrive. When it is `unavailable` those
   * tiles are dropped entirely: an empty slot that will never fill is a promise
   * the card cannot keep, and the setup reads perfectly well without it.
   */
  toolsStatus: 'loading' | 'ready' | 'unavailable'
  onOpen: (resolved: ResolvedSetup) => void
}

export default function SetupCard({ resolved, toolsStatus, onOpen }: SetupCardProps) {
  const { setup, tools } = resolved
  const tone = SETUP_TONES[setup.tone]
  const names = setupToolNames(resolved)
  const toolsResolved = toolsStatus === 'ready'

  const style: ToneVars = {
    '--acc': tone.accent,
    '--glow': tone.glow,
    '--t1': tone.tint,
  }

  const activate = () => onOpen(resolved)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        activate()
      }}
      data-spot="1"
      data-reveal="stagger"
      style={style}
      /*
       * One notch calmer than the handoff, matching the correction already made
       * on the Browse cards: the lift is 5px rather than 6 and the glow is cast
       * further back (-32px rather than -30px of a 60px blur), so the hover
       * reads as the card coming forward rather than as a light switching on.
       */
      className="group relative flex cursor-pointer flex-col gap-[14px] overflow-hidden rounded-panel border border-white/[0.075] bg-[linear-gradient(180deg,rgba(255,255,255,0.052)_0%,rgba(255,255,255,0.016)_100%)] p-5 text-left shadow-[inset_0_1px_0_rgba(224,212,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.4),0_22px_42px_-32px_rgba(0,0,0,0.95)] transition-[transform,border-color,box-shadow,background] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:border-[rgba(178,150,255,0.32)] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.078)_0%,rgba(255,255,255,0.022)_100%)] hover:shadow-[inset_0_1px_0_rgba(240,232,255,0.3),0_2px_6px_rgba(0,0,0,0.45),0_30px_56px_-32px_var(--glow)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent active:translate-y-[-2px] active:scale-[0.995]"
    >
      {/*
       * The two cursor-tracking layers. Geometry and fade live in
       * styles/index.css; the fill is restated because its radius and core
       * colour key off this card's own --t1, as on the Browse card.
       */}
      <span
        data-spot-layer="1"
        aria-hidden="true"
        className="[background:radial-gradient(200px_circle_at_var(--mx,50%)_var(--my,50%),var(--t1)_0%,rgba(255,255,255,0.03)_38%,transparent_66%)]"
      />
      <span data-spot-edge="1" aria-hidden="true" />

      {/*
       * Also wraps, for the same reason as the footer: a four-tool stack and a
       * "Recommended" pill together need ~280px, which a 256px card on a 320px
       * phone does not have, and the pill would otherwise be clipped by the
       * card's own overflow. `ml-auto` keeps it right-aligned on either line.
       */}
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2">
        {toolsStatus === 'loading' ? (
          <SetupToolStack tools={[]} placeholders={setup.toolSlugs.length} />
        ) : (
          <SetupToolStack tools={tools} />
        )}
        {setup.badge && (
          <span className="ml-auto rounded-pill border border-[rgba(178,150,255,0.34)] bg-[rgba(124,90,246,0.16)] px-[11px] py-[5px] text-[9.5px] font-bold tracking-[0.12em] whitespace-nowrap text-[#EADFFF] uppercase">
            {setup.badge}
          </span>
        )}
      </div>

      <div className="relative flex flex-col gap-[7px]">
        {/* Empty until the catalogue answers — never a stand-in list of names. */}
        {names && (
          <div className="text-[11.5px] tracking-[-0.004em] text-[#8078A0]">{names}</div>
        )}
        <h3 className="text-[18px] font-semibold tracking-[-0.022em] text-pretty text-ink">
          {setup.title}
        </h3>
        <p className="line-clamp-2 text-[13.5px] leading-[1.52] tracking-[-0.006em] text-pretty text-muted-dim">
          {setup.description}
        </p>
      </div>

      <SetupStageStrip stages={setup.stages} />

      {/*
       * `flex-wrap` and the CTA's `whitespace-nowrap` are additions to the
       * handoff's single row. In the design the grid never goes below 336px, so
       * the meta line and the pill always fit side by side; a 256px card on a
       * 320px phone breaks "View Setup" across two lines and squeezes the meta.
       * Wrapping drops the pill onto its own line, still right-aligned, instead.
       */}
      <div className="relative mt-auto flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[12px] tracking-[-0.004em] text-[#7E7899]">
          {setupMeta(resolved, toolsResolved)}
        </span>
        <span className="ml-auto inline-flex items-center gap-[7px] rounded-pill whitespace-nowrap border border-[rgba(178,150,255,0.26)] bg-[rgba(124,90,246,0.13)] px-[15px] py-2 text-[12.5px] font-semibold tracking-[-0.006em] text-[#D3C4FF] transition-[color,border-color,background] duration-300 group-hover:border-[rgba(214,192,255,0.55)] group-hover:bg-[rgba(124,90,246,0.26)] group-hover:text-white">
          View Setup
          <span aria-hidden="true" className="text-[14px]">
            →
          </span>
        </span>
      </div>
    </div>
  )
}
