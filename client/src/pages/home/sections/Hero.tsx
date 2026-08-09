import { useNavigate } from 'react-router-dom'
import SearchBar from '@/components/search/SearchBar'
import Chip from '@/components/ui/Chip'
import StatBlock from '@/components/ui/StatBlock'
import { POPULAR_SEARCHES } from '@/data/filters'
import { HERO_STATS } from '@/data/stats'

/*
 * Hero: status pill, two-line headline with the gradient/typed phrase, sub-copy,
 * search shell, popular searches and the stats strip.
 *
 * The headline's second line is the `data-typed` target — Phase 9 cycles it
 * through the design's phrase list. Until then it renders the first phrase, which
 * is exactly what the prototype shows on load. The caret blink is pure CSS
 * (akCaret) so it is already faithful.
 */

const TYPED_PHRASE = 'what you actually need'

export default function Hero() {
  const navigate = useNavigate()

  return (
    <section className="relative z-[1] mx-auto max-w-site px-8 pt-[148px] text-center">
      <div className="inline-flex items-center gap-[11px] text-[13.5px] tracking-[-0.005em] text-[#B3ACC8] [animation:akFade_1.2s_cubic-bezier(.16,.84,.44,1)_both]">
        <span
          aria-hidden="true"
          className="h-[9px] w-[9px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#F0E6FF,#9C5CF6_70%)] shadow-[0_0_14px_3px_rgba(156,92,246,0.85),0_0_32px_8px_rgba(156,92,246,0.35)] [animation:akPulse_3s_ease-in-out_infinite]"
        />
        2,412 tools indexed · 61 added this week
      </div>

      <h1 className="mx-auto mt-9 max-w-[1000px] pb-[14px] text-hero font-bold text-balance text-ink-bright">
        <span className="block [animation:akLineIn_1.25s_cubic-bezier(.16,.84,.44,1)_.1s_both]">
          Every AI tool, sorted by
        </span>
        <span className="block [animation:akLineIn_1.25s_cubic-bezier(.16,.84,.44,1)_.26s_both]">
          <span className="inline-block max-w-full whitespace-nowrap">
            <span className="bg-[linear-gradient(96deg,#FFFFFF_0%,#EADCFF_34%,#BE9CFF_62%,#FFFFFF_100%)] bg-[length:230%_100%] bg-clip-text text-transparent drop-shadow-[0_0_26px_rgba(167,139,250,0.34)] [animation:akGradient_30s_ease-in-out_infinite]">
              <span data-typed="1">{TYPED_PHRASE}</span>
            </span>
            <span
              aria-hidden="true"
              className="ml-2 inline-block h-[0.7em] w-[3px] rounded-[2px] bg-[#C9B2FF] align-baseline shadow-[0_0_14px_2px_rgba(167,139,250,0.7)] [animation:akCaret_1.2s_steps(1,end)_infinite]"
            />
          </span>
        </span>
      </h1>

      <p className="mx-auto mt-7 max-w-[568px] text-[17px] leading-[1.62] text-pretty text-[#9C96B2] [animation:akLineIn_1.25s_cubic-bezier(.16,.84,.44,1)_.42s_both]">
        Search the catalog, compare tools side by side, and get recommendations from the stack
        you already run. No affiliate rankings — every listing is tested and dated.
      </p>

      <div className="relative mx-auto mt-[54px] max-w-[640px] [animation:akLineIn_1.6s_cubic-bezier(.16,.84,.44,1)_.56s_both]">
        {/* Glow pooled beneath the search shell. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-[6%] bottom-[-22px] left-[6%] rounded-search bg-[radial-gradient(ellipse_54%_130%_at_50%_52%,rgba(132,88,250,0.3)_0%,rgba(132,88,250,0)_74%)] blur-[36px]"
        />
        <SearchBar />

        <div className="mt-6 flex flex-wrap justify-center gap-[7px]">
          <span className="px-[2px] py-[6px] text-[12.5px] text-subtle-dim">Popular:</span>
          {POPULAR_SEARCHES.map((label) => (
            <Chip
              key={label}
              variant="popular"
              onClick={() => navigate(`/browse?q=${encodeURIComponent(label)}`)}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div data-reveal="0" className="mt-[104px]">
        <div className="flex items-center gap-[22px]">
          <div className="h-px flex-auto bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.16)_100%)]" />
          <div className="text-[11px] tracking-[0.22em] whitespace-nowrap uppercase text-subtle-dim">
            Independent · tested · dated
          </div>
          <div className="h-px flex-auto bg-[linear-gradient(90deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_100%)]" />
        </div>
        <div className="mt-9 grid grid-cols-4 gap-6">
          {HERO_STATS.map((stat) => (
            <StatBlock key={stat.label} value={stat.value} label={stat.label} />
          ))}
        </div>
      </div>
    </section>
  )
}
