import type { ReactNode } from 'react'
import { CheckIcon, PlanSectionIcon } from '@/components/assistant/icons'

/*
 * One card in "Your AI Plan" — the shell shared by all six sections.
 *
 * Source: AI Tool Kart Site.dc.html, the `planSections` loop. A section is in
 * exactly one of two states: PENDING draws two shimmering skeleton bars at 84%
 * and 54% width, DONE swaps the icon to violet, adds the tick and rises its body
 * in over 450ms.
 *
 * The shell knows nothing about what a section contains. `tools` renders chips,
 * `workflow` renders an arrow chain, `prompts` renders a line of prose — so the
 * body is a child, and each of the six bodies is its own small component. That
 * is the whole reason the panel needs no switch statement over section types.
 */

interface PlanSectionProps {
  label: string
  /** Single-path icon data from PLAN_SECTION_ICONS. */
  icon: string
  /** False while the section is still waiting for its content. */
  done: boolean
  /** True while a request is in flight, so the skeleton shimmers. */
  animated: boolean
  children: ReactNode
}

export default function PlanSection({ label, icon, done, animated, children }: PlanSectionProps) {
  return (
    <div className="flex flex-col gap-[9px] rounded-[15px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(12,10,22,0.82),rgba(8,7,16,0.88))] px-[13px] py-3 transition-[border-color,background] duration-300 ease-in-out hover:border-[rgba(178,150,255,0.26)] hover:bg-[linear-gradient(180deg,rgba(18,14,30,0.86),rgba(10,8,20,0.9))]">
      <div className="flex items-center gap-[9px]">
        <span
          className={`flex h-6 w-6 flex-none items-center justify-center rounded-tag border bg-white/[0.03] ${
            done ? 'border-[rgba(178,150,255,0.3)] text-[#C6B2FF]' : 'border-white/[0.07] text-[#6A6485]'
          }`}
        >
          <PlanSectionIcon path={icon} className="h-[13px] w-[13px]" />
        </span>
        <span className="text-[10.5px] font-semibold tracking-[0.14em] text-[#8A83A6] uppercase">
          {label}
        </span>
        {done && (
          <span
            aria-hidden="true"
            className="ml-auto flex h-4 w-4 items-center justify-center rounded-full border border-[rgba(178,150,255,0.36)] bg-[rgba(124,88,244,0.16)] text-[#C8AEFF] [animation:akFade_.45s_ease_both]"
          >
            <CheckIcon className="h-[9px] w-[9px]" />
          </span>
        )}
      </div>

      {done ? (
        <div className="[animation:akRise_.45s_cubic-bezier(.16,.84,.44,1)_both]">{children}</div>
      ) : (
        <PlanSectionSkeleton animated={animated} />
      )}
    </div>
  )
}

/**
 * The design's two-bar placeholder.
 *
 * The sheen runs only while a request is actually in flight. A section that is
 * empty because the assistant asked a clarifying question instead of planning is
 * waiting on the READER, and a bar that keeps shimmering at them would say the
 * opposite.
 */
function PlanSectionSkeleton({ animated }: { animated: boolean }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-[6px]">
      {[
        { width: '84%', tint: 'rgba(196,168,255,0.24)', delay: '0s' },
        { width: '54%', tint: 'rgba(196,168,255,0.18)', delay: '.3s' },
      ].map((bar) => (
        <span
          key={bar.width}
          style={{ width: bar.width }}
          className="relative block h-2 overflow-hidden rounded-[5px] bg-white/[0.05]"
        >
          {animated && (
            <span
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg,transparent,${bar.tint},transparent)`,
                animation: `akSheen 1.7s ease-in-out ${bar.delay} infinite`,
              }}
            />
          )}
        </span>
      ))}
    </div>
  )
}
