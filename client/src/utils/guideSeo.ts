import { automationPath } from '@/components/automations/labels'
import type { WorkflowGuide } from '@/types/guide'

/*
 * Everything a guide page says to search engines — ONE source for both
 * places that say it:
 *
 *   - the browser, through hooks/useDocumentMeta (after a client navigation),
 *   - the build, through scripts/prerender.mjs (the HTML a crawler receives).
 *
 * If the two ever disagreed, a crawler and a reader would see different
 * pages. So neither builds tags itself; both call guideHead() and render
 * guideJsonLd().
 *
 * ── Only what the page shows ─────────────────────────────────────────────────
 *
 * Structured data describes visible content and nothing else:
 *   BreadcrumbList  always — the breadcrumb is on the page.
 *   Article         always — the page is an article, bylined "AI Tool Kart".
 *                   No dates: the records carry none we could honestly use.
 *   HowTo           only for AUTHORED steps. The three derived steps ("Open
 *                   the tool", "Use this prompt", "How it works") are not a
 *                   procedure a person wrote, and the last is a description,
 *                   not a step — marking them up as a HowTo would overstate
 *                   the page.
 *   FAQPage         never, yet: no guide has question-and-answer content.
 *                   Common issues are problem/solution notes, not FAQs.
 */

export const SITE_NAME = 'AI Tool Kart'

/** Google shows roughly this many characters of a title. */
const TITLE_BUDGET = 60
const HEADLINE_MAX = 110

/**
 * The public origin every absolute URL is built from — canonical, og:url,
 * JSON-LD. `VITE_SITE_URL` in any deployment (the prerender refuses to run
 * without it); the current origin is only a development fallback.
 */
export function siteOrigin(): string {
  const configured = import.meta.env.VITE_SITE_URL?.trim().replace(/\/+$/, '')
  if (configured) return configured
  return typeof window === 'undefined' ? '' : window.location.origin
}

export interface HeadTags {
  title: string
  description: string
  /** Absolute. Absent on a page that should not be canonicalised (not found). */
  canonical?: string
  robots: string
  og: {
    type: 'article' | 'website'
    title: string
    description: string
    url?: string
  }
}

export function guideUrl(guide: Pick<WorkflowGuide, 'niche' | 'slug'>, origin: string): string {
  return `${origin}${automationPath(guide.niche, guide.slug)}`
}

/** "{task} — Step-by-step AI guide | AI Tool Kart", dropping the middle when the task is long. */
export function guideTitle(guide: Pick<WorkflowGuide, 'title'>): string {
  return guide.title.length > TITLE_BUDGET
    ? `${guide.title} | ${SITE_NAME}`
    : `${guide.title} — Step-by-step AI guide | ${SITE_NAME}`
}

export function guideHead(guide: WorkflowGuide, origin: string): HeadTags {
  const url = guideUrl(guide, origin)
  return {
    title: guideTitle(guide),
    description: guide.metaDescription,
    canonical: url,
    robots: guide.indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow',
    og: { type: 'article', title: guide.title, description: guide.metaDescription, url },
  }
}

/** The not-found state: never indexed, never canonicalised. */
export function notFoundHead(): HeadTags {
  const title = `Guide not found | ${SITE_NAME}`
  const description = 'This workflow guide could not be found.'
  return { title, description, robots: 'noindex, follow', og: { type: 'website', title, description } }
}

export function guideJsonLd(guide: WorkflowGuide, origin: string): object[] {
  const url = guideUrl(guide, origin)
  const organization = { '@type': 'Organization', name: SITE_NAME, url: `${origin}/` }
  const description = guide.metaDescription

  const graph: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Automations', item: `${origin}/automations` },
        {
          '@type': 'ListItem',
          position: 3,
          name: guide.niche,
          item: `${origin}/automations?niche=${encodeURIComponent(guide.niche)}`,
        },
        { '@type': 'ListItem', position: 4, name: guide.title, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: guide.title.length > HEADLINE_MAX ? `${guide.title.slice(0, HEADLINE_MAX - 1)}…` : guide.title,
      description,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      author: organization,
      publisher: organization,
      about: guide.searchTerms,
    },
  ]

  if (guide.isEditorial) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: guide.title,
      description: guide.intro[0] ?? guide.summary,
      url,
      tool: guide.tools.map((tool) => ({ '@type': 'HowToTool', name: tool.name })),
      step: guide.steps.map((step) => ({
        '@type': 'HowToStep',
        position: step.number,
        name: step.title,
        text: [step.body, ...step.instructions].filter(Boolean).join(' ') || step.prompt || step.title,
        url: `${url}#${step.id}`,
      })),
    })
  }

  return graph
}

/** JSON for a <script> body: `<` escaped so a record's text can never close the tag. */
export function scriptJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
