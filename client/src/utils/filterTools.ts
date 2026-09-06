import type { LegacyMockTool } from '@/types/tool'

/*
 * What is left of the v1 client-side catalogue helpers.
 *
 * `filterTools`, `sortTools` and `filterAndSortTools` were removed in
 * Milestone 3. They re-implemented in the browser what GET /api/tools does on
 * the server — and did it over one fetched page, so under pagination they would
 * have filtered 24 of 66 tools and presented the result as the whole catalogue.
 * The API applies q, category, tier, stage, tag and sort across everything and
 * returns an honest `total`; there is nothing left for them to do.
 *
 * `findToolByName` is not catalogue logic — it is a lookup by display name that
 * the Compare surfaces use to resolve their hardcoded default selection. It
 * stays until those surfaces move to the catalogue in Milestone 4, and is typed
 * on the mock's shape for the same reason data/tools.ts is.
 */

export function findToolByName(
  tools: LegacyMockTool[],
  name: string,
): LegacyMockTool | undefined {
  return tools.find((tool) => tool.name === name)
}
