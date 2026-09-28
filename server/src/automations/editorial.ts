/*
 * The editorial layer — merging overlay files onto imported records.
 *
 * An imported record (data/*.json) is what a spreadsheet row says. An overlay
 * (editorial/*.json, one per guide) is what a person wrote on top of it:
 * intro, outcomes, hand-written steps, tips, issues, resources, curated
 * related guides. They are kept apart because the importer rewrites data/
 * wholesale — editorial content stored there would be erased by the next
 * import. Overlays are keyed by `Automation.id`, which survives a re-import.
 *
 * Pure: records and overlays in, merged records out. json.ts does the reading.
 * Like parseAutomations, every problem is collected before one throw, and
 * nothing is dropped silently — an overlay for a record that does not exist,
 * or a related guide that does not resolve, stops the boot with its name.
 */

import { configError } from '../domain/errors.ts'
import { EditorialOverlaySchema, type EditorialOverlay, type ValidationSource } from './schema.ts'
import type { Automation } from './types.ts'

/** One overlay as read from disk, with the file it came from for messages. */
export interface RawOverlay {
  file: string
  data: unknown
}

const refKey = (niche: string, slug: string): string => `${niche}\u0000${slug}`

export function applyEditorial(
  automations: Automation[],
  overlays: RawOverlay[],
  source: ValidationSource,
): Automation[] {
  if (overlays.length === 0) return automations

  const problems: string[] = []
  const byId = new Map(automations.map((automation) => [automation.id, automation]))
  const bySlug = new Set(automations.map((automation) => refKey(automation.niche, automation.slug)))
  const merged = new Map<string, EditorialOverlay>()
  const fileOf = new Map<string, string>()

  for (const { file, data } of overlays) {
    const parsed = EditorialOverlaySchema.safeParse(data)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(overlay)'
        problems.push(`  ${file} — ${path}: ${issue.message}`)
      }
      continue
    }

    const overlay = parsed.data
    const target = byId.get(overlay.automationId)
    if (!target) {
      problems.push(`  ${file} — automationId: no automation has id "${overlay.automationId}"`)
      continue
    }
    const earlier = fileOf.get(overlay.automationId)
    if (earlier) {
      problems.push(`  ${file} — automationId: "${overlay.automationId}" already has an overlay (${earlier})`)
      continue
    }
    if (target.steps && overlay.steps) {
      problems.push(`  ${file} — steps: the record already carries authored steps; keep them in one place`)
    }
    for (const [index, ref] of (overlay.relatedGuides ?? []).entries()) {
      if (!bySlug.has(refKey(ref.niche, ref.slug))) {
        problems.push(`  ${file} — relatedGuides.${index}: no guide at ${ref.niche}/${ref.slug}`)
      } else if (ref.niche === target.niche && ref.slug === target.slug) {
        problems.push(`  ${file} — relatedGuides.${index}: a guide cannot be related to itself`)
      }
    }

    fileOf.set(overlay.automationId, file)
    merged.set(overlay.automationId, overlay)
  }

  if (problems.length > 0) {
    throw configError(
      `Invalid editorial overlays (${source.origin}):\n${problems.join('\n')}\n\n` +
        `${problems.length} problem(s). No overlay is dropped silently — fix the file and restart.`,
    )
  }

  return automations.map((automation) => {
    const overlay = merged.get(automation.id)
    if (!overlay) return automation
    // The overlay schema is strict: past `automationId`, it holds editorial
    // fields and nothing else.
    const { automationId: _automationId, ...editorial } = overlay
    return { ...automation, ...editorial }
  })
}
