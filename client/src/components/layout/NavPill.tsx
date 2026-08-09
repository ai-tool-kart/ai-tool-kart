import { Link, NavLink } from 'react-router-dom'
import mark from '@/assets/mark.png'
import { NAV_ITEMS } from '@/data/navigation'

/*
 * The glass nav pill.
 *
 * Source: AI Tool Kart Site.dc.html, [data-navpill].
 *
 * Two notes on fidelity:
 *  - "Sign in" has no handler in the design (a bare <span> with a hover colour).
 *    It stays inert here rather than being pointed at an invented destination.
 *  - "Get started free" carries data-magnet="1" in the source; the magnetic-hover
 *    hook arrives in Phase 9, so the attribute is preserved as the anchor. Its
 *    destination is real — the design's goSignup() routes to the pricing view.
 */

export default function NavPill() {
  return (
    <div
      data-navpill="1"
      className="mx-auto flex max-w-nav items-center gap-[26px] rounded-nav border border-hairline bg-nav-glass py-2 pr-2 pl-[18px] shadow-nav backdrop-blur-[28px] backdrop-saturate-[1.7] transition-[background,box-shadow,border-color] duration-500 ease-[ease]"
    >
      <Link
        to="/"
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

      <nav className="flex flex-auto items-center justify-center gap-[2px]">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="relative rounded-pill px-[14px] py-2 text-[14px] font-medium text-subtle-soft transition-[background-color,color] duration-[250ms] hover:bg-white/[0.06] hover:text-ink"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute inset-0 rounded-pill bg-white/[0.07] shadow-nav-item" />
                )}
                <span className="relative">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-none items-center gap-[10px]">
        {/* Inert in the design — no destination exists for it. */}
        <span className="px-[6px] text-[14px] font-medium text-subtle-soft transition-colors duration-[250ms] hover:text-ink">
          Sign in
        </span>
        <Link
          to="/pricing"
          data-magnet="1"
          className="rounded-pill border border-white/[0.18] bg-[image:var(--gradient-cta)] px-[18px] py-[10px] text-[14px] font-semibold text-white shadow-button transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:text-white hover:shadow-button-hover"
        >
          Get started free
        </Link>
      </div>
    </div>
  )
}
