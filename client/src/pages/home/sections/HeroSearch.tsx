import { useState } from 'react'
import { QUICK_TASKS } from '@/data/hero'

/*
 * The hero search — the design's centrepiece.
 *
 * Source: AI Tool Kart Site.dc.html, [data-hero-search]. Three stacked glow
 * layers sit behind a 62px-radius shell drawn with a padding-box/border-box
 * gradient pair (a gradient border, which CSS has no other way to express),
 * plus a top hairline, a violet top wash, and a focus ring that fades in.
 *
 * Below it, the "Popular right now" task chips, which carry the design's
 * selected/unselected tone pair.
 *
 * WHERE IT GOES: submitting hands the query to the AI Assistant panel directly
 * below the search, through the `onSubmit` the Hero passes in. This file has
 * never known where the query goes and still does not — swapping the destination
 * was a change to one callback in Hero.tsx and to nothing here.
 */

const SHELL_BACKGROUND =
  'linear-gradient(180deg,rgba(14,12,24,0.95) 0%,rgba(9,8,16,0.97) 52%,rgba(7,6,13,0.98) 100%) padding-box,' +
  'linear-gradient(158deg,rgba(240,232,255,0.72) 0%,rgba(190,164,255,0.3) 22%,rgba(255,255,255,0.06) 52%,rgba(160,120,250,0.24) 78%,rgba(214,196,255,0.5) 100%) border-box'

const CHIP_BASE =
  'cursor-pointer rounded-pill border px-[15px] py-2 text-[13px] font-medium whitespace-nowrap transition-[border-color,color,background-color,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[2px] hover:border-[rgba(178,150,255,0.42)] hover:text-[#F2EEFF]'

interface HeroSearchProps {
  /** Called with the trimmed query on Enter, on the CTA, and on a task chip. */
  onSubmit: (query: string) => void
  /** The chip currently reflected in the query, so its tone matches the design. */
  activeTask?: string
  /** True while the assistant turn this feeds is in flight. */
  busy?: boolean
}

export default function HeroSearch({ onSubmit, activeTask, busy = false }: HeroSearchProps) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  const submit = (value: string) => {
    if (busy) return
    const trimmed = value.trim()
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <div
      data-hero-search="1"
      className="relative mx-auto mt-[52px] w-[min(840px,100%)] [animation:akPanelIn_1.35s_cubic-bezier(.16,.84,.44,1)_.62s_both]"
    >
      {/* Ambient pool, rim halo and contact shadow beneath the shell. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[-150px] right-[-18%] bottom-[-190px] left-[-18%] bg-[radial-gradient(ellipse_50%_46%_at_50%_54%,rgba(167,139,250,0.46)_0%,rgba(126,80,240,0.19)_42%,rgba(96,52,210,0.05)_66%,rgba(96,52,210,0)_82%)] blur-[78px] [animation:akBloomPulse_11s_ease-in-out_-3s_infinite]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[-42px] right-[-6%] bottom-[-52px] left-[-6%] rounded-[60px] bg-[radial-gradient(ellipse_54%_50%_at_50%_8%,rgba(216,200,255,0.32)_0%,rgba(160,120,250,0.11)_46%,rgba(160,120,250,0)_74%)] blur-[34px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[10%] bottom-[-26px] left-[10%] h-[44px] rounded-[50%] bg-[radial-gradient(ellipse_50%_60%_at_50%_40%,rgba(6,4,16,0.8)_0%,rgba(6,4,16,0)_76%)] blur-[24px]"
      />

      <div
        style={{ background: SHELL_BACKGROUND }}
        className="relative flex items-center gap-[14px] rounded-[62px] border border-transparent py-[10px] pr-[10px] pl-6 shadow-[inset_0_1px_0_rgba(232,222,255,0.26),inset_0_0_46px_-18px_rgba(186,156,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.6),0_2px_6px_rgba(0,0,0,0.6),0_30px_64px_-34px_rgba(0,0,0,0.95),0_0_150px_-44px_rgba(167,139,250,0.9)] backdrop-blur-[22px] backdrop-saturate-[1.3] transition-shadow duration-500 max-[560px]:flex-wrap"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-[16%] left-[16%] h-px bg-[linear-gradient(90deg,transparent,rgba(240,232,255,0.8),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 left-0 h-[52%] rounded-t-[62px] bg-[linear-gradient(180deg,rgba(150,110,250,0.085)_0%,rgba(150,110,250,0)_100%)]"
        />
        {focused && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-px rounded-[63px] border border-[rgba(220,204,255,0.55)] shadow-[0_0_0_4px_rgba(124,90,246,0.14),0_0_100px_-18px_rgba(167,139,250,0.95)] [animation:akFade_.5s_ease_both]"
          />
        )}

        <span className="relative flex h-[22px] w-[22px] flex-none items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={focused ? '#D8CBFF' : '#8E87AC'}
            strokeWidth="1.9"
            strokeLinecap="round"
            aria-hidden="true"
            className="h-5 w-5 transition-[stroke] duration-[350ms] ease-[ease]"
          >
            <circle cx="10.5" cy="10.5" r="6.6" />
            <path d="M15.6 15.6 L20.5 20.5" />
          </svg>
        </span>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit(query)
          }}
          aria-label="Describe what you want to get done"
          placeholder="What do you want to get done?"
          className="relative min-w-0 flex-auto border-0 bg-transparent py-[15px] text-[16.5px] tracking-[-0.012em] text-ink outline-none"
        />

        <button
          type="button"
          onClick={() => submit(query)}
          disabled={busy}
          data-magnet="1"
          className="relative flex h-12 flex-none cursor-pointer items-center justify-center gap-2 rounded-[92px] border border-white/[0.24] bg-[linear-gradient(180deg,#B69CFF_0%,#7C5AF6_46%,#5B3EE0_100%)] px-6 text-[14.5px] font-semibold tracking-[-0.008em] whitespace-nowrap text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_12px_30px_-12px_rgba(116,80,244,1),0_0_44px_-14px_rgba(167,139,250,0.85)] transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_18px_40px_-12px_rgba(116,80,244,1),0_0_56px_-12px_rgba(176,140,255,0.95)] max-[560px]:w-full disabled:cursor-default disabled:opacity-60 disabled:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_12px_30px_-12px_rgba(116,80,244,1),0_0_44px_-14px_rgba(167,139,250,0.85)]"
        >
          Show Me How
          <span aria-hidden="true" className="text-[15px] leading-none">
            →
          </span>
        </button>
      </div>

      <div className="mt-[22px] flex flex-wrap items-center justify-center gap-[9px]">
        <span className="text-[13px] tracking-[-0.005em] whitespace-nowrap text-[#8C86A6]">
          Popular right now:
        </span>
        {QUICK_TASKS.map((task) => {
          const active = task === activeTask
          return (
            <button
              key={task}
              type="button"
              onClick={() => {
                setQuery(task)
                submit(task)
              }}
              disabled={busy}
              className={`${CHIP_BASE} disabled:cursor-default disabled:opacity-50 disabled:hover:translate-y-0 ${
                active
                  ? 'border-[rgba(178,150,255,0.5)] bg-[rgba(124,88,244,0.2)] text-[#F1EAFF]'
                  : 'border-white/[0.09] bg-white/[0.03] text-[#B9B3CC]'
              }`}
            >
              {task}
            </button>
          )
        })}
      </div>
    </div>
  )
}
