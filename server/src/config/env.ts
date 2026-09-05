/*
 * Typed environment loading and validation.
 *
 * Fails fast with an actionable message rather than surfacing `undefined` deep
 * inside a request handler. Values are read from process.env; `npm run dev`
 * loads server/.env into it via node's --env-file-if-exists, so no dotenv
 * dependency is needed.
 *
 * Two rules, both inherited from news agent/src/config/env.ts:
 *
 *   1. The flat environment shape never escapes this module. Callers receive a
 *      nested ServerEnv domain object, so nothing downstream learns a variable
 *      name and no module reaches for process.env on its own.
 *   2. Secrets are registered with the logger for redaction here, and
 *      describeEnv() reports only whether a value is present — never what it is.
 *
 * Phase D adds the first credential. LLM_API_KEY is registered with the logger
 * for redaction the moment it is parsed, next to where it is read — the
 * convention Phase B set aside this paragraph for. It is OPTIONAL and is never
 * required by the default `mock` provider, so the server still runs with no
 * configuration at all.
 *
 * ── Strict versus tolerant ───────────────────────────────────────────────────
 *
 * Variables are split by what a wrong value would cost:
 *
 *   STRICT   PORT, HOST, CLIENT_ORIGIN — refuse to boot.
 *            Silently binding 3001 when the operator wrote 8080 presents as
 *            "the deploy is broken and the logs say nothing".
 *
 *   TOLERANT NODE_ENV, SERVER_LOG_FORMAT, SERVER_LOG_LEVEL — fall back and warn.
 *            Hosting platforms set NODE_ENV to values of their own choosing;
 *            refusing to start because it says "staging" would be hostile, and
 *            the cost of guessing wrong is a log line, not a wrong port.
 *
 * Tolerant never means silent. Every fallback emits a startup warning.
 */

import { z } from 'zod'
import { configError } from '../domain/errors.ts'
import { registerSecret } from '../utils/logger.ts'

/** In a .env file an empty value means "unset", not "the empty string". */
function emptyToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}

const DEFAULT_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'

/** Only the variables a wrong value must not be tolerated for. */
const StrictSchema = z.object({
  PORT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(65_535).default(3001),
  ),
  HOST: z.preprocess(emptyToUndefined, z.string().trim().min(1).default('127.0.0.1')),

  /*
   * CLIENT_ORIGIN is the one variable where empty is a real value, so it does
   * NOT go through emptyToUndefined:
   *
   *   absent  -> the development defaults
   *   ""      -> CORS disabled, which is correct when the API and the site are
   *              served from the same origin
   *
   * Collapsing the two would make "disabled" unexpressible and would quietly
   * allow localhost origins in production.
   */
  CLIENT_ORIGIN: z.string().trim().optional(),

  /*
   * ─── LLM (Phase D) ────────────────────────────────────────────────────────
   *
   * STRICT, because every one of these is a value a wrong guess makes expensive:
   * silently falling back to `mock` in production would serve fabricated plans
   * from a server that looks healthy, which is far worse than refusing to boot.
   *
   * None is REQUIRED. The server's default provider is `mock`, which needs no
   * key and no network, so a fresh checkout runs with an empty environment.
   */
  LLM_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1).default('mock'),
  ),
  LLM_API_KEY: z.preprocess(emptyToUndefined, z.string().trim().min(8).optional()),
  LLM_MODEL_FAST: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  LLM_MODEL_STRONG: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  LLM_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1_000).max(300_000).default(60_000),
  ),
})

/**
 * Appended to a validation failure so the message says what to do, not just
 * what was wrong. Kept here rather than as per-rule zod messages so it reads
 * the same across zod versions.
 */
