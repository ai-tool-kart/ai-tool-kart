/*
 * Provider smoke test — `npm run agent -- --llm-check`.
 *
 * Answers one question before a live run is allowed to spend anything: does the
 * configured provider actually return structured output this codebase can
 * validate?
 *
 * It is deliberately the smallest thing that exercises the whole path —
 * credentials, model selection, the structured-output request, the task schema,
 * and usage accounting — on a fixed internal candidate story that touches no
 * feed, no network source, and no WordPress. It never writes to the database and
 * never creates a post.
 *
 * Nothing here prints a secret. The key's presence is reported; its value is not
 * read by this module at all.
 */

import { createBudget } from './budget.ts'
import { createLLMClient } from './client.ts'
import { createProvider } from './factory.ts'
import { ClassificationSchema } from './schemas.ts'
import { CLASSIFIER_SYSTEM, classifierUserPrompt } from './prompts/index.ts'
import type { AgentEnv } from '../config/env.ts'
import type { LlmUsage } from '../domain/types.ts'
import type { Logger } from '../utils/logger.ts'

/**
 * A fixed, invented candidate story.
 *
 * Invented on purpose: it names no real vendor or product, so the model cannot
 * answer from memory and a valid response proves the structured-output path
 * rather than the model's recall. It is short, which keeps the check cheap.
 */
const PROBE = {
  title: 'Nimbus Labs releases Stratus 2, a coding assistant with a 400K context window',
  summaries: [
    {
      publisher: 'nimbus-labs-blog',
      text:
        'Nimbus Labs today released Stratus 2, an update to its coding assistant. ' +
        'The company says the model accepts up to 400,000 tokens of context and is ' +
        'available through the Nimbus API and the Stratus CLI from today.',
    },
  ],
  publishers: ['nimbus-labs-blog'],
  ageHours: 2,
  bestTier: 1,
}

/** Caps the check independently of the run budget: one call, a small ceiling. */
const CHECK_BUDGET = { maxLlmCallsPerRun: 2, maxTokensPerRun: 20_000 }

export interface ProviderCheckResult {
  provider: string
  /** Configured model ids per class, before the provider reports back. */
  fastModel: string
  strongModel: string
  /** The model id the provider says answered. */
  modelUsed: string
  task: 'classify'
  attempts: number
  usage: LlmUsage
  /** Non-sensitive evidence that the schema validated. */
  category: string
  recommendation: string
}

export async function checkProvider(options: {
  env: AgentEnv
  logger: Logger
}): Promise<ProviderCheckResult> {
  const { env, logger } = options

  const budget = createBudget(CHECK_BUDGET)
  const provider = createProvider({ env })
  const llm = createLLMClient({ provider, budget, logger })

  const response = await llm.run({
    task: 'classify',
    system: CLASSIFIER_SYSTEM,
    user: classifierUserPrompt(PROBE),
    schema: ClassificationSchema,
    schemaName: 'Classification',
    temperature: 0,
  })

  return {
    provider: provider.id,
    fastModel: provider.modelFor('fast'),
    strongModel: provider.modelFor('strong'),
    modelUsed: response.model,
    task: 'classify',
    attempts: response.attempts,
    usage: { ...budget.usage },
    category: response.data.category,
    recommendation: response.data.recommendation,
  }
}

/** Operator-facing report. Contains no credential and no source content. */
export function formatProviderCheck(result: ProviderCheckResult): string {
  const total = result.usage.inputTokens + result.usage.outputTokens
  return [
    '',
    'LLM provider check',
    `  provider        ${result.provider}`,
    `  fast model      ${result.fastModel}`,
    `  strong model    ${result.strongModel}`,
    `  task            ${result.task}`,
    `  model used      ${result.modelUsed}`,
    `  attempts        ${result.attempts}`,
    `  structured out  validated against Classification`,
    `  category        ${result.category}`,
    `  recommendation  ${result.recommendation}`,
    `  api calls       ${result.usage.calls}`,
    `  input tokens    ${result.usage.inputTokens}`,
    `  output tokens   ${result.usage.outputTokens}`,
    `  total tokens    ${total}`,
    '',
  ].join('\n')
}
