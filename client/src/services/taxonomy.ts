import { apiRequest } from '@/services/http'
import type { SetupTaxonomy } from '@/types/taxonomy'

/*
 * GET /api/taxonomy.
 *
 * The vocabulary the catalogue is built on — roles, the goals that belong to
 * each role, categories, stages, pricing tiers. The "Build Your AI Setup"
 * pickers read `roles` and `goalsByRole` from here rather than from a static
 * array, because the server already seeds both lists verbatim from the design
 * and a second copy in the bundle would be a second thing to keep in step.
 */

const TAXONOMY_PATH = '/taxonomy'

export async function getSetupTaxonomy(signal?: AbortSignal): Promise<SetupTaxonomy> {
  return apiRequest<SetupTaxonomy>(TAXONOMY_PATH, { signal })
}
