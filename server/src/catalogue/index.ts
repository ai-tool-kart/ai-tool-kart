/*
 * Catalogue barrel.
 *
 * Exports the PORT, the domain query types, the taxonomy and the ONE factory.
 * Nothing here re-exports a storage concept: `data/tools.json` is reachable only
 * from json.ts, and no consumer ever names the file.
 */

export type {
  ToolCatalogueRepository,
  ToolPage,
  ToolQuery,
} from './repository.ts'

export { createJsonToolCatalogue } from './json.ts'
export type { JsonToolCatalogueOptions } from './json.ts'

export { parseCatalogue, ToolSchema } from './schema.ts'
export * from './taxonomy.ts'
