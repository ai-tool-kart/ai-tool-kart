/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY COPY. Phase H moves the News Agent's version into shared/llm and
 * deletes this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Provider selection.
 *
 * ASSISTANT_ARCHITECTURE_PLAN.md §12 and NEWS_AGENT.md §37 both list the
 * production LLM provider as an OPEN DECISION, and nothing in this repository
 * picks one. So the server ships with the abstraction and the deterministic mock
 * provider, and deliberately does not smuggle in a vendor choice by being the
 * first to write an adapter.
 *
 * ── Adding a real provider ───────────────────────────────────────────────────
 *
 * One file and one line. Create src/llm/providers/<vendor>.ts exporting a
 * factory that satisfies the LLMProvider interface:
 *
 *   export function createVendorProvider(options: RealProviderOptions): LLMProvider {
 *     return {
 *       id: 'vendor',
 *       modelFor: (cls) => (cls === 'fast' ? options.modelFast : options.modelStrong),
 *       async complete(request) {
 *         // POST request.system as the system instruction and request.input as
 *         // the user turn. They MUST stay separate: request.input carries
 *         // untrusted user text (ASSISTANT_ARCHITECTURE_PLAN.md §7).
 *         // Return { text, usage: { inputTokens, outputTokens }, model }.
 *         // Throw LLMRefusal when the model declines rather than fails.
 *       },
 *     }
 *   }
 *
 * Then register it in PROVIDER_FACTORIES below. Nothing else changes: schema
 * validation, repair retries, budget accounting and logging all live in
 * client.ts and are shared by every provider.
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
import type { LLMProvider } from './provider.ts'
import { createMockProvider, type MockProviderOptions } from './providers/mock.ts'

export interface RealProviderOptions {
  apiKey: string
  modelFast: string
  modelStrong: string
  timeoutMs: number
}

type ProviderFactory = (options: RealProviderOptions) => LLMProvider

/** Real adapters go here. Empty until the provider decision is made. */
const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {}

export function availableProviders(): string[] {
  return ['mock', ...Object.keys(PROVIDER_FACTORIES)]
}

export interface CreateProviderOptions {
  env: ServerEnv
  /** Test-only overrides for the mock provider's behaviour. */
  mock?: MockProviderOptions
}

export function createProvider({ env, mock }: CreateProviderOptions): LLMProvider {
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
        'The production provider is an open decision (ASSISTANT_ARCHITECTURE_PLAN.md §12), ' +
        'so no vendor adapter ships by default. To add one, implement ' +
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
  })
}
