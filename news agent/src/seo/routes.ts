/*
 * Internal-link target registry.
 *
 * ── Why this is a hand-maintained allowlist ──────────────────────────────────
 *
 * A broken internal link is worse than no internal link: it is a 404 shipped to
 * readers and a negative SEO signal, caused by the very step that was supposed
 * to help. So the model never composes a URL. It is handed a menu of routes that
 * are known to exist and may only choose from it; anything it returns that is
 * not on the menu is dropped (seo/validate.ts).
 *
 * The static routes below are transcribed from client/src/App.tsx. They are
 * duplicated here deliberately rather than imported: the agent is a separate
 * Node process with its own tsconfig, and importing frontend source would couple
 * the pipeline to the React build. The trade is a small, explicit list that must
 * be updated by hand if routing changes — checked by a test that fails loudly if
 * this list drifts from what the router actually defines.
 *
 * ── What is deliberately absent ──────────────────────────────────────────────
 *
 * Individual TOOL pages. The tool catalogue is still frontend mock data
 * (client/src/data/tools.ts) with no server-side source of truth, so the agent
 * cannot confirm that any given tool page exists or what its slug is. Per §7,
 * where there is no reliable target, the link is omitted rather than guessed.
 * When the backend catalogue lands, tool routes join this registry.
 *
 * CATEGORY pages are also absent: /browse takes taxonomy through query
 * parameters whose vocabulary lives in frontend data, so a category deep link
 * cannot be verified from here either. /browse itself is offered instead.
 */

export interface InternalRoute {
  path: string
  label: string
  /** What this page is for, so the model can pick a genuinely relevant one. */
  description: string
}

/** Static routes defined by the React router. Update together with App.tsx. */
export const STATIC_ROUTES: InternalRoute[] = [
  { path: '/browse', label: 'Browse AI tools', description: 'the searchable catalogue of AI tools' },
  { path: '/workflows', label: 'Workflows', description: 'task-based AI tool workflows and setups' },
  { path: '/compare', label: 'Compare tools', description: 'side-by-side AI tool comparison' },
  { path: '/new-launches', label: 'New launches', description: 'recently launched AI tools' },
  { path: '/blog', label: 'Blog', description: 'AI Tool Kart news and articles' },
]

export interface LinkRegistryOptions {
  /**
   * Slugs of articles this agent already published. These are the only
   * /blog/:slug targets that can be confirmed to exist, because we created them.
   */
  publishedSlugs?: Array<{ slug: string; title: string }>
}

/** The menu offered to the model, and the set a suggestion is validated against. */
export function buildLinkRegistry(options: LinkRegistryOptions = {}): InternalRoute[] {
  const routes = [...STATIC_ROUTES]

  for (const article of options.publishedSlugs ?? []) {
    if (!article.slug) continue
    routes.push({
      path: `/blog/${article.slug}`,
      label: article.title,
      description: 'a previously published AI Tool Kart article',
    })
  }

  return routes
}

/** Exact-match check. No normalisation, no fuzzy matching, no benefit of the doubt. */
export function isKnownRoute(path: string, registry: InternalRoute[]): boolean {
  return registry.some((route) => route.path === path)
}

/**
 * Keeps only suggestions that name a real route.
 *
 * Silently dropping is correct here: an unknown target is not worth failing an
 * otherwise sound article over, and the alternative — rendering it — is the
 * broken link this module exists to prevent.
 */
export function retainKnownRoutes(
  suggested: string[],
  registry: InternalRoute[],
  limit: number,
): { kept: string[]; dropped: string[] } {
  const kept: string[] = []
  const dropped: string[] = []

  for (const candidate of suggested) {
    const trimmed = candidate.trim()
    if (kept.length < limit && trimmed && isKnownRoute(trimmed, registry) && !kept.includes(trimmed)) {
      kept.push(trimmed)
    } else if (!isKnownRoute(trimmed, registry)) {
      dropped.push(trimmed)
    }
  }

  return { kept, dropped }
}
