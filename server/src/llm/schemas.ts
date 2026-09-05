/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY COPY. Phase H moves the News Agent's version into shared/llm and
 * deletes this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Structured-output schema utilities.
 *
 * The News Agent's schemas.ts holds both this helper and the five task schemas.
 * This copy holds only the helper: the assistant's own AssistantReplySchema
 * belongs to Phase E and to server/src/assistant/schema.ts, not to the LLM
 * infrastructure that will be shared with a package that has no assistant.
 *
 * ── The rule every task schema must follow ────────────────────────────────────
 *
 * `.strict()`, always. A closed schema is the STRUCTURAL half of the
 * prompt-injection defence (§10.1): injected text can try to change what the
 * model says, but it cannot make a response validate against a shape it does not
 * fit. An injected instruction that persuades the model to add
 * `{"publishImmediately": true}` produces a response that is rejected rather
 * than one that is quietly acted on.
 *
 * An unexpected key is a signal that the model went off-contract. It is never
 * something to ignore.
 */

import { z } from 'zod'

/**
 * Renders a Zod schema as JSON Schema for inclusion in the prompt.
 *
 * Handing the model the actual contract rather than a prose description is what
 * makes the repair loop converge: the repair instruction can restate the exact
 * shape that was violated.
 *
 * Never throws. A schema that cannot be rendered still has to be usable — the
 * response is validated by the real Zod schema regardless of what the prompt
 * managed to describe, so a rendering failure degrades the prompt rather than
 * failing the request.
 */
export function describeSchema(schema: z.ZodType<unknown>): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema, { io: 'output' }), null, 2)
  } catch {
    return '{}'
  }
}
