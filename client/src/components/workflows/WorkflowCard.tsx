import { useId, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { SETUP_CARD_CTA, SETUP_CARD_SURFACE } from '@/components/aiSetups/setupCardStyles'
import { SETUP_TONES } from '@/components/aiSetups/setupTone'
import { automationPath, beginnerLabel, priceLabel } from '@/components/automations/labels'
import WorkflowToolStack from '@/components/workflows/WorkflowToolStack'
import type { ToolIndex } from '@/services/tools'
import type { SetupToneName } from '@/types/aiSetup'
import type { AutomationCard } from '@/types/automation'

/*
 * One workflow — on /workflows and in the homepage's "AI for Your Work".
 *
 * The original homepage setup card's design (the retired SetupCard — same surface, spotlight,
 * hover lift, tone rotation and CTA pill, via aiSetups/setupCardStyles) drawn
 * over one record from GET /api/automations. Slot for slot:
 *
 *   SetupCard              WorkflowCard
 *   monogram stack         WorkflowToolStack — catalogue monos where matched
 *   badge                  niche
 *   tool-name line         `tools` — names, as the API sends them
 *   title                  `title`
 *   description            `persona` — who the workflow is for
 *   meta line              tool count · beginner level · price tier (if sent)
 *   "View Setup →"         "View Complete Workflow →"
 *
 * The stage strip is absent: a guide record has no editorial stages (a guide's
 * steps are, for all but a handful, the generic derived three), so there is
 * nothing true to put in it and it is not approximated.
 *
 * ── A link, not a button ─────────────────────────────────────────────────────
 *
 * SetupCard is a `role="button"` because it starts an assistant turn. This card
 * navigates, so it is a real <a> to the guide at /automations/:niche/:slug —
 * middle-click, copy-link and crawlers all see the destination. Its accessible
 * name is the title plus the CTA, not every line of the card.
 */

const TONE_ROTATION: readonly SetupToneName[] = ['violet', 'sky', 'pink', 'blue', 'sand']

interface ToneVars extends CSSProperties {
  '--acc': string
  '--glow': string
  '--t1': string
}

interface WorkflowCardProps {
  automation: AutomationCard
  /** Position in the grid — only picks the tone, as the handoff's rotation does. */
  position: number
  /** The shared catalogue read, for the tool tiles. See WorkflowToolStack. */
  toolIndex: ToolIndex | undefined
  toolsStatus: 'loading' | 'ready' | 'unavailable'
}

export default function WorkflowCard({ automation, position, toolIndex, toolsStatus }: WorkflowCardProps) {
  const tone = SETUP_TONES[TONE_ROTATION[position % TONE_ROTATION.length]]
  const titleId = useId()
  const ctaId = useId()

  const style: ToneVars = { '--acc': tone.accent, '--glow': tone.glow, '--t1': tone.tint }
  const toolCount = automation.tools.length
  const meta = [
    toolCount > 0 && `${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`,
    beginnerLabel(automation.beginnerFriendly),
    automation.pricingTier && priceLabel(automation.pricingTier),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link
      to={automationPath(automation.niche, automation.slug)}
      aria-labelledby={`${titleId} ${ctaId}`}
      data-spot="1"
      data-reveal="stagger"
      style={style}
      // The global link colour must not tint the card's text.
      className={`${SETUP_CARD_SURFACE} text-inherit no-underline hover:text-inherit`}
    >
      <span
        data-spot-layer="1"
        aria-hidden="true"
        className="[background:radial-gradient(200px_circle_at_var(--mx,50%)_var(--my,50%),var(--t1)_0%,rgba(255,255,255,0.03)_38%,transparent_66%)]"
      />
      <span data-spot-edge="1" aria-hidden="true" />

      {/* Wraps like SetupCard's row; `ml-auto` keeps the badge right on either line. */}
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2">
        <WorkflowToolStack automation={automation} index={toolIndex} status={toolsStatus} />
        <span title={automation.niche} className="ml-auto max-w-full min-w-0 truncate rounded-pill border border-[rgba(178,150,255,0.34)] bg-[rgba(124,90,246,0.16)] px-[11px] py-[5px] text-[9.5px] font-bold tracking-[0.12em] whitespace-nowrap text-[#EADFFF] uppercase">
          {automation.niche}
        </span>
      </div>

      <div className="relative flex flex-col gap-[7px]">
        {automation.tools.length > 0 && (
          /* One line: some source "tool names" are whole sentences. The full
             list is in the title attribute and on the guide itself. */
          <div
            title={automation.tools.join(' · ')}
            className="truncate text-[11.5px] tracking-[-0.004em] text-[#8078A0]"
          >
            {automation.tools.join(' · ')}
          </div>
        )}
        <h3
          id={titleId}
          className="line-clamp-3 text-[18px] font-semibold tracking-[-0.022em] text-pretty text-ink"
        >
          {automation.title}
        </h3>
        <p className="line-clamp-2 text-[13.5px] leading-[1.52] tracking-[-0.006em] text-pretty text-muted-dim">
          {automation.persona}
        </p>
      </div>

      {/*
       * Meta over CTA on every card. SetupCard sets them side by side, but this
       * meta line varies in length (tool count, level, price), so side by side
       * fit on some cards and wrapped on their neighbours; stacking always
       * keeps a row of cards ending the same way. `mt-auto` pins it to the foot.
       */}
      <div className="relative mt-auto flex flex-col gap-3">
        <span className="text-[12px] tracking-[-0.004em] text-[#7E7899]">{meta}</span>
        <span id={ctaId} className={SETUP_CARD_CTA}>
          View Complete Workflow
          <span aria-hidden="true" className="text-[14px]">
            →
          </span>
        </span>
      </div>
    </Link>
  )
}
