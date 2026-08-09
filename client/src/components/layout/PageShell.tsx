import { Outlet, useLocation } from 'react-router-dom'
import AmbientBackground from '@/components/layout/AmbientBackground'
import Footer from '@/components/layout/Footer'
import Header from '@/components/layout/Header'
import ScrollToTop from '@/components/layout/ScrollToTop'
import HeroStage from '@/pages/home/sections/HeroStage'

/*
 * The persistent site shell, used as the router's layout route.
 *
 * Source: AI Tool Kart Site.dc.html, [data-ak-root].
 *
 * The design nests <footer> inside <main>; here they are siblings inside the
 * same stacking context. Visually identical, semantically cleaner.
 *
 * HeroStage renders here rather than inside HomePage because the design places
 * it at the root (`sc-if isHome` beside the header), anchored to y=0 so the
 * wings sit behind the sticky header. Mounting it inside <main> would push it
 * down by the header's height.
 */

export default function PageShell() {
  const isHome = useLocation().pathname === '/'

  return (
    <div className="relative min-h-screen overflow-x-clip bg-canvas text-body">
      <ScrollToTop />
      <AmbientBackground />
      {isHome && <HeroStage />}
      <Header />

      <div className="relative z-[1]">
        <main>
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}
