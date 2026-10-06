import type { SubmissionStatus } from '@/types/auth'
import { ADMIN_STATUS_LABEL } from '@/utils/adminFormat'

/*
 * A submission status pill. The account pages' accent pill, with the
 * catalogue's existing pink for refusals and a quiet tone for states that
 * are waiting on someone else — so a queue can be scanned by colour.
 */

const TONE: Record<SubmissionStatus, string> = {
  SUBMITTED: 'bg-accent-wash-strong text-accent',
  UNDER_REVIEW: 'bg-accent-wash-strong text-accent',
  CHANGES_REQUESTED: 'bg-white/[0.07] text-muted-soft',
  APPROVED: 'bg-[rgba(74,208,148,0.14)] text-[#9fe7c3]',
  PUBLISHED: 'bg-[rgba(74,208,148,0.14)] text-[#9fe7c3]',
  REJECTED: 'bg-pink-bg text-pink',
  UNPUBLISHED: 'bg-white/[0.07] text-muted-soft',
  ARCHIVED: 'bg-white/[0.07] text-muted-soft',
}

export default function StatusBadge({ status }: { status: SubmissionStatus }) {
  return (
    <span
      className={`inline-block rounded-tag px-[10px] py-[5px] text-[11px] font-bold tracking-[0.05em] whitespace-nowrap uppercase ${TONE[status] ?? TONE.SUBMITTED}`}
    >
      {ADMIN_STATUS_LABEL[status] ?? status}
    </span>
  )
}
