/*
 * The badge that sits on a card's artwork, top right.
 *
 * Source: AI Tool Kart Site.dc.html — the browse card's `t.hasBadge` pill: a
 * compact uppercase capsule with a lit dot, a violet rim and a dark violet
 * fill, floated over the media band.
 *
 * One component, one style, used by every surface that renders a card. Browse
 * uses it today; Featured, Recently added and New launches render the same
 * card and therefore the same badge.
 *
 * The badge TEXT is decided by `badgeFor` in toolCardTone.ts, beside the card's
 * other derived presentation values. This file is only how one looks.
 */

interface CardBadgeProps {
  children: string
}

export default function CardBadge({ children }: CardBadgeProps) {
  return (
    <span className="inline-flex max-w-full items-center gap-[5px] rounded-pill border border-[rgba(190,164,255,0.42)] bg-[linear-gradient(180deg,rgba(96,64,190,0.55),rgba(46,30,96,0.5))] px-[10px] py-[5px] text-[9.5px] font-bold tracking-[0.13em] text-[#EADFFF] uppercase shadow-[0_8px_18px_-12px_rgba(124,88,244,0.9)] backdrop-blur-[6px]">
      <span
        aria-hidden="true"
        className="h-[4.5px] w-[4.5px] flex-none rounded-full bg-[#C4AAFF] shadow-[0_0_8px_1.5px_rgba(167,139,250,0.9)]"
      />
      {/* Truncates rather than wrapping, so a long curated badge shortens
          instead of growing the capsule across the monogram behind it.
          `min-w-0` is what lets a flex item shrink below its content width —
          without it `truncate` has nothing to truncate against. */}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}
