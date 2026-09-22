import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SetupPicker from '@/components/assistant/SetupPicker'
import { GoalIcon, PlanSectionIcon, RoleIcon } from '@/components/assistant/icons'
import { WORKFLOW_ICON } from '@/data/assistant'
import { useTaxonomy } from '@/hooks/useTaxonomy'

/*
 * "Build Your AI Setup" — the role → goal → build strip under the stage.
 *
 * Source: AI Tool Kart Site.dc.html, the `data-reveal="0.05"` card. Two pickers
 * separated by an arrow, then "Let's Build".
 *
 * ── Why this is not a second recommendation engine ───────────────────────────
 *
 * The design's `letsBuild()` does not produce a plan. It composes one English
 * sentence out of the two picks and hands it to the same assistant the chat
 * panel talks to — "I'm a video editor — I need to edit videos faster." — then
 * scrolls the transcript into view so the answer is visible where it lands.
 *
 * That is reproduced exactly, and it is the right architecture as well as the
 * faithful one: two picks that produced their own recommendation would be a
 * second, ungrounded assistant living in a React component, and the first
 * follow-up question in the chat would have nothing to refine.
 *
 * ── Where the options come from ──────────────────────────────────────────────
 *
 * GET /api/taxonomy. The server seeds `roles` and `goalsByRole` from these very
 * lists, so the picker reads the catalogue's own vocabulary rather than a copy
 * of it. Choosing a role narrows the goals, exactly as SETUP_GOALS did, and a
 * role with no goal list falls back to the design's generic five.
 *
 * ── One omission, stated ─────────────────────────────────────────────────────
 *
 * The design's footer also carries a "Join Our Community" avatar cluster that
 * smooth-scrolls to `#community`. That section is not part of this milestone and
 * does not exist in the app, and a control that visibly does nothing is worse
 * than one that is not there yet. It returns with the section it points at.
 */

const CARD_BACKGROUND =
  'linear-gradient(180deg,#151129 0%,#0D0A1B 100%) padding-box,' +
  'linear-gradient(162deg,rgba(228,216,255,0.32) 0%,rgba(178,150,255,0.14) 30%,rgba(255,255,255,0.03) 60%,rgba(160,120,250,0.14) 100%) border-box'

/** The design's fallback when a role has no goal list of its own. */
const GENERIC_GOALS = [
  'Build something new',
  'Research a topic',
  'Create content',
  'Automate busywork',
  'Analyze data',
]

/** The design's `letsBuild()` sentence, verbatim in all three of its branches. */
function composeSetupMessage(role: string, goal: string): string {
  if (role && goal) {
    return `I'm a ${role.toLowerCase()} — I need to ${goal.charAt(0).toLowerCase()}${goal.slice(1)}.`
  }
  if (role) return `I'm a ${role.toLowerCase()} — what should my AI stack look like?`
  return `I want help with ${goal.toLowerCase()}.`
}

interface BuildSetupCardProps {
  /** Sends the composed sentence as a turn in the shared conversation. */
  onBuild: (message: string) => void
  /** Brings the transcript into view, as the design does after building. */
  onScrollToStage: () => void
  /** True while a turn is in flight, so "Let's Build" cannot stack requests. */
  busy: boolean
  /** Card title. Defaults to the design's own wording. */
  label?: string
}

