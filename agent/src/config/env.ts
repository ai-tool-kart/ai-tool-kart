/*
 * Typed environment loading and validation.
 *
 * Fails fast with an actionable message rather than surfacing `undefined` deep
 * inside the pipeline. Secret values are registered with the logger for
 * redaction here and are never printed by this module — `describeEnv()` reports
 * only whether a credential is present, never what it is.
 *
 * Values are read from process.env; `npm run agent` loads agent/.env into it via
 * node's --env-file-if-exists, so no dotenv dependency is needed.
 */

import { z } from 'zod'
import { configError } from '../domain/errors.ts'
import { registerSecret } from '../utils/logger.ts'

const boolish = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(['true', 'false', '1', '0', 'yes', 'no', '']))
  .transform((value) => value === 'true' || value === '1' || value === 'yes')

const positiveInt = (fallback: number) =>
  z.coerce.number().int().positive().catch(fallback).default(fallback)

const EnvSchema = z.object({
  LLM_PROVIDER: z.string().trim().min(1).default('mock'),
  LLM_API_KEY: z.string().trim().optional(),
  LLM_MODEL_FAST: z.string().trim().optional(),
  LLM_MODEL_STRONG: z.string().trim().optional(),

  WORDPRESS_API_URL: z.string().trim().optional(),
  WORDPRESS_USERNAME: z.string().trim().optional(),
  WORDPRESS_APP_PASSWORD: z.string().trim().optional(),
  WORDPRESS_CREATE_TERMS: boolish.catch(true).default(true),

  AGENT_DB_PATH: z.string().trim().min(1).default('./data/news-agent.sqlite'),
  AGENT_AUTO_PUBLISH: boolish.catch(false).default(false),

  AGENT_MAX_ITEMS_PER_SOURCE_PER_RUN: positiveInt(25),
  AGENT_MAX_CANDIDATES_PER_RUN: positiveInt(20),
  AGENT_MAX_STORIES_VERIFIED_PER_RUN: positiveInt(5),
  AGENT_MAX_ARTICLES_PER_RUN: positiveInt(2),
  AGENT_MAX_LLM_CALLS_PER_RUN: positiveInt(60),
  AGENT_MAX_TOKENS_PER_RUN: positiveInt(250_000),

  AGENT_MIN_WEIGHTED_SCORE: z.coerce.number().min(0).max(10).catch(6).default(6),

  AGENT_HTTP_TIMEOUT_MS: positiveInt(15_000),
  AGENT_MAX_RESPONSE_BYTES: positiveInt(2_500_000),
  AGENT_USER_AGENT: z
    .string()
    .trim()
    .min(1)
    .default('AIToolKartNewsAgent/0.1 (+https://aitoolkart.com)'),

  AGENT_RUN_LOCK_STALE_MINUTES: positiveInt(30),

  AGENT_LOG_FORMAT: z.enum(['json', 'pretty']).catch('pretty').default('pretty'),
  AGENT_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).catch('info').default('info'),
})

export interface WordPressCredentials {
  apiUrl: string
  username: string
  appPassword: string
  createTerms: boolean
}

export interface AgentEnv {
  llm: {
    provider: string
    apiKey?: string
    modelFast?: string
    modelStrong?: string
  }
  /** Undefined when WordPress is not fully configured — publishing is skipped. */
  wordpress?: WordPressCredentials
  dbPath: string
  autoPublish: false
  limits: {
    maxItemsPerSourcePerRun: number
    maxCandidatesPerRun: number
    maxStoriesVerifiedPerRun: number
    maxArticlesPerRun: number
    maxLlmCallsPerRun: number
    maxTokensPerRun: number
  }
  minWeightedScore: number
  http: {
    timeoutMs: number
    maxResponseBytes: number
    userAgent: string
  }
  runLockStaleMinutes: number
  log: {
    format: 'json' | 'pretty'
    level: 'debug' | 'info' | 'warn' | 'error'
  }
}

/**
 * Validates the WordPress base URL.
 *
 * HTTPS is required except for loopback and .local development hosts, which is
 * how LocalWP serves the current development CMS (NEWS_AGENT.md §36.1). This is
 * a *configuration* policy for one explicitly-operator-supplied URL, and is
 * deliberately separate from the SSRF policy that guards externally-derived URLs
 * in utils/http.ts — the CMS host is trusted by definition, a URL scraped from a
 * news feed never is.
 */
function validateWordPressUrl(raw: string): { url: string; insecureLocal: boolean } {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw configError(
      `WORDPRESS_API_URL is not a valid URL: ${raw}. Expected something like https://cms.example.com/wp-json/wp/v2`,
    )
  }

  const host = parsed.hostname.toLowerCase()
  const isLocalHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host.endsWith('.test')

  if (parsed.protocol === 'https:') return { url: raw.replace(/\/+$/, ''), insecureLocal: false }

  if (parsed.protocol === 'http:' && isLocalHost) {
    return { url: raw.replace(/\/+$/, ''), insecureLocal: true }
  }

  throw configError(
    `WORDPRESS_API_URL must use https:// (got ${parsed.protocol}//${host}). ` +
      'Plain http is permitted only for loopback/.local development hosts. ' +
      'Sending an Application Password over plain http would transmit it in the clear.',
  )
}

