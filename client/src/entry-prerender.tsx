import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import AuthProvider from '@/components/auth/AuthProvider'
import App from '@/App'
import { automationPath } from '@/components/automations/labels'
import { setGuideSeed } from '@/services/guideSeed'
import type { AutomationDetail } from '@/types/automation'
import { guideHead, type HeadTags } from '@/utils/guideSeo'
import { buildWorkflowGuide } from '@/utils/workflowGuide'

/*
 * The build-time renderer for guide pages — scripts/prerender.mjs's only way
 * into the app. Built with `vite build --ssr` into dist-ssr/ (gitignored).
 *
 * It renders the REAL app — shell, header, footer, the guide page — for one
 * guide's URL, with that guide's API record seeded (services/guideSeed.ts),
 * so the static HTML is exactly what the SPA renders: no second template to
 * drift from the first. Effects do not run here, which is correct: they are
 * interaction, not content.
 */

export interface PrerenderedGuide {
  path: string
  html: string
  head: HeadTags
}

export function renderGuide(detail: AutomationDetail, origin: string): PrerenderedGuide {
  const path = automationPath(detail.niche, detail.slug)
  setGuideSeed(detail)
  try {
    const html = renderToString(
      <StaticRouter location={path}>
        {/* Same tree as main.tsx. renderToString runs no effects, so this
            stays 'loading' and never calls the API at build time. */}
        <AuthProvider>
          <App />
        </AuthProvider>
      </StaticRouter>,
    )
    return { path, html, head: guideHead(buildWorkflowGuide(detail), origin) }
  } finally {
    setGuideSeed(undefined)
  }
}
