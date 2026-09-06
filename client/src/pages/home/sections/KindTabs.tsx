import { HERO_KINDS, type HeroKindIcon } from '@/data/hero'

/*
 * The three-way catalogue-kind selector above the headline.
 *
 * Source: AI Tool Kart Site.dc.html, the `kindTabs` pill group in the Hero
 * section — a glass rail holding three tabs, the selected one wearing a violet
 * gradient pill with an inset highlight and two outer glows.
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
  agents: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[17px] w-[17px]"
    >
      <rect x="3.6" y="7.5" width="16.8" height="12" rx="3" />
      <path d="M12 3.4v4.1" />
      <path d="M9 12.6v1.8" />
      <path d="M15 12.6v1.8" />
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
        className="inline-flex flex-wrap items-center justify-center gap-1 rounded-pill border border-white/[0.085] bg-[rgba(10,8,17,0.55)] p-[5px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_44px_-30px_rgba(0,0,0,1)] backdrop-blur-[24px] backdrop-saturate-[1.5]"
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
              className={`relative inline-flex cursor-pointer items-center gap-[9px] rounded-pill px-[22px] py-[11px] text-[15px] font-semibold tracking-[-0.014em] whitespace-nowrap transition-colors duration-300 ${
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
