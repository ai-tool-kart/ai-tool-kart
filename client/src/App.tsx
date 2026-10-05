import { Route, Routes } from 'react-router-dom'
import PageShell from '@/components/layout/PageShell'
import AccountSubmissionsPage from '@/pages/AccountSubmissionsPage'
import AuthPage from '@/pages/AuthPage'
import AutomationDetailPage from '@/pages/AutomationDetailPage'
import AutomationsRedirect from '@/pages/AutomationsRedirect'
import BlogArticlePage from '@/pages/BlogArticlePage'
import BlogPage from '@/pages/BlogPage'
import BrowsePage from '@/pages/BrowsePage'
import ComparePage from '@/pages/ComparePage'
import HomePage from '@/pages/HomePage'
import McpServersPage from '@/pages/McpServersPage'
import NewLaunchesPage from '@/pages/NewLaunchesPage'
import NewsAgentDemoPage from '@/pages/NewsAgentDemoPage'
import KitchenSinkPage from '@/pages/KitchenSinkPage'
import NotFoundPage from '@/pages/NotFoundPage'
import SubmissionStatusPage from '@/pages/SubmissionStatusPage'
import SubmitPage from '@/pages/SubmitPage'
import WorkflowsPage from '@/pages/WorkflowsPage'

/*
 * Route table only — no markup, no state, no data fetching.
 *
 * Blog content is loaded by the blog pages through hooks/useBlogPosts, not here:
 * the shell must render even when the CMS is unreachable.
 */

export default function App() {
  return (
    <Routes>
      {/*
        Internal News Agent observability dashboard. Deliberately OUTSIDE
        PageShell: it is a local admin/debug surface, not part of the product,
        and it talks to the agent's own demo server rather than the site API.
      */}
      <Route path="news-agent-demo" element={<NewsAgentDemoPage />} />
      <Route element={<PageShell />}>
        <Route index element={<HomePage />} />
        <Route path="browse" element={<BrowsePage />} />
        <Route path="workflows" element={<WorkflowsPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="blog" element={<BlogPage />} />
        <Route path="blog/:slug" element={<BlogArticlePage />} />
        <Route path="new-launches" element={<NewLaunchesPage />} />
        <Route path="mcp-servers" element={<McpServersPage />} />
        {/* The old "Guides" listing — merged into /workflows. */}
        <Route path="automations" element={<AutomationsRedirect />} />
        <Route path="automations/:niche/:slug" element={<AutomationDetailPage />} />
        <Route path="submit" element={<SubmitPage />} />
        {/* Accounts (Phase 3). Not linked from the header yet — see data/navigation.ts. */}
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="account/submissions" element={<AccountSubmissionsPage />} />
        <Route path="account/submissions/:id" element={<SubmissionStatusPage />} />
        {/* TEMPORARY — Phase 3 component verification surface, removed in Phase 11. */}
        <Route path="kitchen-sink" element={<KitchenSinkPage />} />
        {/* Keeps retired URLs (e.g. the old /pricing) inside the shell. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
