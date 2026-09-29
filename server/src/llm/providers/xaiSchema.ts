/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY LOCATION. Lives in server/src/llm/ until the shared/llm extraction
 * (ASSISTANT_ARCHITECTURE_PLAN.md §12, "Phase H — one adapter serving both
 * features") moves this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * zod schema -> the JSON Schema xAI's strict structured outputs accept.
 *
 * ── Why this is not the News Agent's openaiSchema.ts ─────────────────────────
 *
 * OpenAI's strict mode rejects value constraints and demands every property be
 * `required`, so that converter strips bounds and rewrites optional fields as
 * nullable. xAI's contract is looser in exactly the useful direction
 * (docs.x.ai, "Structured Outputs"):
 *
 *   - a property left out of `required` is simply optional
 *   - `additionalProperties` defaults to false
 *   - minLength/maxLength (≤ 2048), minItems/maxItems (≤ 256), enum, anyOf and
 *     non-circular $ref are ENFORCED at decode time, not advisory
 *
 * So the conversion here is nearly the identity: AssistantReplySchema's own
 * bounds — a 600-character message, at most 4 steps, at most 2 alternates —
 * reach the decoder intact, and the model is constrained to them rather than
 * merely told about them.
 *
 * What it still removes:
 *
 *   - `$schema`, which is metadata, not contract
 *   - `pattern` and `format`, because xAI supports only a subset of regex and
 *     formats; an unsupported one is best-effort rather than guaranteed
 *   - any bound above xAI's enforced limit, which would otherwise silently
 *     degrade to best-effort
 *
 * None of that is a relaxation of the contract. client.ts validates every
 * response against the unmodified zod schema regardless — including the
 * superRefine rules (no tool twice, no stage twice) that no JSON Schema can
 * express — and the full rendering is what the prompt and the repair
 * instruction show the model.
 */

import { z } from 'zod'

/** Dropped outright. See the header. */
const DROPPED_KEYWORDS = new Set(['$schema', 'pattern', 'format', 'default'])

/** xAI's enforced ceilings. A bound above one of these is best-effort only. */
const ENFORCED_CEILINGS: Record<string, number> = {
  minLength: 2048,
  maxLength: 2048,
  minItems: 256,
  maxItems: 256,
  minProperties: 64,
  maxProperties: 64,
}

type JsonSchemaNode = Record<string, unknown>

function isNode(value: unknown): value is JsonSchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function convert(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(convert)
  if (!isNode(input)) return input

  const out: JsonSchemaNode = {}
  for (const [key, value] of Object.entries(input)) {
    if (DROPPED_KEYWORDS.has(key)) continue
    const ceiling = ENFORCED_CEILINGS[key]
    if (ceiling !== undefined && typeof value === 'number' && value > ceiling) continue
    if (key === 'properties' && isNode(value)) {
      const properties: JsonSchemaNode = {}
      for (const [name, child] of Object.entries(value)) properties[name] = convert(child)
      out.properties = properties
      continue
    }
    out[key] = convert(value)
  }

  // Stated rather than left to xAI's default: a closed object is the structural
  // half of the injection defence (llm/schemas.ts), and that should not depend
  // on a vendor default staying what it is today.
  if (isNode(out.properties)) out.additionalProperties = false

  return out
}

/**
 * Renders a zod schema for xAI's `text.format.schema`.
 *
 * `io: 'output'`, matching describeSchema() in llm/schemas.ts, so the contract
 * the decoder enforces and the contract the prompt describes cannot drift.
 */
export function toXaiJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const rendered = z.toJSONSchema(schema, { io: 'output' }) as JsonSchemaNode
  const converted = convert(rendered)
  return isNode(converted)
    ? converted
    : { type: 'object', properties: {}, additionalProperties: false }
}
