/*
 * The slice of GET /api/taxonomy the frontend currently reads.
 *
 * The endpoint returns nine fields (categories, pricing tiers, use cases, work
 * stages, sort options…). Only the two the "Build Your AI Setup" pickers need
 * are declared here, because a type that claims more than the code uses is a
 * type that has to be maintained for no one.
 *
 * `roles` and `goalsByRole` are seeded on the server verbatim from the design's
 * SETUP_ROLES / SETUP_GOALS, which is why the pickers can source them from the
 * API instead of carrying a second copy of the list in the bundle.
 */

export interface SetupTaxonomy {
  /** Role labels, in the design's order. */
  roles: string[]
  /** Goal labels per role. A role with no entry falls back to the generic list. */
  goalsByRole: Record<string, string[]>
}
