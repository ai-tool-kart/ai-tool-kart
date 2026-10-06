import type { ApprovalFields, CatalogueRecord, ToolChanges } from '@/types/admin'

/*
 * Pure form logic for the admin screens, kept out of the component files so
 * it can be tested on its own and fast refresh keeps working.
 */

export type ApprovalFieldErrors = Partial<Record<keyof ApprovalFields | '_', string>>

/**
 * Maps the server's approval field errors onto the form's inputs:
 * "tool.roles.0" → roles, and "tool.id" → slug (the id IS the slug).
 */
export function approvalFieldErrors(fields: Record<string, string> | undefined): ApprovalFieldErrors {
  const errors: ApprovalFieldErrors = {}
  for (const [path, message] of Object.entries(fields ?? {})) {
    const head = path.replace(/^tool\./, '').split('.')[0] ?? '_'
    const key = (head === 'id' ? 'slug' : head) as keyof ApprovalFieldErrors
    errors[key] ??= message
  }
  return errors
}

/** "tags.0" → tags: one message per input. */
export function toolFieldErrors(fields: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [path, message] of Object.entries(fields)) {
    const key = path.split('.')[0] ?? path
    errors[key] ??= message
  }
  return errors
}

/** The tool edit form's state: tags as one comma-separated string, plainLine as '' when absent. */
export type ToolDraft = Required<Omit<ToolChanges, 'plainLine' | 'tags'>> & { plainLine: string; tags: string }

export function toToolDraft(tool: CatalogueRecord): ToolDraft {
  return {
    name: tool.name,
    mono: tool.mono,
    tagline: tool.tagline,
    plainLine: tool.plainLine ?? '',
    summary: tool.summary,
    url: tool.url,
    cat: tool.cat,
    model: tool.model,
    pricingTier: tool.pricingTier,
    price: tool.price,
    tags: tool.tags.join(', '),
    roles: tool.roles,
    useCases: tool.useCases,
    stages: tool.stages,
    verified: tool.verified,
    isMcpServer: tool.isMcpServer === true,
    api: tool.api,
    ctx: tool.ctx,
    team: tool.team,
    trial: tool.trial,
    integr: tool.integr,
  }
}

export function splitTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

/**
 * Only the fields that differ from the loaded record, in the PATCH's shape:
 * tags become a list, an emptied plainLine becomes null ("remove it").
 */
export function diffToolDraft(original: ToolDraft, draft: ToolDraft): ToolChanges {
  const changes: Record<string, unknown> = {}
  for (const key of Object.keys(draft) as (keyof ToolDraft)[]) {
    if (JSON.stringify(original[key]) === JSON.stringify(draft[key])) continue
    if (key === 'tags') changes.tags = splitTags(draft.tags)
    else if (key === 'plainLine') changes.plainLine = draft.plainLine.trim() === '' ? null : draft.plainLine
    else changes[key] = draft[key]
  }
  return changes as ToolChanges
}
