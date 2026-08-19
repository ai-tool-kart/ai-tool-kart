import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import mark from '@/assets/mark.png'
import { NAV_ITEMS } from '@/data/navigation'

/*
 * The glass nav pill.
 *
 * Source: ai tool kart ui design v2/AI Tool Kart Site.dc.html, [data-navpill] —
 * max-width 1060px, r22, rgba(13,11,19,0.66) behind a 28px blur, hairline border,
 * inset top highlight, and the violet "Submit Your Tool" CTA on the right.
 *
 * Active state: the design draws an inset rgba(255,255,255,0.07) pill behind the
 * selected item. Here that comes from NavLink's own isActive, not a pathname
 * comparison — see data/navigation.ts for how shared destinations opt out.
 *
 * The design is desktop-only markup with no menu affordance, so the responsive
 * behaviour below the nav's natural width is ours: the links collapse into a
 * disclosure panel that reuses the same pill surface, keeping the logo and the
 * CTA visible at every width.
 */

const LINK_BASE =
  'relative rounded-pill px-[14px] py-2 text-[14px] font-medium text-subtle-soft transition-[background-color,color] duration-[250ms] hover:bg-white/[0.06] hover:text-ink'

const CTA_CLASSES =
  'flex-none rounded-pill border border-white/[0.18] bg-[image:var(--gradient-cta)] px-[18px] py-[10px] text-[14px] font-semibold whitespace-nowrap text-white shadow-button transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:text-white hover:shadow-button-hover'

export default function NavPill() {
  const [menuOpen, setMenuOpen] = useState(false)

  const links = NAV_ITEMS.map((item) => (
    <NavLink
      key={item.label}
      to={item.to}
      end={item.to === '/'}
      onClick={() => setMenuOpen(false)}
      className={LINK_BASE}
    >
      {({ isActive }) => (
        <>
          {isActive && item.matchesRoute !== false && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-pill bg-white/[0.07] shadow-nav-item"
            />
          )}
          <span className="relative">{item.label}</span>
        </>
      )}
    </NavLink>
  ))

  return (
    <div
      data-navpill="1"
      className="mx-auto max-w-nav rounded-nav border border-hairline bg-nav-glass shadow-nav backdrop-blur-[28px] backdrop-saturate-[1.7] transition-[background,box-shadow,border-color] duration-500 ease-[ease]"
    >
      <div className="flex items-center gap-[26px] py-2 pr-2 pl-[18px]">
        <Link
          to="/"
          onClick={() => setMenuOpen(false)}
          className="flex flex-none items-center gap-[10px] transition-opacity duration-[250ms] hover:opacity-[0.72]"
        >
          <img
            src={mark}
            alt="ai tool kart"
            className="block h-[25px] w-6 opacity-[0.95] brightness-0 invert drop-shadow-[0_2px_10px_rgba(170,130,255,0.6)]"
          />
          <span className="text-[17.5px] font-bold tracking-[-0.026em] text-ink-soft">
            ai tool kart
          </span>
        </Link>

        {/* Full nav from 960px up; below that it moves into the panel. */}
        <nav className="hidden flex-auto items-center justify-center gap-[2px] min-[960px]:flex">
          {links}
        </nav>

        <div className="flex flex-auto items-center justify-end gap-[10px] min-[960px]:flex-none">
          <Link to="/submit" data-magnet="1" className={CTA_CLASSES}>
            Submit Your Tool
          </Link>

          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="nav-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-pill border border-hairline text-ink transition-[background-color,border-color] duration-200 hover:bg-white/[0.06] min-[960px]:hidden"
          >
            <span aria-hidden="true" className="flex w-[16px] flex-col gap-[4px]">
              <span className="h-[1.5px] w-full rounded-full bg-current" />
              <span className="h-[1.5px] w-full rounded-full bg-current" />
              <span className="h-[1.5px] w-full rounded-full bg-current" />
            </span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="nav-menu"
          className="flex flex-col gap-1 border-t border-hairline px-3 pt-3 pb-4 min-[960px]:hidden"
        >
          {links}
        </nav>
      )}
    </div>
  )
}
