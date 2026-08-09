import { Route, Routes } from 'react-router-dom'
import PageShell from '@/components/layout/PageShell'
import BrowsePage from '@/pages/BrowsePage'
import ComparePage from '@/pages/ComparePage'
import HomePage from '@/pages/HomePage'
import KitchenSinkPage from '@/pages/KitchenSinkPage'
import PricingPage from '@/pages/PricingPage'
import SubmitPage from '@/pages/SubmitPage'

/*
 * Route table only — no markup, no state.
 *
 * These five routes replace the prototype's in-memory `state.page` switch
 * ("home" | "browse" | "compare" | "pricing" | "submit").
 */

export default function App() {
  return (
    <Routes>
      <Route element={<PageShell />}>
        <Route index element={<HomePage />} />
        <Route path="browse" element={<BrowsePage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="submit" element={<SubmitPage />} />
        {/* TEMPORARY — Phase 3 component verification surface, removed in Phase 11. */}
        <Route path="kitchen-sink" element={<KitchenSinkPage />} />
      </Route>
    </Routes>
  )
}
