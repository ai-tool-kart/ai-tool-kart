/*
 * zod schema -> OpenAI Structured Outputs strict JSON Schema.
 *
 * Strict mode accepts a deliberately small subset of JSON Schema, and rejects
 * the whole request with HTTP 400 when it sees anything outside it. Two rules
 * matter for this pipeline's schemas:
 *
 *   1. Every property must appear in `required`, and every object must set
 *      `additionalProperties: false`. Optional fields are expressed by allowing
 *      null — `anyOf: [T, {"type": "null"}]` — not by omitting them from
 *      `required`.
 *
 *   2. Value constraints (minLength/maxLength, minimum/maximum, minItems/
 *      maxItems, pattern, format) are not supported and must be removed.
 *
 * ── What this costs, and why nothing is lost ─────────────────────────────────
 *
 * Rule 2 means the decoder does not enforce "reasoning is at most 400
 * characters" or "sections has at least 3 entries". That enforcement was never
 * delegated to the provider: client.ts validates every response against the
 * zod schema itself, which keeps all of those constraints, and the full
 * unmodified JSON Schema — constraints included — is what goes into the prompt
 * via describeSchema() and into the repair instruction when validation fails.
 *
 * So strict mode buys the STRUCTURE for free (right keys, right types, valid
 * JSON, no fences, no prose) and zod keeps the CONTRACT. A response that is
 * structurally right but violates a bound is caught exactly where it was before
 * this adapter existed, and gets the same bounded repair retry.
 */

import { z } from 'zod'

/** Keywords strict Structured Outputs does not accept. */
const UNSUPPORTED_KEYWORDS = new Set([
  '$schema',
  'default',
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'contentEncoding',
  'contentMediaType',
])

type JsonSchemaNode = Record<string, unknown>

function isNode(value: unknown): value is JsonSchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Wraps a subschema so the model may answer with null to mean "absent". */
function nullable(node: JsonSchemaNode): JsonSchemaNode {
  if (Array.isArray(node.anyOf)) {
    const branches = node.anyOf as unknown[]
    const alreadyNullable = branches.some(
      (branch) => isNode(branch) && branch.type === 'null',
    )
    return alreadyNullable ? node : { ...node, anyOf: [...branches, { type: 'null' }] }
  }
  const { description, ...rest } = node
  return {
    ...(description !== undefined ? { description } : {}),
    anyOf: [rest, { type: 'null' }],
  }
}

function convert(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(convert)
  if (!isNode(input)) return input

  const out: JsonSchemaNode = {}
  for (const [key, value] of Object.entries(input)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue
    if (key === 'properties' && isNode(value)) {
      const properties: JsonSchemaNode = {}
      for (const [name, child] of Object.entries(value)) properties[name] = convert(child)
      out.properties = properties
      continue
    }
    if (key === 'required') continue // rebuilt below from the property list
    out[key] = convert(value)
  }

  if (isNode(out.properties)) {
    const propertyNames = Object.keys(out.properties)
    const originallyRequired = new Set(
      Array.isArray(input.required) ? (input.required as unknown[]).map(String) : [],
    )

    // Optional in zod becomes nullable-and-required here.
    for (const name of propertyNames) {
      if (originallyRequired.has(name)) continue
      const child = (out.properties as JsonSchemaNode)[name]
      if (isNode(child)) (out.properties as JsonSchemaNode)[name] = nullable(child)
    }

    out.required = propertyNames
    out.additionalProperties = false
    if (out.type === undefined) out.type = 'object'
  }

  return out
}

/**
 * Renders a zod schema as a strict-mode JSON Schema.
 *
 * `io: 'output'` matches what the model is asked to produce, and is the same
 * rendering the prompt shows — the two must not drift, or a repair retry would
 * describe a different contract than the decoder enforces.
 */
export function toStrictJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const rendered = z.toJSONSchema(schema, { io: 'output' }) as JsonSchemaNode
  const converted = convert(rendered)
  return isNode(converted) ? converted : { type: 'object', properties: {}, required: [], additionalProperties: false }
}
