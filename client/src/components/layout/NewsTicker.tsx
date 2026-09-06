import { Link } from 'react-router-dom'
import { TICKER_ITEMS, type TickerItem } from '@/data/ticker'

/*
 * The announcement rail that sits above the nav pill.
 *
 * Source: AI Tool Kart Site.dc.html, the 940px glass pill inside [data-header] —
 * a 34s marquee of update lines behind an edge mask, with a "View all updates"
 * chip pinned to the right.
 *
 * The marquee is the standard duplicate-track trick: the same list is rendered
 * twice and the pair translated -50%, so the loop point is seamless. The second
 * copy is aria-hidden and the whole rail is a <div>, not a list, because to a
 * screen reader this is one decorative repetition, not ten items.
 *
 * `[data-marquee]`/`[data-marquee-track]` are read by the pause-on-hover rule in
 * styles/animations.css, exactly as in the source.
 */

function Track({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div
      aria-hidden={ariaHidden || undefined}
      className="flex items-center gap-4 pr-4 whitespace-nowrap"
    >
      {TICKER_ITEMS.map((item: TickerItem) => (
        <span key={item.text} className="flex items-center gap-4">
          <span
            className={`inline-flex items-center gap-[6px] text-[12px] tracking-[-0.006em] transition-colors duration-300 ${
              item.isNew
                ? 'font-medium text-[#EDE9F8] hover:text-[#F3F0FC]'
                : 'text-[#CFC9E2] hover:text-white'
            }`}
          >
            {item.isNew && (
              <span className="text-[10px] font-bold tracking-[0.08em] text-[#C4AAFF]">NEW</span>
            )}
            {item.text}
          </span>
          <span aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-white/[0.32]" />
        </span>
      ))}
    </div>
  )
}

export default function NewsTicker() {
  return (
    <div
      className="relative mx-auto mt-1 mb-[5px] max-w-[940px] overflow-hidden rounded-pill bg-ticker-glass shadow-ticker backdrop-blur-[20px] backdrop-saturate-[1.5] [mask-image:linear-gradient(90deg,rgba(0,0,0,0)_0%,#000_7%,#000_93%,rgba(0,0,0,0)_100%)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0)_52%),radial-gradient(ellipse_46%_220%_at_50%_-60%,rgba(140,100,250,0.12)_0%,rgba(140,100,250,0)_72%)]"
      />

      <div className="relative flex h-[30px] items-center gap-[14px] pr-[14px]">
        <div
          data-marquee="1"
          className="flex h-full min-w-0 flex-auto items-center overflow-hidden [mask-image:linear-gradient(90deg,rgba(0,0,0,0)_0%,#000_5%,#000_92%,rgba(0,0,0,0)_100%)]"
        >
          <div
            data-marquee-track="1"
            className="flex w-max items-center will-change-transform [animation:akMarquee_34s_linear_infinite]"
          >
            <Track />
            <Track ariaHidden />
          </div>
        </div>

        {/* Hidden below the nav's breakpoint: at that width the rail is already
            down to a few characters of headline, and the chip crowds it out. */}
        <Link
          to="/browse"
          data-magnet="1"
          className="hidden h-[26px] flex-none items-center gap-[7px] rounded-pill border border-white/[0.14] bg-[image:var(--gradient-chrome)] px-3 text-[12px] font-medium tracking-[-0.006em] text-[#DCD7EA] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(0,0,0,0.35)] backdrop-blur-[10px] backdrop-saturate-[1.25] transition-[color,border-color,background,box-shadow] duration-300 hover:border-white/[0.28] hover:bg-[image:var(--gradient-chrome-hover)] hover:text-white min-[720px]:inline-flex"
        >
          View all updates
          <span aria-hidden="true" className="text-[12px] leading-none">
            →
          </span>
        </Link>
      </div>
    </div>
  )
}
