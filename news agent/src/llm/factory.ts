/*
 * Provider selection.
 *
 * Two adapters ship today: `mock`, the deterministic offline provider that makes
 * the whole pipeline runnable with no key and no network, and `openai`, the
 * first real runtime provider. Nothing else in the codebase knows either one
 * exists — pipeline modules call the shared client against the LLMProvider
 * interface, and LLM_PROVIDER is the only switch.
 *
 * ── Adding another provider ──────────────────────────────────────────────────
 *
 * One file and one line. Create src/llm/providers/<vendor>.ts exporting a
 * factory that satisfies the LLMProvider interface:
 *
 *   export function createVendorProvider(options: RealProviderOptions): LLMProvider {
 *     return {
 *       id: 'vendor',
 *       modelFor: (cls) => cls === 'fast' ? options.modelFast : options.modelStrong,
 *       async complete(request) {
 *         // POST request.system as the system instruction and request.input as
 *         // the user turn. They MUST stay separate: request.input carries
 *         // untrusted source text (NEWS_AGENT.md §28).
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
 * Requirements an adapter must honour:
 *   - never merge `system` and `input` into one string
 *   - respect request.maxOutputTokens
 *   - return usage figures, or zeros if the vendor does not report them
 *   - never log the API key or the full request body
 */

import { configError } from '../domain/errors.ts'
import type { AgentEnv } from '../config/env.ts'
import type { LLMProvider } from './provider.ts'
import { createMockProvider, type MockProviderOptions } from './providers/mock.ts'
import { createOpenAIProvider } from './providers/openai.ts'

export interface RealProviderOptions {
  apiKey: string
  modelFast: string
  modelStrong: string
  timeoutMs: number
}

type ProviderFactory = (options: RealProviderOptions) => LLMProvider

/** Real adapters. One entry per vendor; `mock` is handled separately below. */
const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  openai: createOpenAIProvider,
}

export function availableProviders(): string[] {
  return ['mock', ...Object.keys(PROVIDER_FACTORIES)]
}

export interface CreateProviderOptions {
  env: AgentEnv
  /** Test-only overrides for the mock provider's behaviour. */
  mock?: MockProviderOptions
}

export function createProvider({ env, mock }: CreateProviderOptions): LLMProvider {
  const id = env.llm.provider

  if (id === 'mock') return createMockProvider(mock ?? {})

  const factory = PROVIDER_FACTORIES[id]
  if (!factory) {
    throw configError(
      `LLM_PROVIDER="${id}" has no adapter.\n\n` +
        `Available: ${availableProviders().join(', ')}.\n\n` +
        'To add one, implement src/llm/providers/<vendor>.ts against the LLMProvider interface ' +
        'and register it in PROVIDER_FACTORIES in src/llm/factory.ts — see the contract ' +
        'documented at the top of that file. Until then, run with LLM_PROVIDER=mock.',
    )
  }

  /*
   * Second gate on the key. loadEnv() already refuses to start a non-mock
   * provider without one; this catches a provider built from a hand-assembled
   * env in a test or a script, so no adapter can ever be constructed with an
   * empty credential and fail later mid-run.
   */
  if (!env.llm.apiKey) {
    throw configError(
      `LLM_PROVIDER="${id}" requires LLM_API_KEY to be set. ` +
        'Set it in the agent environment (server-side only, never with a VITE_ prefix), ' +
        'or use LLM_PROVIDER=mock to run offline.',
    )
  }

  return factory({
    apiKey: env.llm.apiKey,
    modelFast: env.llm.modelFast ?? '',
    modelStrong: env.llm.modelStrong ?? '',
    timeoutMs: env.http.timeoutMs,
  })
}
