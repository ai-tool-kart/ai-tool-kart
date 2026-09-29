/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY COPY. Phase H moves the News Agent's version into shared/llm and
 * deletes this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Provider selection.
 *
 * Two providers ship:
 *
 *   mock   the default. Deterministic, offline, key-free — every test and a
 *          fresh checkout run on it.
 *   xai    Grok, through providers/xai.ts. Selected with LLM_PROVIDER=xai and
 *          LLM_API_KEY; the model is LLM_MODEL_STRONG, with the adapter's
 *          documented fallback.
 *
 * Nothing falls back from one to the other. `xai` without a key refuses to
 * build (below), so a misconfigured deploy fails at boot instead of quietly
 * serving mock plans from a server that looks healthy.
 *
 * ── Adding another provider ──────────────────────────────────────────────────
 *
 * One file and one line. Create src/llm/providers/<vendor>.ts exporting a
 * factory that satisfies the LLMProvider interface — providers/xai.ts is the
 * worked example — and register it in PROVIDER_FACTORIES below. Nothing else
 * changes: schema validation, repair retries, budget accounting and logging
 * all live in client.ts and are shared by every provider.
 *
 * Requirements an adapter must honour, inherited verbatim from §12:
 *   - never merge `system` and `input` into one string
 *   - respect request.maxOutputTokens
 *   - return usage figures, or zeros if the vendor does not report them
 *   - throw LLMRefusal when the model declines rather than fails
 *   - never log the API key or the full request body
 *   - never read a VITE_-prefixed variable; those are compiled into the browser
 *     bundle, and an API key that reaches the client is a published API key
 */

import type { ServerEnv } from '../config/env.ts'
import { configError } from '../domain/errors.ts'
import type { Logger } from '../utils/logger.ts'
import type { LLMProvider } from './provider.ts'
import { createMockProvider, type MockProviderOptions } from './providers/mock.ts'
import { createXaiProvider, XAI_PROVIDER_ID } from './providers/xai.ts'

export interface RealProviderOptions {
  apiKey: string
  modelFast: string
  modelStrong: string
  timeoutMs: number
  /** Per-call diagnostics. Never receives the key, the prompt or the answer. */
  logger?: Logger
}

type ProviderFactory = (options: RealProviderOptions) => LLMProvider

/** Real adapters. One entry per vendor; `mock` is handled separately below. */
const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  [XAI_PROVIDER_ID]: createXaiProvider,
}

export function availableProviders(): string[] {
  return ['mock', ...Object.keys(PROVIDER_FACTORIES)]
}

export interface CreateProviderOptions {
  env: ServerEnv
  /** Test-only overrides for the mock provider's behaviour. */
  mock?: MockProviderOptions
  /** Handed to a real adapter for per-call diagnostics. */
  logger?: Logger
}

export function createProvider({ env, mock, logger }: CreateProviderOptions): LLMProvider {
  const id = env.llm.provider

  // The mock never needs a key, and must never be made to look as if it might.
  if (id === 'mock') return createMockProvider(mock ?? {})

  const factory = PROVIDER_FACTORIES[id]
  if (!factory) {
    /*
     * Three things this message must contain, each asserted by a test: what is
     * available, where an adapter is registered, and the fallback that works
     * right now. An error that only says "unknown provider" leaves the reader
     * to discover all three by reading source.
     */
    throw configError(
      `LLM_PROVIDER="${id}" has no adapter.\n\n` +
        `Available: ${availableProviders().join(', ')}.\n\n` +
        'To add one, implement ' +
        'src/llm/providers/<vendor>.ts against the LLMProvider interface and register it in ' +
        'PROVIDER_FACTORIES in src/llm/factory.ts — see the contract documented at the top of ' +
        'that file. Until then, run with LLM_PROVIDER=mock.',
    )
  }

  if (!env.llm.apiKey) {
    throw configError(
      `LLM_PROVIDER="${id}" requires LLM_API_KEY to be set.\n\n` +
        'Set it in server/.env, which is gitignored. Never use a VITE_ prefix: that would ' +
        'compile the key into the public browser bundle.',
    )
  }

  return factory({
    apiKey: env.llm.apiKey,
    modelFast: env.llm.modelFast ?? '',
    modelStrong: env.llm.modelStrong ?? '',
    timeoutMs: env.llm.timeoutMs,
    ...(logger ? { logger } : {}),
  })
}