const HINTS: Record<string, string> = {
  PORT: 'Set an integer between 1 and 65535, e.g. PORT=3001.',
  HOST: 'Set a hostname or IP address, e.g. HOST=127.0.0.1.',
  CLIENT_ORIGIN: `Set a comma-separated origin list, e.g. ${DEFAULT_ORIGINS}.`,
  LLM_PROVIDER: 'Set a provider id, or leave it unset to use the offline mock.',
  LLM_API_KEY:
    'Set the provider credential, or leave it unset when LLM_PROVIDER=mock. ' +
    'Never prefix it with VITE_ — that would publish it in the browser bundle.',
  LLM_MODEL_FAST: 'Set a vendor model id, e.g. LLM_MODEL_FAST=<vendor-model-id>.',
  LLM_MODEL_STRONG: 'Set a vendor model id, e.g. LLM_MODEL_STRONG=<vendor-model-id>.',
  LLM_TIMEOUT_MS: 'Set milliseconds between 1000 and 300000, e.g. LLM_TIMEOUT_MS=60000.',
}

export type NodeEnvironment = 'development' | 'production' | 'test'
export type LogFormat = 'json' | 'pretty'
export type LogLevelName = 'debug' | 'info' | 'warn' | 'error'

const NODE_ENVIRONMENTS: NodeEnvironment[] = ['development', 'production', 'test']
const LOG_FORMATS: LogFormat[] = ['json', 'pretty']
const LOG_LEVELS: LogLevelName[] = ['debug', 'info', 'warn', 'error']

export interface ServerEnv {
  environment: NodeEnvironment
  isProduction: boolean
  http: {
    host: string
    port: number
  }
  cors: {
    /** Exact origins permitted to call the API. Empty disables CORS entirely. */
    allowedOrigins: string[]
  }
  log: {
    format: LogFormat
    level: LogLevelName
  }
  llm: {
    /** 'mock' by default. Resolved to an adapter in llm/factory.ts. */
    provider: string
    /** Never required for 'mock'. Registered for log redaction when present. */
    apiKey?: string
    modelFast?: string
    modelStrong?: string
    timeoutMs: number
  }
}

export interface LoadedEnv {
  env: ServerEnv
  /** Non-fatal notices worth surfacing at startup. */
  warnings: string[]
}

/** Resolves a tolerant variable, warning when an unrecognised value is ignored. */
function oneOf<T extends string>(
  name: string,
  raw: unknown,
  allowed: T[],
  fallback: T,
  warnings: string[],
): T {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return fallback
  }
  const value = String(raw).trim()
  if ((allowed as string[]).includes(value)) return value as T
  warnings.push(
    `${name}="${value}" is not one of ${allowed.join(', ')}. Falling back to "${fallback}".`,
  )
  return fallback
}

/**
 * Splits the comma-separated allowlist and validates each entry is a real
 * origin — scheme and host, with no path.
 *
 * A malformed origin is rejected rather than dropped: silently ignoring one
 * would present as "CORS is broken in staging" with nothing in the logs.
 */
