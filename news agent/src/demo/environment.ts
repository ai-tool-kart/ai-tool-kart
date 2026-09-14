/*
 * Environment safety for the demo dashboard.
 *
 * The one job here: make it impossible to demonstrate the pipeline against the
 * production CMS by accident.
 *
 * The agent's own `.env` is the OPERATIONAL configuration and may legitimately
 * point at the live site. The demo must not edit it, and must not quietly
 * inherit it either — so this module reads whatever WordPress configuration the
 * process ended up with, decides whether that host is a development machine, and
 * refuses to start a publishing run when it is not. `.env.demo` (loaded after
 * `.env` by the `demo` npm script, so its values win) is the intended way to
 * point the demo at LocalWP.
 *
 * Nothing in the descriptor this module produces is a secret: a base URL and a
 * username are both visible in the WordPress admin. Credentials are read by
 * config/env.ts and never pass through here.
 */

import { isLocalDevelopmentHost, type AgentEnv } from '../config/env.ts'

export type WordPressLocality = 'local' | 'remote' | 'not-configured'

export interface DemoEnvironment {
  /** Fixed label for the dashboard banner. This server has no other mode. */
  environment: 'LOCAL DEVELOPMENT'
  wordpress: {
    locality: WordPressLocality
    /** Base REST URL, e.g. http://ai-tool-kart-cms.local/wp-json/wp/v2 */
    apiUrl?: string
    /** Site root derived from the REST URL, for building admin links. */
    siteUrl?: string
    username?: string
    /** WordPress admin URL for the post list, when the CMS is configured. */
    adminUrl?: string
  }
  llm: {
    provider: string
    /** Presence only. The key itself never leaves config/env.ts. */
    apiKeyConfigured: boolean
    modelFast?: string
    modelStrong?: string
  }
  limits: Record<string, number>
  /** True when a publishing run is allowed to start. */
  canRun: boolean
  /** Human-readable reason a publishing run is blocked. */
  blockedReason?: string
  /** Shown above the Run button when the CMS is unusable but a dry run is not. */
  dryRunOnly: boolean
  sources: Array<{
    id: string
    name: string
    publisher: string
    trustTier: number
    url: string
    enabled: boolean
    note?: string
  }>
}

/**
 * Derives the WordPress site root from its REST base.
 *
 * `http://host/wp-json/wp/v2` → `http://host`. Anything unexpected falls back to
 * the URL's origin, which is right for every standard install.
 */
export function siteRootFrom(apiUrl: string): string {
  try {
    const parsed = new URL(apiUrl)
    const index = parsed.pathname.indexOf('/wp-json')
    const prefix = index > 0 ? parsed.pathname.slice(0, index) : ''
    return `${parsed.origin}${prefix}`
  } catch {
    return apiUrl
  }
}

/** The WordPress editor screen for one post id. */
export function editorUrlFor(apiUrl: string, postId: number): string {
  return `${siteRootFrom(apiUrl)}/wp-admin/post.php?post=${postId}&action=edit`
}

export function describeEnvironment(
  env: AgentEnv,
  sources: DemoEnvironment['sources'],
): DemoEnvironment {
  const apiUrl = env.wordpress?.apiUrl
  let locality: WordPressLocality = 'not-configured'

  if (apiUrl) {
    try {
      locality = isLocalDevelopmentHost(new URL(apiUrl).hostname) ? 'local' : 'remote'
    } catch {
      locality = 'remote'
    }
  }

  const base: DemoEnvironment = {
    environment: 'LOCAL DEVELOPMENT',
    wordpress: {
      locality,
      ...(apiUrl ? { apiUrl, siteUrl: siteRootFrom(apiUrl) } : {}),
      ...(apiUrl ? { adminUrl: `${siteRootFrom(apiUrl)}/wp-admin/edit.php?post_status=draft` } : {}),
      ...(env.wordpress?.username ? { username: env.wordpress.username } : {}),
    },
    llm: {
      provider: env.llm.provider,
      apiKeyConfigured: Boolean(env.llm.apiKey),
      ...(env.llm.modelFast ? { modelFast: env.llm.modelFast } : {}),
      ...(env.llm.modelStrong ? { modelStrong: env.llm.modelStrong } : {}),
    },
    limits: { ...env.limits, minWeightedScore: env.minWeightedScore },
    canRun: true,
    dryRunOnly: false,
    sources,
  }

  if (locality === 'remote') {
    return {
      ...base,
      canRun: false,
      dryRunOnly: true,
      blockedReason:
        `WORDPRESS_API_URL points at ${apiUrl}, which is not a local development host. ` +
        'The demo dashboard will not run the pipeline against a non-local CMS. Set ' +
        'WORDPRESS_API_URL in news agent/.env.demo to your LocalWP REST URL ' +
        '(for example http://ai-tool-kart-cms.local/wp-json/wp/v2) together with the ' +
        'WORDPRESS_USERNAME and WORDPRESS_APP_PASSWORD of a local Author account, then restart ' +
        'the demo server.',
    }
  }

  if (locality === 'not-configured') {
    return {
      ...base,
      canRun: false,
      dryRunOnly: true,
      blockedReason:
        'WordPress is not configured, so no draft can be created. Set WORDPRESS_API_URL, ' +
        'WORDPRESS_USERNAME and WORDPRESS_APP_PASSWORD in news agent/.env.demo, or run the ' +
        'pipeline in dry-run mode to demonstrate everything up to publication.',
    }
  }

  return base
}

/**
 * Last line of defence, checked immediately before a publishing run starts.
 *
 * `describeEnvironment` drives the banner; this drives the refusal. They are
 * separate calls on purpose — the banner is rendered once when the page loads,
 * and configuration must be re-checked at the moment it would matter.
 */
export function assertSafeToPublish(env: AgentEnv): { ok: true } | { ok: false; reason: string } {
  const descriptor = describeEnvironment(env, [])
  if (descriptor.canRun) return { ok: true }
  return { ok: false, reason: descriptor.blockedReason as string }
}
