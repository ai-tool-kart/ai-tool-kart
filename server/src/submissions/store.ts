/*
 * THE PORT — SPEC-submit-backend.md §3.
 *
 * Nothing outside store.json.ts (or a future store.postgres.ts) may know
 * submissions are stored as a file. Every method is async, even though the
 * JSON adapter never has to actually wait on anything that matters at this
 * scale — a Postgres adapter will, and callers must already be written for
 * that, the same reasoning catalogue/repository.ts documents for
 * ToolCatalogueRepository.
 *
 * The service layer and the route import THIS file, never store.json.ts.
 */

import { join } from 'node:path'
import { createJsonSubmissionStore } from './store.json.ts'
import type { NewSubmission, Submission, SubmissionStatus } from './types.ts'

export interface SubmissionStore {
  create(input: NewSubmission): Promise<Submission>
  findByNormalizedUrl(url: string): Promise<Submission | null>
  list(opts?: { status?: SubmissionStatus; limit?: number }): Promise<Submission[]>
}

/**
 * Resolved against the current working directory, not against this
 * module's own location. `data/` is a sibling of `src/` (SPEC §2), not of
 * `src/submissions/`, and it holds mutable runtime state rather than a
 * build asset — unlike the catalogue's own seeded, read-only data file,
 * there is no dist/ copy of this one to stay symmetric with. `npm run
 * dev` / `start` / `test` all already run with the server package as cwd —
 * the same assumption package.json's `--env-file-if-exists=.env` makes.
 */
const SUBMISSIONS_FILE = join(process.cwd(), 'data', 'submissions.json')

export function createSubmissionStore(): SubmissionStore {
  // Reads a config value. Today only 'json' is implemented.
  // Adding 'postgres' later means adding one case here and one new file.
  return createJsonSubmissionStore(SUBMISSIONS_FILE)
}
