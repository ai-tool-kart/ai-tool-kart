/*
 * Source registry (NEWS_AGENT.md §6).
 *
 * The single place feed URLs are defined. Ingestion reads this list; no module
 * elsewhere may contain a source URL. Adding, disabling or retiering a source is
 * a change to this file and nothing else.
 *
 * EVERY enabled endpoint below was verified to return a parseable RSS/Atom
 * document before being enabled. Sources whose vendors publish no stable feed
 * are listed as `enabled: false` with the reason, rather than pointed at an
 * invented URL that would fail silently on every run.
 *
 * Verified 2026-08-21.
 */

import type { NewsSource } from '../domain/types.ts'

export const SOURCES: NewsSource[] = [
  /* ── Tier 1: official vendor sources ────────────────────────────────────── */
  {
    id: 'openai-news',
    name: 'OpenAI News',
    type: 'rss',
    url: 'https://openai.com/news/rss.xml',
    publisher: 'OpenAI',
    trustTier: 1,
    enabled: true,
    categories: ['ai-models', 'product-updates'],
  },
  {
    id: 'google-deepmind-blog',
    name: 'Google DeepMind Blog',
    type: 'rss',
    url: 'https://deepmind.google/blog/rss.xml',
    publisher: 'Google DeepMind',
    trustTier: 1,
    enabled: true,
    categories: ['ai-models', 'research'],
  },
  {
    id: 'google-ai-blog',
    name: 'Google — The Keyword (AI)',
    type: 'rss',
    url: 'https://blog.google/technology/ai/rss/',
    publisher: 'Google',
    trustTier: 1,
    enabled: true,
    categories: ['ai-models', 'product-updates'],
  },
  {
    id: 'huggingface-blog',
    name: 'Hugging Face Blog',
    type: 'rss',
    url: 'https://huggingface.co/blog/feed.xml',
    publisher: 'Hugging Face',
    trustTier: 1,
    enabled: true,
    categories: ['ai-models', 'development', 'research'],
  },
  {
    id: 'github-blog',
    name: 'GitHub Blog',
    type: 'rss',
    url: 'https://github.blog/feed/',
    publisher: 'GitHub',
    trustTier: 1,
    enabled: true,
    categories: ['development', 'product-updates'],
  },
  {
    id: 'github-changelog',
    name: 'GitHub Changelog',
    type: 'rss',
    url: 'https://github.blog/changelog/feed/',
    publisher: 'GitHub',
    trustTier: 1,
    enabled: true,
    categories: ['development', 'product-updates'],
    // Changelogs are high-signal but high-volume; most entries are minor.
    maxItemsPerRun: 15,
  },
  {
    id: 'aws-machine-learning',
    name: 'AWS Machine Learning Blog',
    type: 'rss',
    url: 'https://aws.amazon.com/blogs/machine-learning/feed/',
    publisher: 'AWS',
    trustTier: 1,
    enabled: true,
    categories: ['development', 'ai-models'],
    maxItemsPerRun: 15,
  },

  /* ── Tier 2: reputable publications ─────────────────────────────────────── */
  {
    id: 'techcrunch-ai',
    name: 'TechCrunch — AI',
    type: 'rss',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    publisher: 'TechCrunch',
    trustTier: 2,
    enabled: true,
    categories: ['industry', 'product-updates'],
  },
  {
    id: 'verge-ai',
    name: 'The Verge — AI',
    type: 'rss',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    publisher: 'The Verge',
    trustTier: 2,
    enabled: true,
    categories: ['industry', 'product-updates'],
  },
  {
    id: 'venturebeat-ai',
    name: 'VentureBeat — AI',
    type: 'rss',
    url: 'https://venturebeat.com/category/ai/feed/',
    publisher: 'VentureBeat',
    trustTier: 2,
    enabled: true,
    categories: ['industry'],
  },

  /* ── Verified but held back ─────────────────────────────────────────────── */
  {
    id: 'ars-technica-tech-lab',
    name: 'Ars Technica — Technology Lab',
    type: 'rss',
    url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
    publisher: 'Ars Technica',
    trustTier: 2,
    enabled: false,
    note:
      'Feed verified (RSS, 20 items). Held back because the section is general technology rather ' +
      'than AI-scoped, so it would push a lot of off-beat items through the prefilters. Enable ' +
      'once relevance thresholds are tuned against real runs.',
  },

  /* ── No stable public feed as of verification ───────────────────────────── */
  {
    id: 'anthropic-news',
    name: 'Anthropic News',
    type: 'web',
    url: 'https://www.anthropic.com/news',
    publisher: 'Anthropic',
    trustTier: 1,
    enabled: false,
    note:
      'No RSS feed found: /news/rss.xml and /rss.xml both 404 (verified 2026-08-21). A Tier 1 ' +
      'source worth having — revisit, or add a `web` adapter for the news index. Do not point ' +
      'this at a guessed URL.',
  },
  {
    id: 'meta-ai-blog',
    name: 'Meta AI Blog',
    type: 'web',
    url: 'https://ai.meta.com/blog/',
    publisher: 'Meta AI',
    trustTier: 1,
    enabled: false,
    note: 'https://ai.meta.com/blog/rss/ returns 404 (verified 2026-08-21). No feed available.',
  },
  {
    id: 'mistral-news',
    name: 'Mistral AI News',
    type: 'web',
    url: 'https://mistral.ai/news',
    publisher: 'Mistral AI',
    trustTier: 1,
    enabled: false,
    note: 'https://mistral.ai/news/feed.xml returns 404 (verified 2026-08-21).',
  },
  {
    id: 'microsoft-ai-blog',
    name: 'Microsoft AI Blog',
    type: 'web',
    url: 'https://blogs.microsoft.com/ai/',
    publisher: 'Microsoft',
    trustTier: 1,
    enabled: false,
    note: 'https://blogs.microsoft.com/ai/feed/ returns HTTP 410 Gone (verified 2026-08-21).',
  },
  {
    id: 'runway-blog',
    name: 'Runway Blog',
    type: 'web',
    url: 'https://runwayml.com/blog',
    publisher: 'Runway',
    trustTier: 1,
    enabled: false,
    note: 'https://runwayml.com/blog/rss.xml returns 404 (verified 2026-08-21).',
  },
]

export function enabledSources(filterId?: string): NewsSource[] {
  const enabled = SOURCES.filter((source) => source.enabled)
  if (!filterId) return enabled
  return enabled.filter((source) => source.id === filterId)
}

export function findSource(id: string): NewsSource | undefined {
  return SOURCES.find((source) => source.id === id)
}

/** Publisher name for a URL, used when labelling evidence and source lists. */
export function publisherForUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    for (const source of SOURCES) {
      const sourceHost = new URL(source.url).hostname.toLowerCase().replace(/^www\./, '')
      if (host === sourceHost || host.endsWith(`.${sourceHost}`) || sourceHost.endsWith(`.${host}`)) {
        return source.publisher
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

/** Trust tier for an arbitrary URL, defaulting to Tier 3 for unknown hosts. */
export function tierForUrl(url: string): 1 | 2 | 3 {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    for (const source of SOURCES) {
      const sourceHost = new URL(source.url).hostname.toLowerCase().replace(/^www\./, '')
      if (host === sourceHost || host.endsWith(`.${sourceHost}`)) return source.trustTier
    }
  } catch {
    return 3
  }
  return 3
}
