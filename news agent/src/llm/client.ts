/*
 * LLM task client — the layer every pipeline module actually calls.
 *
 * Responsibilities, kept here so they cannot drift between provider adapters:
 *
 *   - schema validation of every response (§12: callers get typed data or an error)
 *   - bounded repair-then-retry on invalid output (§25)
 *   - JSON recovery from responses wrapped in prose or code fences
 *   - budget accounting (§27)
 *   - logging that never includes source content or model output verbatim
 *
 * A caller cannot bypass validation: `run()` is the only exported entry point
 * and it always parses through the supplied zod schema.
 */

import type { z } from 'zod'
import { RETRY, TASK_MAX_OUTPUT_TOKENS, TASK_MODEL_CLASS } from '../config/limits.ts'
import { AgentError, isAgentError } from '../domain/errors.ts'
import type { Logger } from '../utils/logger.ts'
import type { Budget } from './budget.ts'
import { describeSchema } from './schemas.ts'
import { jsonOutputInstruction, repairInstruction } from './prompts/shared.ts'
import { LLMRefusal, type LLMProvider, type LLMRequest, type LLMResponse, type LLMTaskName } from './provider.ts'

export interface TaskRequest<T> {
  task: LLMTaskName
  system: string
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
 * failing outright would waste a retry on a response that is actually correct.
 * This does not make the output trusted — it still goes through the schema.
 */
export function extractJson(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed

  // Fenced block, with or without a language tag.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fenced?.[1]) return fenced[1].trim()

  // Otherwise take the outermost balanced object, ignoring braces inside strings.
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

  // Unbalanced: hand back what we have so the schema error names the real problem.
  return trimmed.slice(start)
}

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
      const log = logger.child({ step: `llm:${request.task}` })

      const system = `${request.system}\n\n${jsonOutputInstruction(request.schemaName, jsonSchema)}`

      let user = request.user
      let lastError: unknown

      for (let attempt = 1; attempt <= RETRY.llmSchemaAttempts; attempt += 1) {
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
            // A refusal is recorded as a call: the provider was invoked.
            budget.record(0, 0)
            lastError = new AgentError('LLM_REFUSAL', `Model declined the ${request.task} task`, {
              cause: error,
              storyScoped: true,
            })
            log.warn('Model refused', { attempt })
            if (attempt < RETRY.llmSchemaAttempts) continue
            throw lastError
          }
          if (isAgentError(error) && !error.retryable) throw error
          lastError = new AgentError('LLM_UNAVAILABLE', `LLM provider call failed`, {
            cause: error,
            storyScoped: true,
          })
          log.warn('Provider call failed', { attempt })
          if (attempt < RETRY.llmSchemaAttempts) continue
          throw lastError
        }

        budget.record(raw.usage.inputTokens, raw.usage.outputTokens)

        let parsedJson: unknown
        try {
          parsedJson = JSON.parse(extractJson(raw.text))
        } catch {
          lastError = new AgentError('LLM_SCHEMA', 'Model response was not valid JSON', {
            storyScoped: true,
            details: { task: request.task, attempt },
          })
          log.warn('Response was not valid JSON', { attempt, chars: raw.text.length })
          if (attempt < RETRY.llmSchemaAttempts) {
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
        lastError = new AgentError('LLM_SCHEMA', `Model response failed ${request.schemaName} validation`, {
          storyScoped: true,
          details: { task: request.task, attempt, issues },
        })
        log.warn('Response failed schema validation', { attempt, issues })

        if (attempt < RETRY.llmSchemaAttempts) {
          user = `${request.user}\n\n${repairInstruction(issues, jsonSchema)}`
          continue
        }
        throw lastError
      }

      throw lastError ?? new AgentError('LLM_SCHEMA', 'LLM task exhausted attempts', { storyScoped: true })
    },
  }
}
