/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY COPY. Phase H moves the News Agent's version into shared/llm and
 * deletes this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LLM provider abstraction (ASSISTANT_ARCHITECTURE_PLAN.md §12).
 *
 * Field-for-field identical to news agent/src/llm/provider.ts. The one
 * deliberate difference is the task union: this package has exactly one task,
 * `assistant`, because a server that will never classify a news story has no
 * business declaring a `classify` task. Phase H unions the two sets.
 *
 * Two invariants hold for every call:
 *
 *   1. `system` contains ONLY our instructions. Untrusted text — the user's
 *      message — goes in `input` and nowhere else (§7's trust asymmetry).
 *   2. The caller receives schema-validated typed data, or an error. No module
 *      above this layer ever parses a free-text model response.
 */

import type { z } from 'zod'

/**
 * The tasks this package asks a model to perform.
 *
 * One, for now. Phase E is its first caller; Phase H merges this union with the
 * News Agent's five (`classify | extract | verify | write | edit`).
 */
export type LLMTaskName = 'assistant'

export type ModelClass = 'fast' | 'strong'

export interface LLMRequest<T> {
  task: LLMTaskName
  modelClass: ModelClass
  /** Our instructions. Never contains third-party or user-supplied content. */
  system: string
  /** Content for the model to act on, including untrusted user text. */
  input: string
  /** The contract the response must satisfy. Validation happens in the client. */
  schema: z.ZodType<T>
  /** Human-readable schema name included in the prompt and in errors. */
  schemaName: string
  maxOutputTokens: number
  temperature?: number
}

export interface LLMUsageDelta {
  inputTokens: number
  outputTokens: number
}

/** Cumulative spend across a budget's lifetime. */
export interface LLMUsage {
  calls: number
  inputTokens: number
  outputTokens: number
}

/** A raw, still-unvalidated response. Only the client layer ever sees this. */
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
 * retries and budget accounting are shared concerns living in client.ts, so they
 * cannot drift between providers — and so adding a vendor stays one small file.
 *
 * An adapter owns none of: catalogue retrieval, recommendation logic, repair
 * policy, grounding, conversation state, or anything HTTP.
 */
export interface LLMProvider {
  readonly id: string
  /** Resolves a model class to a concrete model id, for logging. */
  modelFor(modelClass: ModelClass): string
  complete(request: LLMRequest<unknown>): Promise<LLMRawResponse>
}

/**
 * Signals the model declined rather than failed.
 *
 * A distinct type because the two need different handling: a failure may be
 * transient and worth retrying, a refusal usually is not, and conflating them
 * means retrying three times against a model that will never comply.
 */
export class LLMRefusal extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LLMRefusal'
  }
}
