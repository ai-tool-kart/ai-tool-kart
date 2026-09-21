/*
 * SubmissionService — SPEC-submit-backend.md §7 orchestration, minus the two
 * abuse-control steps deferred to slices 5 (rate limiting) and 7 (honeypot):
 *
 *   1. zod parse                                     -> VALIDATION_FAILED
 *   2. normalize the URL
 *   3. duplicate check against the submission store   -> DUPLICATE_URL
 *   4. duplicate check against the live catalogue      -> DUPLICATE_URL
 *   5. store.create()                                  -> the created Submission
 *
 * Deliberately HTTP-agnostic in the sense that matters — no express import,
 * no status code, no response body written here — but it throws the same
 * ApiError vocabulary every other layer of this server throws
 * (domain/errors.ts), rather than returning a bespoke result type. That is
 * the point: the route's job shrinks to parse-or-throw-then-catch, exactly
 * the shape http/validate.ts's parseOrThrow already established, and the
 * shared errorHandler is what turns any of this into a response body. A
 * store failure or anything else unanticipated is simply not caught here —
 * it propagates to the route's catch, next(error), and becomes a 500 the
 * normal way.
 */

import type { z } from 'zod'
import type { ToolCatalogueRepository } from '../catalogue/repository.ts'
import { RETRIEVAL } from '../config/limits.ts'
import { duplicateUrl, validationFailed } from '../domain/errors.ts'
import { normalizeUrl } from './normalizeUrl.ts'
import { SubmissionInputSchema } from './schema.ts'
import type { SubmissionStore } from './store.ts'
import type { Submission } from './types.ts'

export interface SubmissionService {
  submit(rawBody: unknown): Promise<Submission>
}

export interface CreateSubmissionServiceOptions {
  store: SubmissionStore
  catalogue: ToolCatalogueRepository
}

const DUPLICATE_MESSAGE = 'That site has already been submitted.'

/**
 * One message per field, keyed the way the client's own field names read —
 * `fields.tagline`, not a numbered path — since that key is what a later
 * slice attaches directly to the matching <FormField>. A `.strict()`
 * rejection (an extra key, like the attacker-chosen `"status":"approved"`
 * from §11) has no field of its own on the form, so it is keyed `_`.
 */
function fieldsFromZodError(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_'
    if (!(key in fields)) fields[key] = issue.message
  }
  return fields
}

/**
 * Whether any tool already in the catalogue answers to this normalized URL.
 *
 * `search()`, not a dedicated lookup: the catalogue port deliberately has no
 * listAll() (repository.ts §6.2's rule 3), and RETRIEVAL.prefilterLimit is
 * already documented there as "comfortably above the whole seed catalogue"
 * — the same bound retrieval itself scores against, reused here rather than
 * a second guess at how big "all of it" is. `status: 'all'` includes
 * drafts: an unpublished tool at this URL is still a reason to call this a
 * duplicate. A seed record whose own `url` happens to be unparseable is
 * treated as a non-match rather than failing the whole submission over it.
 */
async function catalogueHasUrl(
  catalogue: ToolCatalogueRepository,
  normalizedUrl: string,
): Promise<boolean> {
  const page = await catalogue.search({ status: 'all', limit: RETRIEVAL.prefilterLimit })
  return page.items.some((tool) => {
    try {
      return normalizeUrl(tool.url) === normalizedUrl
    } catch {
      return false
    }
  })
}

export function createSubmissionService({
  store,
  catalogue,
}: CreateSubmissionServiceOptions): SubmissionService {
  return {
    async submit(rawBody) {
      const parsed = SubmissionInputSchema.safeParse(rawBody)
      if (!parsed.success) {
        throw validationFailed(
          'The submission has one or more invalid fields.',
          fieldsFromZodError(parsed.error),
        )
      }
      const input = parsed.data

      // Already proven parseable by SiteUrlSchema's own superRefine, so this
      // is not expected to throw — if it somehow did, that is a genuine bug,
      // and letting it propagate to the route's catch (-> 500) is correct.
      const normalized = normalizeUrl(input.siteUrl)

      if (await store.findByNormalizedUrl(normalized)) {
        throw duplicateUrl(DUPLICATE_MESSAGE)
      }
      if (await catalogueHasUrl(catalogue, normalized)) {
        throw duplicateUrl(DUPLICATE_MESSAGE)
      }

      return store.create({ ...input, normalizedUrl: normalized })
    },
  }
}
