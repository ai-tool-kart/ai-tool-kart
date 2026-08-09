import { Outlet } from 'react-router-dom'
import AmbientBackground from '@/components/layout/AmbientBackground'
import Footer from '@/components/layout/Footer'
import Header from '@/components/layout/Header'
import ScrollToTop from '@/components/layout/ScrollToTop'

/*
 * The persistent site shell, used as the router's layout route.
 *
 * Source: AI Tool Kart Site.dc.html, [data-ak-root].
 *
 * The design nests <footer> inside <main>; here they are siblings inside the
 * same stacking context. Visually identical, semantically cleaner.
 */

export default function PageShell() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-canvas text-body">
      <ScrollToTop />
      <AmbientBackground />
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
