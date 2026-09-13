import type { RefObject } from 'react'
import ChatPanel from '@/components/assistant/ChatPanel'
import PlanPanel from '@/components/assistant/PlanPanel'
import { ASSISTANT_SECTION_ID } from '@/data/navigation'
import type { AssistantSession } from '@/hooks/useAssistant'

/*
 * The two-pane assistant stage: the design's centrepiece, directly under the
 * hero search.
 *
 * Source: AI Tool Kart Site.dc.html, the `data-reveal` block after the search.
 * Five ambient glow layers, then a 32px glass shell drawn with a
 * padding-box/border-box gradient pair — CSS has no other way to express a
 * gradient border — holding the chat panel, a 1px lit divider and the plan
 * panel.
 *
 * The shell wraps at the design's own breakpoints rather than at a media query:
 * the panels carry `flex: 1 1 470px` and `flex: 1 1 330px` with
 * `min-width: min(100%, …)`, so they sit side by side while there is room for
 * both and stack, full width, the moment there is not. The divider is a flex
 * item too, which is why it disappears cleanly into the gap when they stack.
 *
 * This component holds no state. It is handed a session and splits it in two.
 *
 * The shell carries ASSISTANT_SECTION_ID because the nav's "Our AI Assistant"
 * item is a fragment link to it — the assistant is a section of the homepage in
 * the final design, not a page. `scroll-mt` clears the fixed header, as the
 * Community section does; `scrollIntoView` honours it, so nothing computes an
 * offset. See data/navigation.ts.
 */

/** The ambient pools behind the shell, outermost first. */
const GLOWS = [
  'absolute -top-[190px] -bottom-[150px] left-[-14%] right-[-14%] bg-[radial-gradient(ellipse_46%_52%_at_50%_22%,rgba(150,110,250,0.3)_0%,rgba(124,80,240,0.13)_40%,rgba(96,52,210,0.04)_66%,rgba(96,52,210,0)_84%)] blur-[84px] [animation:akBloomPulse_13s_ease-in-out_-5s_infinite]',
  'absolute -top-[96px] left-[-2%] right-[-2%] h-[220px] bg-[radial-gradient(ellipse_52%_74%_at_50%_0%,rgba(216,200,255,0.22)_0%,rgba(160,120,250,0.09)_44%,rgba(160,120,250,0)_76%)] blur-[38px]',
  'absolute left-[-5%] top-[6%] bottom-[12%] w-[120px] bg-[radial-gradient(ellipse_60%_50%_at_100%_50%,rgba(167,139,250,0.16),rgba(167,139,250,0)_74%)] blur-[30px]',
  'absolute right-[-5%] top-[6%] bottom-[12%] w-[120px] bg-[radial-gradient(ellipse_60%_50%_at_0%_50%,rgba(167,139,250,0.16),rgba(167,139,250,0)_74%)] blur-[30px]',
  'absolute -bottom-[150px] left-[6%] right-[6%] h-[200px] bg-[radial-gradient(ellipse_52%_62%_at_50%_0%,rgba(124,88,244,0.19)_0%,rgba(110,124,235,0.08)_46%,rgba(110,124,235,0)_80%)] blur-[34px]',
]

const SHELL_BACKGROUND =
  'linear-gradient(180deg,rgba(19,15,34,0.72) 0%,rgba(11,9,21,0.82) 100%) padding-box,' +
  'linear-gradient(162deg,rgba(228,216,255,0.4) 0%,rgba(178,150,255,0.16) 26%,rgba(255,255,255,0.04) 54%,rgba(160,120,250,0.16) 78%,rgba(214,196,255,0.3) 100%) border-box'

interface AssistantStageProps {
  session: AssistantSession
  /** Scroll target for "Let's Build", which sends a turn from further down. */
  panelRef?: RefObject<HTMLDivElement | null>
}

export default function AssistantStage({ session, panelRef }: AssistantStageProps) {
  return (
    <div
      ref={panelRef}
      id={ASSISTANT_SECTION_ID}
      data-reveal="0"
      className="relative mx-auto mt-[42px] w-[min(1120px,100%)] scroll-mt-[110px] text-left"
    >
      {GLOWS.map((glow) => (
        <div key={glow} aria-hidden="true" className={`pointer-events-none ${glow}`} />
      ))}

      <div
        style={{ background: SHELL_BACKGROUND }}
        className="relative flex flex-wrap items-stretch gap-[14px] rounded-[32px] border border-transparent p-[14px] shadow-[inset_0_1px_0_rgba(232,222,255,0.16),inset_0_0_60px_-26px_rgba(186,156,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.55),0_34px_68px_-50px_rgba(0,0,0,0.95),0_0_120px_-60px_rgba(167,139,250,0.85)] backdrop-blur-[18px] backdrop-saturate-[1.25]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-[18%] left-[18%] h-px bg-[linear-gradient(90deg,transparent,rgba(240,232,255,0.5),transparent)]"
        />

        <ChatPanel session={session} />

        {/* The lit seam, with the design's pulse travelling down it while a
            turn is in flight — the one cue that ties the two panes together. */}
        <div
          aria-hidden="true"
          className="relative min-h-[2px] flex-[0_0_1px] self-stretch bg-[linear-gradient(180deg,transparent,rgba(178,150,255,0.26)_22%,rgba(178,150,255,0.26)_78%,transparent)]"
        >
          {session.status === 'thinking' && (
            <span className="absolute -left-[2px] h-[5px] w-[5px] rounded-full bg-[#C8AEFF] shadow-[0_0_12px_3px_rgba(167,139,250,0.9)] [animation:akPlanTravel_1.15s_linear_infinite]" />
          )}
        </div>

        <PlanPanel session={session} />
      </div>
    </div>
  )
}
