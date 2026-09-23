/*
 * Automations barrel.
 *
 * Exports the PORT, its query type and the ONE factory. Nothing here
 * re-exports a storage concept: the data directory is reachable only from
 * json.ts, and no consumer ever names it.
 */

export type { AutomationRepository, AutomationQuery } from './repository.ts'
export type { Automation, AutomationStep, AutomationTool } from './types.ts'

export { createJsonAutomations } from './json.ts'
export type { JsonAutomationRepositoryOptions } from './json.ts'

export { AutomationSchema, parseAutomations } from './schema.ts'
export { deriveSteps } from './deriveSteps.ts'