function parseOrigins(raw: string): string[] {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  const origins: string[] = []
  for (const entry of entries) {
    let url: URL
    try {
      url = new URL(entry)
    } catch {
      throw configError(
        `CLIENT_ORIGIN contains "${entry}", which is not a valid origin.\n` +
          `  ${HINTS.CLIENT_ORIGIN}\n` +
          '  Leave it empty to disable CORS, which is correct when the API and the site ' +
          'share an origin.',
      )
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw configError(
        `CLIENT_ORIGIN entry "${entry}" must use http or https.\n  ${HINTS.CLIENT_ORIGIN}`,
      )
    }
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
      throw configError(
        `CLIENT_ORIGIN entry "${entry}" must be an origin only — scheme, host and optional ` +
          `port, with no path, query or fragment.\n  ${HINTS.CLIENT_ORIGIN}`,
      )
    }
    origins.push(url.origin)
  }

  return [...new Set(origins)]
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): LoadedEnv {
  const parsed = StrictSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const name = issue.path.join('.') || '(root)'
        const hint = HINTS[name]
        return `  ${name}: ${issue.message}${hint ? `\n    ${hint}` : ''}`
      })
      .join('\n')
    throw configError(`Invalid server environment:\n${issues}\n\nSee server/.env.example.`)
  }

  const raw = parsed.data
  const warnings: string[] = []

  const environment = oneOf<NodeEnvironment>(
    'NODE_ENV',
    source.NODE_ENV,
    NODE_ENVIRONMENTS,
    'development',
    warnings,
  )
  const format = oneOf<LogFormat>(
    'SERVER_LOG_FORMAT',
    source.SERVER_LOG_FORMAT,
    LOG_FORMATS,
    'pretty',
    warnings,
  )
  const level = oneOf<LogLevelName>(
    'SERVER_LOG_LEVEL',
    source.SERVER_LOG_LEVEL,
    LOG_LEVELS,
    'info',
    warnings,
  )

  const originsConfigured = raw.CLIENT_ORIGIN !== undefined
  const allowedOrigins = parseOrigins(originsConfigured ? (raw.CLIENT_ORIGIN as string) : DEFAULT_ORIGINS)
  const isProduction = environment === 'production'

  if (isProduction && !originsConfigured) {
    warnings.push(
      'CLIENT_ORIGIN is unset in production, so the localhost development defaults are in ' +
        'use. Set it to the site origin, or to an empty value to disable CORS entirely.',
    )
  }

  if (isProduction && originsConfigured && allowedOrigins.length === 0) {
    warnings.push(
      'CLIENT_ORIGIN is empty in production. Cross-origin browser requests will be refused. ' +
        'That is correct when the API and the site share an origin; set CLIENT_ORIGIN otherwise.',
    )
  }

  if (isProduction && allowedOrigins.some((origin) => origin.startsWith('http://'))) {
    warnings.push(
      'CLIENT_ORIGIN contains a plain-http origin in production. The traffic is unencrypted.',
    )
  }

  /*
   * Registered the moment it is parsed, so it cannot reach a log line from
   * anywhere — including a stack trace or an accidental object dump.
   */
  registerSecret(raw.LLM_API_KEY)

  if (raw.LLM_PROVIDER !== 'mock' && !raw.LLM_API_KEY) {
    // Not fatal here: llm/factory.ts throws with the actionable message, and it
    // is the module that knows which providers exist. Warning at boot means the
    // operator finds out at startup rather than on the first assistant request.
    warnings.push(
      `LLM_PROVIDER="${raw.LLM_PROVIDER}" is set but LLM_API_KEY is not. ` +
        'The provider will fail to initialise.',
    )
  }

  if (isProduction && raw.LLM_PROVIDER === 'mock') {
    warnings.push(
      'LLM_PROVIDER is "mock" in production. The assistant will return deterministic ' +
        'offline responses built only from retrieved candidates, not real model output.',
    )
  }

  const env: ServerEnv = {
    environment,
    isProduction,
    http: { host: raw.HOST, port: raw.PORT },
    cors: { allowedOrigins },
    log: { format, level },
    llm: {
      provider: raw.LLM_PROVIDER,
      ...(raw.LLM_API_KEY ? { apiKey: raw.LLM_API_KEY } : {}),
      ...(raw.LLM_MODEL_FAST ? { modelFast: raw.LLM_MODEL_FAST } : {}),
      ...(raw.LLM_MODEL_STRONG ? { modelStrong: raw.LLM_MODEL_STRONG } : {}),
      timeoutMs: raw.LLM_TIMEOUT_MS,
    },
  }

  return { env, warnings }
}

/**
 * Startup summary.
 *
 * Reports the presence and shape of values, never a secret. Phase B holds none,
 * but this is the function a later phase adds `llmKey` to, so it establishes the
 * convention now: `'set' | 'absent'`, never the value itself.
 */
export function describeEnv(env: ServerEnv): Record<string, unknown> {
  return {
    environment: env.environment,
    address: `${env.http.host}:${env.http.port}`,
    corsOrigins: env.cors.allowedOrigins.length > 0 ? env.cors.allowedOrigins.join(',') : 'disabled',
    logLevel: env.log.level,
    logFormat: env.log.format,
    llmProvider: env.llm.provider,
    // Presence only. The convention this function established in Phase B, now
    // that there is finally something to apply it to.
    llmApiKey: env.llm.apiKey ? 'set' : 'absent',
  }
}
