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

/*
 * Numeric parsing for run limits.
 *
 * ── Why these do not use .catch() ────────────────────────────────────────────
 *
 * The previous helper was `z.coerce.number().int().positive().catch(fallback)`,
 * which meant ANY value failing validation was silently replaced by the default.
 * Setting AGENT_MAX_CANDIDATES_PER_RUN=0 to mean "score nothing" did not produce
 * a no-op run — it produced the default 20-candidate run. A cost control that
 * silently FAILS OPEN, expanding to the full default workload at the exact
 * moment an operator was trying to restrict it, is the wrong shape for a circuit
 * breaker. The same held for `abc`, `-5` and `1e9`.
 *
 * Both helpers below fail loudly instead. An unset or empty variable still takes
 * the documented default; anything present but unusable stops startup with a
 * message naming the variable.
 */

/** Blank/absent means "not configured", so the default applies. */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

/**
 * A run/cost cap. Zero is VALID and means zero work.
 *
 * Zero is supported rather than rejected because the pipeline already has a
 * first-class path for "this cap is reached": defer the remaining work with a
 * logged reason and exit cleanly (§27). A cap of 0 is simply that path taken
 * immediately — no candidates scored, no stories verified, no articles written,
 * and nothing rejected. It is genuinely useful for exercising ingestion, dedupe
 * and the pending-publication retry without spending a token.
 *
 * It also fails CLOSED: a mistyped 0 yields a no-op run, never a full one.
 *
 * Note that zeroing every cap does not make a run do nothing. Publishing an
 * article an earlier run already approved costs no LLM budget and still happens
 * (pipeline/pending.ts). That is deliberate, not a leak in the cap.
 */
const capInt = (fallback: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ message: 'must be a whole number (0 or greater)' })
      .int({ message: 'must be a whole number' })
      .min(0, { message: 'must be 0 or greater' })
      .default(fallback),
  )

/**
 * An operational setting where zero is meaningless — a 0ms timeout or a 0-byte
 * response cap breaks every request rather than limiting it. Still fails loudly
 * rather than silently defaulting.
 */
const positiveInt = (fallback: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ message: 'must be a whole number greater than 0' })
      .int({ message: 'must be a whole number' })
      .positive({ message: 'must be greater than 0' })
      .default(fallback),
  )

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
  /*
   * Global kill switch for scheduled automation.
   *
   * Defaults to true so an unset variable does not silently disable a
   * production schedule. When false the process exits 0 before opening the
   * database, resolving the provider, or touching the network — an operator
   * pausing the agent must not have to trust that nothing downstream fires.
   */
  AGENT_ENABLED: boolish.catch(true).default(true),

  AGENT_MAX_ITEMS_PER_SOURCE_PER_RUN: capInt(25),
  AGENT_MAX_CANDIDATES_PER_RUN: capInt(20),
  AGENT_MAX_STORIES_VERIFIED_PER_RUN: capInt(5),
  AGENT_MAX_ARTICLES_PER_RUN: capInt(2),
  AGENT_MAX_DRAFTS_PER_RUN: capInt(2),
  AGENT_MAX_LLM_CALLS_PER_RUN: capInt(60),
  AGENT_MAX_TOKENS_PER_RUN: capInt(250_000),

  AGENT_MIN_WEIGHTED_SCORE: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ message: 'must be a number between 0 and 10' })
      .min(0, { message: 'must be between 0 and 10' })
      .max(10, { message: 'must be between 0 and 10' })
      .default(6),
  ),

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
  /** False pauses all work: the run exits 0 having done nothing. */
  enabled: boolean
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
    /** Total WordPress posts a single run may create, retries included. */
    maxDraftsPerRun: number
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
/**
 * Whether a hostname belongs to a local development machine.
 *
 * Exported because two independent policies depend on the same answer: plain
 * http is accepted here only for these hosts, and the demo dashboard refuses to
 * run the pipeline against a CMS that is not one of them. Keeping one predicate
 * means the two can never disagree about what "local" means.
 */
export function isLocalDevelopmentHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host.endsWith('.test')
  )
}

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
  const isLocalHost = isLocalDevelopmentHost(host)

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
    enabled: raw.AGENT_ENABLED,
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
      maxDraftsPerRun: raw.AGENT_MAX_DRAFTS_PER_RUN,
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
    enabled: env.enabled,
    llmProvider: env.llm.provider,
    llmKey: env.llm.apiKey ? 'set' : 'absent',
    wordpress: env.wordpress ? 'configured' : 'not configured',
    wordpressUser: env.wordpress ? env.wordpress.username : undefined,
    db: env.dbPath,
    autoPublish: false,
  }
}
