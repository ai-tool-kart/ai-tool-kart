/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY COPY. Phase H moves the News Agent's version into shared/llm and
 * deletes this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LLM task client — the layer every caller actually uses.
 *
 * Responsibilities, kept here so they cannot drift between provider adapters:
 *
 *   - schema validation of every response (callers get typed data or an error)
 *   - bounded repair-then-retry on invalid output
 *   - JSON recovery from responses wrapped in prose or code fences
 *   - budget accounting
 *   - logging that never includes prompt content or model output verbatim
 *
 * A caller cannot bypass validation: run() is the only exported entry point and
 * it always parses through the supplied Zod schema.
 *
 * ── The repair strategy, and the one subtlety in it ───────────────────────────
 *
 * On a bad response the next attempt sends:
 *
 *     ORIGINAL user turn  +  repair instruction
 *
 * NOT the previous response, and NOT the previous attempt's already-repaired
 * turn. Both of those are the obvious implementations and both are wrong:
 *
 *   Quoting the bad response back invites the model to patch its own broken
 *   output rather than to answer again, and a patch of malformed JSON is
 *   usually still malformed.
 *
 *   Appending to the previous attempt's turn compounds errors — by attempt
 *   three the prompt is mostly a transcript of failure, and the actual request
 *   has been pushed so far up that the model answers the complaint instead of
 *   the question.
 *
 * `user` is therefore always rebuilt from `request.user`, never mutated
 * cumulatively. The system prompt is preserved verbatim across every attempt.
 */

import type { z } from 'zod'
import { LLM_RETRY, TASK_MAX_OUTPUT_TOKENS, TASK_MODEL_CLASS } from '../config/limits.ts'
import type { Logger } from '../utils/logger.ts'
import type { Budget } from './budget.ts'
import { isLLMError, llmRefused, llmSchemaError, llmUnavailable } from './errors.ts'
import { jsonOutputInstruction, repairInstruction } from './prompts/shared.ts'
import { describeSchema } from './schemas.ts'
import {
  LLMRefusal,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
  type LLMTaskName,
} from './provider.ts'

export interface TaskRequest<T> {
  task: LLMTaskName
  /** Our instructions. Never contains user-supplied text. */
  system: string
  /** The user turn, with any untrusted content already wrapped. */
  user: string
  schema: z.ZodType<T>
  schemaName: string
  temperature?: number
}

export interface LLMClient {
  readonly providerId: string
  run<T>(request: TaskRequest<T>): Promise<LLMResponse<T>>
}

/**
 * Extracts a JSON object from a model response.
 *
 * Models wrap JSON in code fences or a sentence of preamble often enough that
 * failing outright would waste a retry on a response that was actually correct.
 *
 * This does NOT make the output trusted. It only finds the bytes; the schema
 * still decides whether they are acceptable.
 */
export function extractJson(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed

  // Fenced block, with or without a language tag.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fenced?.[1]) return fenced[1].trim()

  // Otherwise take the outermost balanced object. The string/escape tracking is
  // the whole point: a brace inside a string value must not close the object.
  const start = trimmed.indexOf('{')
  if (start === -1) return trimmed

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < trimmed.length; i += 1) {
    const char = trimmed[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return trimmed.slice(start, i + 1)
    }
  }

  // Unbalanced — hand back what we have so the JSON error names the real
  // problem (a truncated response) rather than "no JSON found".
  return trimmed.slice(start)
}

/** Compact, log-safe summary of what failed. Field paths and rules only. */
function summarizeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}

export interface CreateClientOptions {
  provider: LLMProvider
  budget: Budget
  logger: Logger
}

export function createLLMClient({ provider, budget, logger }: CreateClientOptions): LLMClient {
  return {
    providerId: provider.id,

    async run<T>(request: TaskRequest<T>): Promise<LLMResponse<T>> {
      const modelClass = TASK_MODEL_CLASS[request.task]
      const maxOutputTokens = TASK_MAX_OUTPUT_TOKENS[request.task]
      const jsonSchema = describeSchema(request.schema as z.ZodType<unknown>)
      const log = logger.child({ step: `llm:${request.task}`, provider: provider.id })

      // Built once and reused verbatim on every attempt.
      const system = `${request.system}\n\n${jsonOutputInstruction(request.schemaName, jsonSchema)}`

      let user = request.user
      let lastError: unknown

      for (let attempt = 1; attempt <= LLM_RETRY.schemaAttempts; attempt += 1) {
        budget.assertCanCall()

        const providerRequest: LLMRequest<T> = {
          task: request.task,
          modelClass,
          system,
          input: user,
          schema: request.schema,
          schemaName: request.schemaName,
          maxOutputTokens,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        }

        let raw
        try {
          raw = await provider.complete(providerRequest as LLMRequest<unknown>)
        } catch (error) {
          if (error instanceof LLMRefusal) {
            // A refusal is recorded as a call: the provider was invoked and the
            // round trip was spent, whatever came back.
            budget.record(0, 0)
            lastError = llmRefused(`Model declined the ${request.task} task`, {
              cause: error,
              details: { task: request.task, attempt },
            })
            log.warn('Model refused', { attempt })
            if (attempt < LLM_RETRY.schemaAttempts) continue
            throw lastError
          }
          // A budget throw from deeper down is terminal — retrying it would just
          // throw again, and the caller needs to see it now.
          if (isLLMError(error) && error.code === 'BUDGET_EXCEEDED') throw error

          lastError = llmUnavailable('LLM provider call failed', {
            cause: error,
            details: { task: request.task, attempt },
          })
          log.warn('Provider call failed', { attempt })
          if (attempt < LLM_RETRY.schemaAttempts) continue
          throw lastError
        }

        budget.record(raw.usage.inputTokens, raw.usage.outputTokens)

        let parsedJson: unknown
        try {
          parsedJson = JSON.parse(extractJson(raw.text))
        } catch {
          lastError = llmSchemaError('Model response was not valid JSON', {
            details: { task: request.task, attempt },
          })
          // Length only. The response itself never reaches a log line.
          log.warn('Response was not valid JSON', { attempt, chars: raw.text.length })
          if (attempt < LLM_RETRY.schemaAttempts) {
            user = `${request.user}\n\n${repairInstruction('Response was not valid JSON.', jsonSchema)}`
            continue
          }
          throw lastError
        }

        const result = request.schema.safeParse(parsedJson)
        if (result.success) {
          log.debug('Task completed', {
            attempt,
            model: raw.model,
            inputTokens: raw.usage.inputTokens,
            outputTokens: raw.usage.outputTokens,
          })
          return { data: result.data, usage: raw.usage, model: raw.model, attempts: attempt }
        }

        const issues = summarizeIssues(result.error)
        lastError = llmSchemaError(`Model response failed ${request.schemaName} validation`, {
          details: { task: request.task, attempt, issues },
        })
        log.warn('Response failed schema validation', { attempt, issues })

        if (attempt < LLM_RETRY.schemaAttempts) {
          user = `${request.user}\n\n${repairInstruction(issues, jsonSchema)}`
          continue
        }
        throw lastError
      }

      /* Unreachable: the loop either returns or throws. Present so a future
       * change to the loop bound cannot fall through into returning undefined. */
      throw lastError ?? llmSchemaError('LLM task exhausted attempts')
    },
  }
}
