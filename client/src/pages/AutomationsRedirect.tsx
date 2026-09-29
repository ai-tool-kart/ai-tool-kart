import { Navigate, useLocation } from 'react-router-dom'
import { WORKFLOWS_ROUTE } from '@/data/navigation'

/*
 * /automations → /workflows, query string intact.
 *
 * /automations was the "Guides" listing. /workflows is now the one listing,
 * reading the same API with the same `q` and `niche` parameters, so every old
 * link — the nav item, a bookmarked `?niche=Real%20Estate` — lands on the same
 * results. `replace` keeps the dead URL out of history.
 *
 * Production answers this with a 301 before the app loads (client/vercel.json);
 * this covers in-app navigation and any host without that rule. Only the bare
 * listing redirects: /automations/:niche/:slug is the guide page and is untouched.
 */
export default function AutomationsRedirect() {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: WORKFLOWS_ROUTE, search, hash }} replace />
}
