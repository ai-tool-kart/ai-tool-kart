import { apiRequest } from '@/services/http'
import type { SubmissionPayload } from '@/types/submit'

/*
 * POST /api/submissions transport — SPEC-submit-backend.md §7/§8.
 *
 * Same shape as services/assistant.ts: one function, one endpoint, no local
 * validation or "helpful" defaults. The schema is the server's; this module's
 * job is to post the payload types/submit.ts already built and hand back
 * whatever came out, success or ApiRequestError.
 */

const SUBMISSIONS_PATH = '/submissions'

export interface SubmissionResult {
  id: string
  status: string
  createdAt: string
}

export async function submitTool(
  payload: SubmissionPayload,
  signal?: AbortSignal,
): Promise<SubmissionResult> {
  return apiRequest<SubmissionResult>(SUBMISSIONS_PATH, { body: payload, signal })
}
