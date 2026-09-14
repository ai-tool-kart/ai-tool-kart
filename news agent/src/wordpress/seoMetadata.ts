/*
 * SEO metadata sink — the seam between our SEO brief and whatever plugin (if
 * any) owns SEO fields on the CMS.
 *
 * ── Why a seam and not an integration ────────────────────────────────────────
 *
 * The production site runs All in One SEO. It was inspected before writing any
 * of this, and it does NOT offer a safe write path for this agent:
 *
 *   1. `aioseo_*` fields appear on GET /wp/v2/posts but are absent from the
 *      endpoint's writable schema — they are computed output, not input.
 *   2. AIOSEO's own save route is POST /aioseo/v1/post, an internal endpoint
 *      used by its editor UI, with no documented contract.
 *   3. The agent's least-privilege `news-agent` role gets HTTP 403 from
 *      /aioseo/v1/options, so it lacks AIOSEO capabilities regardless.
 *
 * Writing SEO fields would therefore mean reverse-engineering an undocumented
 * endpoint and raising the agent's WordPress privileges — both bad trades for
 * metadata a human can set in seconds during review. So V1 persists the brief
 * locally and the sink is a no-op.
 *
 * What the seam buys: when a write path does become available, it is one file
 * implementing one interface. Nothing in the pipeline learns a plugin's name.
 *
 * ── What still reaches the site today ────────────────────────────────────────
 *
 * The post title and excerpt, which is not nothing: AIOSEO's stock description
 * template is the post excerpt, so a well-written excerpt commonly becomes the
 * rendered meta description without any plugin API at all. We do not override
 * the excerpt with the meta description, because the excerpt is already
 * validated against its own length contract and a silent swap would be a
 * behaviour change no reviewer asked for.
 */

import type { SeoBrief } from '../domain/types.ts'
import type { Logger } from '../utils/logger.ts'
import type { WordPressClient } from './client.ts'

export interface SeoMetadataSink {
  readonly id: string
  /** Human-readable reason this sink is or is not writing anything. */
  readonly status: string
  /**
   * Called after a draft is created. Implementations must be non-fatal: an SEO
   * metadata failure may never take down a successfully created draft.
   */
  apply(input: { wpPostId: number; seo: SeoBrief }): Promise<void>
}

/**
 * The V1 sink. Stores nothing remotely and never fails.
 *
 * The brief is already persisted with the article row, so a reviewer opening the
 * draft has the SEO title, description and keywords available locally.
 */
export function localOnlySeoSink(logger: Logger): SeoMetadataSink {
  const log = logger.child({ step: 'seo-metadata' })
  return {
    id: 'local-only',
    status:
      'SEO brief persisted locally; no CMS SEO fields written (no safe REST write path available)',
    async apply({ wpPostId, seo }) {
      log.info('SEO metadata retained locally', {
        wpPostId,
        primaryKeyword: seo.primaryKeyword,
        metaDescriptionChars: seo.metaDescription.length,
        note: 'Set the SEO title/description in the CMS during review if desired.',
      })
    },
  }
}

export interface SeoPluginReport {
  detected: string[]
  /** True only when a documented, permitted, writable path exists. */
  writable: boolean
  note: string
}

/**
 * Read-only detection, used by the health check.
 *
 * Reports what is installed without asserting that we can use it — the two are
 * different questions, and conflating them is how an agent ends up POSTing to an
 * endpoint it has no permission for on every run.
 */
export async function detectSeoPlugin(
  client: WordPressClient,
  fetchJson: (url: string) => Promise<{ status: number; body: unknown }>,
): Promise<SeoPluginReport> {
  const root = client.baseUrl.replace(/\/wp\/v2$/, '')
  try {
    const { body } = await fetchJson(root)
    const namespaces = Array.isArray((body as { namespaces?: unknown })?.namespaces)
      ? ((body as { namespaces: string[] }).namespaces)
      : []
    const detected = namespaces.filter((namespace) =>
      /yoast|rankmath|rank-math|seopress|aioseo|slim-seo/i.test(namespace),
    )
    return {
      detected,
      writable: false,
      note:
        detected.length > 0
          ? `SEO plugin namespace(s) present (${detected.join(', ')}), but no verified REST write path for this agent role. SEO metadata stays local.`
          : 'No SEO plugin REST namespace detected. SEO metadata stays local.',
    }
  } catch {
    return { detected: [], writable: false, note: 'SEO plugin detection unavailable.' }
  }
}