export default function BuildSetupCard({
  onBuild,
  onScrollToStage,
  busy,
  label = 'Build Your AI Setup',
}: BuildSetupCardProps) {
  const navigate = useNavigate()
  const taxonomy = useTaxonomy()
  const [role, setRole] = useState('')
  const [goal, setGoal] = useState('')

  const roles = taxonomy.data?.roles ?? []
  const goals = (role ? taxonomy.data?.goalsByRole[role] : undefined) ?? GENERIC_GOALS

  const listHint = taxonomy.isLoading
    ? 'Loading the list…'
    : 'The list could not be loaded — choose "Other / type manually…" instead.'

  const build = () => {
    const trimmedRole = role.trim()
    const trimmedGoal = goal.trim()
    if (busy || (!trimmedRole && !trimmedGoal)) return
    onBuild(composeSetupMessage(trimmedRole, trimmedGoal))
    onScrollToStage()
  }

  return (
    <div data-reveal="0.05" className="relative z-[6] mx-auto mt-[26px] w-[min(1120px,100%)] text-left">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[-140px] bottom-[-80px] left-[-10%] z-0 right-[-10%] bg-[radial-gradient(ellipse_44%_56%_at_50%_40%,rgba(150,110,250,0.15)_0%,rgba(124,80,240,0.06)_50%,rgba(124,80,240,0)_80%)] blur-[66px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[14px] bottom-[-18px] left-[4%] right-[4%] z-0 rounded-hero bg-[radial-gradient(ellipse_60%_70%_at_50%_50%,rgba(150,110,250,0.2),rgba(150,110,250,0)_72%)] blur-[30px]"
      />

      <div
        style={{ background: CARD_BACKGROUND }}
        className="relative z-[1] flex flex-col gap-[18px] rounded-panel-lg border border-transparent p-[22px] shadow-[inset_0_1px_0_rgba(232,222,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.6),0_2px_4px_rgba(0,0,0,0.4),0_30px_60px_-40px_rgba(0,0,0,0.95),0_24px_70px_-46px_rgba(167,139,250,0.85)]">
        <div className="flex flex-wrap items-center gap-[11px]">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-[rgba(178,150,255,0.26)] bg-[rgba(124,90,246,0.13)] text-[#BBA8F0]">
            <PlanSectionIcon path={WORKFLOW_ICON} className="h-[15px] w-[15px]" />
          </span>
          <h2 className="text-[15.5px] font-semibold tracking-[-0.016em] text-[#F1EDFB]">
            {label}
          </h2>
          <span className="rounded-pill border border-[rgba(178,150,255,0.3)] bg-[rgba(124,90,246,0.13)] px-[9px] py-1 text-[9.5px] font-bold tracking-[0.12em] text-[#C6B2FF] uppercase">
            Quick setup
          </span>
          <p className="min-w-0 flex-[1_1_220px] text-[13px] leading-[1.5] tracking-[-0.006em] text-pretty text-muted-dim">
            Two picks and the assistant above builds the plan for you.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-[11px]">
          <SetupPicker
            label="Your role"
            placeholder="I am a"
            typePlaceholder="Type your role…"
            icon={<RoleIcon className="h-[15px] w-[15px]" />}
            options={roles}
            value={role}
            onChange={(next) => {
              setRole(next)
              // The goal list depends on the role, so a stale goal from the
              // previous role would now be an option that is no longer offered.
              setGoal('')
            }}
            onSubmit={build}
            emptyHint={listHint}
          />

          <span aria-hidden="true" className="flex-none text-[14px] text-[#6B6488]">
            →
          </span>

          <SetupPicker
            label="What you want to get done"
            placeholder="I want help with"
            typePlaceholder="Describe the work…"
            icon={<GoalIcon className="h-[15px] w-[15px]" />}
            options={goals}
            value={goal}
            onChange={setGoal}
            onSubmit={build}
            emptyHint={listHint}
          />

          <button
            type="button"
            onClick={build}
            disabled={busy}
            data-magnet="1"
            className="inline-flex h-[52px] flex-none cursor-pointer items-center justify-center gap-[9px] rounded-[15px] border border-[rgba(202,182,255,0.32)] bg-[linear-gradient(180deg,#9C82FA_0%,#7458EE_52%,#5B41D8_100%)] px-6 text-[14.5px] font-semibold tracking-[-0.01em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_18px_36px_-24px_rgba(116,80,244,0.9)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_24px_46px_-22px_rgba(116,80,244,0.98)] active:scale-[0.985] disabled:cursor-default disabled:opacity-60"
          >
            {busy ? 'Building…' : "Let's Build"}
            <span aria-hidden="true" className="text-[15px]">
              →
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-[14px] border-t border-white/[0.06] pt-[14px]">
          <button
            type="button"
            onClick={() => navigate('/browse')}
            className="inline-flex cursor-pointer items-center gap-2 rounded-pill border border-white/[0.1] bg-white/[0.032] px-4 py-[9px] text-[13px] font-semibold tracking-[-0.008em] text-[#B4AECB] transition-[color,border-color,background-color,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px hover:border-[rgba(178,150,255,0.38)] hover:bg-[rgba(124,90,246,0.14)] hover:text-[#F0EBFC]"
          >
            Build My Setup
            <span aria-hidden="true" className="text-[14px]">
              →
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
