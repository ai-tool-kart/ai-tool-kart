import { Link } from 'react-router-dom'
import TrendingMarquee from '@/components/tools/TrendingMarquee'
import { TOOLS } from '@/data/tools'

/*
 * Full-bleed trending row. Unlike the other sections this one has no container
 * max-width — the marquee runs edge to edge behind a mask.
 */

export default function TrendingSection() {
  return (
    <section className="overflow-hidden pt-24">
      <div
        data-reveal="0"
        className="mx-auto flex max-w-site items-end justify-between gap-6 px-8"
      >
        <div>
          <div className="text-[11.5px] tracking-[0.2em] uppercase text-accent">
            Trending this week
          </div>
          <h2 className="mt-3 text-[40px] font-bold tracking-[-0.032em] text-ink">
            What people are switching to
          </h2>
        </div>
        <Link
          to="/browse"
          className="text-[14.5px] font-medium whitespace-nowrap text-muted-soft transition-colors duration-200 hover:text-accent"
        >
          See the full catalog →
        </Link>
      </div>
      <TrendingMarquee tools={TOOLS} />
    </section>
  )
}
