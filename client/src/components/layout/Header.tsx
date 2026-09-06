import NavPill from '@/components/layout/NavPill'
import NewsTicker from '@/components/layout/NewsTicker'

/*
 * Sticky header wrapper.
 *
 * Source: AI Tool Kart Site.dc.html, [data-header] — the announcement ticker
 * rail sitting directly above the nav pill, both inside the same sticky block
 * with a 24px side gutter and no background of its own.
 */

export default function Header() {
  return (
    <header data-header="1" className="sticky top-0 z-[60] bg-transparent px-6">
      <NewsTicker />
      <NavPill />
    </header>
  )
}