export interface LoadedEnv {
  env: AgentEnv
  /** Non-fatal notices worth surfacing at startup (e.g. insecure local CMS). */
  warnings: string[]
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): LoadedEnv {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw configError(`Invalid agent environment:\n${issues}\n\nSee agent/.env.example.`)
  }

  const raw = parsed.data
  const warnings: string[] = []

  /*
   * Auto-publishing is Phase I and deliberately unimplemented (NEWS_AGENT.md
   * §19). Refusing to start is stronger than ignoring the flag: it makes the gap
   * between operator intent and system capability impossible to miss, and there
   * is no code path that could honour it.
   */
  if (raw.AGENT_AUTO_PUBLISH) {
    throw configError(
      'AGENT_AUTO_PUBLISH=true, but automatic publishing is not implemented in this MVP. ' +
        'The agent creates WordPress drafts only (NEWS_AGENT.md §18/§19). Set AGENT_AUTO_PUBLISH=false.',
    )
  }

  registerSecret(raw.LLM_API_KEY)
  registerSecret(raw.WORDPRESS_APP_PASSWORD)

  let wordpress: WordPressCredentials | undefined
  const wpFields = [raw.WORDPRESS_API_URL, raw.WORDPRESS_USERNAME, raw.WORDPRESS_APP_PASSWORD]
  const wpProvided = wpFields.filter((value) => value && value.length > 0).length

  if (wpProvided > 0 && wpProvided < 3) {
    throw configError(
      'WordPress is partially configured. Set all of WORDPRESS_API_URL, WORDPRESS_USERNAME and ' +
        'WORDPRESS_APP_PASSWORD, or none of them. Partial credentials would fail at the last step ' +
        'of the pipeline, after paying for generation.',
    )
  }

  if (wpProvided === 3) {
    const { url, insecureLocal } = validateWordPressUrl(raw.WORDPRESS_API_URL as string)
    if (insecureLocal) {
      warnings.push(
        'WORDPRESS_API_URL is plain http on a local host. Accepted for development only. ' +
          'WordPress disables Application Passwords on non-HTTPS sites by default (NEWS_AGENT.md §36.1).',
      )
    }
    wordpress = {
      apiUrl: url,
      username: raw.WORDPRESS_USERNAME as string,
      // WordPress shows application passwords in space-separated groups but
      // expects them without spaces over Basic auth.
      appPassword: (raw.WORDPRESS_APP_PASSWORD as string).replace(/\s+/g, ''),
      createTerms: raw.WORDPRESS_CREATE_TERMS,
    }
  }

  if (raw.LLM_PROVIDER !== 'mock' && !raw.LLM_API_KEY) {
    throw configError(
      `LLM_PROVIDER is "${raw.LLM_PROVIDER}" but LLM_API_KEY is empty. ` +
        'Set a key, or use LLM_PROVIDER=mock to run the pipeline offline against the deterministic provider.',
    )
  }

  const env: AgentEnv = {
    llm: {
      provider: raw.LLM_PROVIDER,
      ...(raw.LLM_API_KEY ? { apiKey: raw.LLM_API_KEY } : {}),
      ...(raw.LLM_MODEL_FAST ? { modelFast: raw.LLM_MODEL_FAST } : {}),
      ...(raw.LLM_MODEL_STRONG ? { modelStrong: raw.LLM_MODEL_STRONG } : {}),
    },
    ...(wordpress ? { wordpress } : {}),
    dbPath: raw.AGENT_DB_PATH,
    autoPublish: false,
    limits: {
      maxItemsPerSourcePerRun: raw.AGENT_MAX_ITEMS_PER_SOURCE_PER_RUN,
      maxCandidatesPerRun: raw.AGENT_MAX_CANDIDATES_PER_RUN,
      maxStoriesVerifiedPerRun: raw.AGENT_MAX_STORIES_VERIFIED_PER_RUN,
      maxArticlesPerRun: raw.AGENT_MAX_ARTICLES_PER_RUN,
      maxLlmCallsPerRun: raw.AGENT_MAX_LLM_CALLS_PER_RUN,
      maxTokensPerRun: raw.AGENT_MAX_TOKENS_PER_RUN,
    },
    minWeightedScore: raw.AGENT_MIN_WEIGHTED_SCORE,
    http: {
      timeoutMs: raw.AGENT_HTTP_TIMEOUT_MS,
      maxResponseBytes: raw.AGENT_MAX_RESPONSE_BYTES,
      userAgent: raw.AGENT_USER_AGENT,
    },
    runLockStaleMinutes: raw.AGENT_RUN_LOCK_STALE_MINUTES,
    log: { format: raw.AGENT_LOG_FORMAT, level: raw.AGENT_LOG_LEVEL },
  }

  return { env, warnings }
}

/** Startup summary. Reports presence of credentials, never their values. */
export function describeEnv(env: AgentEnv): Record<string, unknown> {
  return {
    llmProvider: env.llm.provider,
    llmKey: env.llm.apiKey ? 'set' : 'absent',
    wordpress: env.wordpress ? 'configured' : 'not configured',
    wordpressUser: env.wordpress ? env.wordpress.username : undefined,
    db: env.dbPath,
    autoPublish: false,
  }
}
