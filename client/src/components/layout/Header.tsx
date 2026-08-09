import NavPill from '@/components/layout/NavPill'

/*
 * Sticky header wrapper.
 * Source: AI Tool Kart Site.dc.html, [data-header].
 */

export default function Header() {
  return (
    <header data-header="1" className="sticky top-0 z-[60] bg-transparent px-6 pt-5">
      <NavPill />
    </header>
  )
}
