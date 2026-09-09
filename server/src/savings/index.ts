/*
 * Work-savings barrel.
 *
 * Exports the PORT, its query type and the ONE factory. Nothing here
 * re-exports a storage concept: the JSON file is reachable only from json.ts,
 * and no consumer ever names it.
 */

export type { WorkSavingsRepository, WorkSavingsQuery } from './repository.ts'

export { createJsonWorkSavingsRepository } from './json.ts'
export type { JsonWorkSavingsRepositoryOptions } from './json.ts'

export { parseWorkSavings, WorkSavingsEstimateSchema } from './schema.ts'
