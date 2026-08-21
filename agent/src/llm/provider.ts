/*
 * LLM provider abstraction (NEWS_AGENT.md §12).
 *
 * The pipeline knows five task names and two model classes. It does not know
 * which vendor is behind them, what an HTTP request to that vendor looks like,
 * or how structured output is requested. Swapping provider means adding one
 * adapter file and changing LLM_PROVIDER.
 *
 * Two invariants hold for every call:
 *
 *   1. `system` contains ONLY our instructions. Source-derived text goes in
 *      `input` and nowhere else (§28).
 *   2. The caller receives schema-validated typed data, or an error. No pipeline
 *      module ever parses a free-text model response.
 */

import type { z } from 'zod'

export type LLMTaskName = 'classify' | 'extract' | 'verify' | 'write' | 'edit'

export type ModelClass = 'fast' | 'strong'

export interface LLMRequest<T> {
  task: LLMTaskName
  modelClass: ModelClass
  /** Our instructions. Never contains third-party content. */
  system: string
  /** Content for the model to act on, including untrusted source text. */
  input: string
  /** The contract the response must satisfy. Validation happens in the client. */
  schema: z.ZodType<T>
  /** Human-readable schema description included in the prompt. */
  schemaName: string
  maxOutputTokens: number
  temperature?: number
}

export interface LLMUsageDelta {
  inputTokens: number
  outputTokens: number
}

/** A raw, still-unvalidated response. Only the client layer sees this. */
export interface LLMRawResponse {
  text: string
  usage: LLMUsageDelta
  model: string
}

export interface LLMResponse<T> {
  data: T
  usage: LLMUsageDelta
  model: string
  attempts: number
}

/**
 * What an adapter implements.
 *
 * Deliberately narrow: produce text for a prompt. Schema validation, repair
 * retries and budget accounting are shared concerns and live in client.ts, so
 * they cannot drift between providers.
 */
export interface LLMProvider {
  readonly id: string
  /** Resolves a model class to a concrete model id, for logging. */
  modelFor(modelClass: ModelClass): string
  complete(request: LLMRequest<unknown>): Promise<LLMRawResponse>
}

/** Signals the model declined rather than failed — retried once, then rejected. */
export class LLMRefusal extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LLMRefusal'
  }
}
