import { Route, Routes } from 'react-router-dom'
import PageShell from '@/components/layout/PageShell'
import BlogArticlePage from '@/pages/BlogArticlePage'
import BlogPage from '@/pages/BlogPage'
import BrowsePage from '@/pages/BrowsePage'
import ComparePage from '@/pages/ComparePage'
import HomePage from '@/pages/HomePage'
import NewLaunchesPage from '@/pages/NewLaunchesPage'
import KitchenSinkPage from '@/pages/KitchenSinkPage'
import NotFoundPage from '@/pages/NotFoundPage'
import SubmitPage from '@/pages/SubmitPage'

/*
 * Route table only — no markup, no state, no data fetching.
 *
 * Blog content is loaded by the blog pages through hooks/useBlogPosts, not here:
 * the shell must render even when the CMS is unreachable.
 */

export default function App() {
  return (
    <Routes>
      <Route element={<PageShell />}>
        <Route index element={<HomePage />} />
        <Route path="browse" element={<BrowsePage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="blog" element={<BlogPage />} />
        <Route path="blog/:slug" element={<BlogArticlePage />} />
        <Route path="new-launches" element={<NewLaunchesPage />} />
        <Route path="submit" element={<SubmitPage />} />
        {/* TEMPORARY — Phase 3 component verification surface, removed in Phase 11. */}
        <Route path="kitchen-sink" element={<KitchenSinkPage />} />
        {/* Keeps retired URLs (e.g. the old /pricing) inside the shell. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
