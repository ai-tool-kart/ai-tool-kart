import { HERO_KINDS, type HeroKindIcon } from '@/data/hero'

/*
 * The catalogue-kind selector above the headline.
 *
 * Source: AI Tool Kart Site.dc.html, the `kindTabs` pill group in the Hero
 * section — a glass rail, the selected tab wearing a violet gradient pill with
 * an inset highlight and two outer glows.
 *
 * The handoff has three tabs; "AI Agents" was dropped by product decision, so
 * this renders two. The rail is `inline-flex` and shrinks to its contents, so
 * losing a tab narrows it around the remaining pair rather than leaving a hole
 * — but two tabs sitting side by side make a width difference obvious in a way
 * three did not (the remaining pair measured 165.1px and 161.7px).
 *
 * So the rail is an `inline-grid` of two equal columns rather than a flex row.
 * An intrinsically-sized grid gives equal `1fr` columns the width of the widest
 * one, so both pills match exactly and keep matching if a label is reworded;
 * inside a shrink-to-fit FLEX row there is no free space to distribute, so
 * `flex-1` would have left them at their own content widths, and a hard px
 * width would have gone stale the first time someone edited the copy.
 *
 * Below 380px the columns stack — the flex row used to wrap for the same
 * reason, and two nowrap pills do not fit a narrow phone side by side.
 *
 * That is the only change the removal required.
 *
 * The selection drives nothing but its own highlight, in the design and here.
 * See the note on HERO_KINDS in data/hero.ts.
 */

const ICONS: Record<HeroKindIcon, React.ReactElement> = {
  workflows: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      className="h-[17px] w-[17px]"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </svg>
  ),
  mcp: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[17px] w-[17px]"
    >
      <rect x="3.5" y="4" width="17" height="6.4" rx="2" />
      <rect x="3.5" y="13.6" width="17" height="6.4" rx="2" />
      <path d="M7.2 7.2h.01" />
      <path d="M7.2 16.8h.01" />
    </svg>
  ),
}

interface KindTabsProps {
  value: string
  onChange: (label: string) => void
}

export default function KindTabs({ value, onChange }: KindTabsProps) {
  return (
    <div className="mb-[46px] flex justify-center [animation:akFade_1.2s_cubic-bezier(.16,.84,.44,1)_both]">
      <div
        role="tablist"
        aria-label="Catalogue kind"
        className="inline-grid grid-cols-1 items-center gap-1 rounded-pill border border-white/[0.085] bg-[rgba(10,8,17,0.55)] p-[5px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_44px_-30px_rgba(0,0,0,1)] backdrop-blur-[24px] backdrop-saturate-[1.5] min-[380px]:grid-cols-2"
      >
        {HERO_KINDS.map((kind) => {
          const active = kind.label === value
          return (
            <button
              key={kind.label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(kind.label)}
              className={`relative inline-flex cursor-pointer items-center justify-center gap-[9px] rounded-pill px-[22px] py-[11px] text-[15px] font-semibold tracking-[-0.014em] whitespace-nowrap transition-colors duration-300 ${
                active ? 'text-white' : 'text-[#8F89A8] hover:text-[#DCD6F0]'
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-pill border border-[rgba(167,139,250,0.5)] bg-[linear-gradient(180deg,rgba(124,90,246,0.42)_0%,rgba(84,54,190,0.34)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_30px_-16px_rgba(116,80,244,0.9),0_0_34px_-14px_rgba(167,139,250,0.8)]"
                />
              )}
              <span className="relative flex items-center">{ICONS[kind.icon]}</span>
              <span className="relative">{kind.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
