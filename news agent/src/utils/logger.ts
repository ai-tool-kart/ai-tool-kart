/*
 * Structured logging.
 *
 * Every line carries runId; step/sourceId/storyId are attached by child loggers
 * so callers never have to remember to pass them (NEWS_AGENT.md §26).
 *
 * Redaction is the important part. Secrets are registered once at startup and
 * scrubbed from every rendered line — message, fields and error text alike — so
 * that an Authorization header or an API key cannot reach the log even if some
 * future caller passes one in by accident. This is defence in depth: the code
 * also simply never logs those values.
 */

import { errorMessage, isAgentError } from '../domain/errors.ts'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LogContext {
  runId?: string
  step?: string
  sourceId?: string
  storyId?: string
  articleId?: string
  [key: string]: unknown
}

export interface LoggerOptions {
  level: LogLevel
  format: 'json' | 'pretty'
  context?: LogContext
  /** Test seam: defaults to process.stdout/stderr. */
  write?: (line: string, level: LogLevel) => void
}

/** Secret values scrubbed from all output. Registered at startup, never logged. */
const secrets = new Set<string>()

/**
 * Registers a value to be scrubbed from every future log line.
 *
 * Short values are ignored — redacting a 3-character string would mangle
 * unrelated text everywhere, and anything that short is not a real credential.
 */
export function registerSecret(value: string | undefined | null): void {
  if (!value) return
  const trimmed = value.trim()
  if (trimmed.length < 8) return
  secrets.add(trimmed)
  // Application passwords are displayed with spaces but sent without them;
  // register both forms so either spelling is caught.
  const despaced = trimmed.replace(/\s+/g, '')
  if (despaced.length >= 8 && despaced !== trimmed) secrets.add(despaced)
}

/** Test-only: clears the registry so cases cannot leak into each other. */
export function clearSecrets(): void {
  secrets.clear()
}

export function redact(text: string): string {
  let out = text
  for (const secret of secrets) {
    if (!secret) continue
    out = out.split(secret).join('[REDACTED]')
  }
  // Belt and braces: scrub anything that looks like a Basic/Bearer credential
  // even if it was never registered.
  out = out.replace(/\b(Basic|Bearer)\s+[A-Za-z0-9+/=._-]{8,}/gi, '$1 [REDACTED]')
  return out
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return isAgentError(value)
      ? { name: value.name, code: value.code, message: value.message }
      : { name: value.name, message: value.message }
  }
  return value
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
  /** A logger that carries additional context on every line. */
  child(context: LogContext): Logger
  /** Prints a line verbatim (still redacted) — used for run summaries. */
  plain(message: string): void
}

const PRETTY_LEVEL: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
}

export function createLogger(options: LoggerOptions): Logger {
  const { level, format } = options
  const baseContext = options.context ?? {}
  const write =
    options.write ??
    ((line: string, lineLevel: LogLevel) => {
      if (lineLevel === 'error' || lineLevel === 'warn') process.stderr.write(line + '\n')
      else process.stdout.write(line + '\n')
    })

  function emit(lineLevel: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_RANK[lineLevel] < LEVEL_RANK[level]) return

    const merged: Record<string, unknown> = { ...baseContext }
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (value !== undefined) merged[key] = serializeValue(value)
    }

    if (format === 'json') {
      const payload = { ts: new Date().toISOString(), level: lineLevel, msg: message, ...merged }
      write(redact(JSON.stringify(payload)), lineLevel)
      return
    }

    const parts: string[] = []
    for (const key of ['step', 'sourceId', 'storyId', 'articleId']) {
      const value = merged[key]
      if (value !== undefined) parts.push(`${key}=${String(value)}`)
    }
    for (const [key, value] of Object.entries(merged)) {
      if (['runId', 'step', 'sourceId', 'storyId', 'articleId'].includes(key)) continue
      parts.push(`${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    }
    const suffix = parts.length > 0 ? `  ${parts.join(' ')}` : ''
    write(redact(`${PRETTY_LEVEL[lineLevel]} ${message}${suffix}`), lineLevel)
  }

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    plain: (message) => write(redact(message), 'info'),
    child: (context) =>
      createLogger({
        level,
        format,
        context: { ...baseContext, ...context },
        ...(options.write ? { write: options.write } : {}),
      }),
  }
}

/** Renders any thrown value into log fields without ever throwing itself. */
export function errorFields(value: unknown): Record<string, unknown> {
  if (isAgentError(value)) {
    return { errCode: value.code, err: value.message, ...value.details }
  }
  return { err: errorMessage(value) }
}
