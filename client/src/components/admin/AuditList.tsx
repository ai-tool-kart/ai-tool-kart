import { Link } from 'react-router-dom'
import type { AuditEntry } from '@/types/admin'
import { auditDetail, eventLabel, formatDateTime } from '@/utils/adminFormat'

/*
 * A read-only timeline of audit entries. There is deliberately no edit or
 * delete affordance anywhere: both audit tables are append-only in the
 * database, and the API has no route that could change one.
 */

function Who({ entry }: { entry: AuditEntry }) {
  if (entry.actorType === 'SYSTEM' || !entry.actor) return <span>System</span>
  return (
    <Link to={`/admin/users/${entry.actor.id}`} className="text-ink hover:text-accent">
      {entry.actor.name || entry.actor.email}
    </Link>
  )
}

function Subject({ entry }: { entry: AuditEntry }) {
  if (entry.submission) {
    return (
      <Link to={`/admin/submissions/${entry.submission.id}`} className="text-ink hover:text-accent">
        {entry.submission.name}
      </Link>
    )
  }
  return (
    <>
      {entry.tool && (
        <Link to={`/admin/tools/${entry.tool.id}`} className="text-ink hover:text-accent">
          {entry.tool.name}
        </Link>
      )}
      {entry.tool && entry.targetUser && <span> · </span>}
      {entry.targetUser && (
        <Link to={`/admin/users/${entry.targetUser.id}`} className="text-ink hover:text-accent">
          {entry.targetUser.email}
        </Link>
      )}
    </>
  )
}

export default function AuditList({ entries, showSubject = true }: { entries: AuditEntry[]; showSubject?: boolean }) {
  return (
    <ol aria-label="Audit history" className="flex flex-col divide-y divide-hairline rounded-panel border border-hairline">
      {entries.map((entry) => {
        const detail = auditDetail(entry)
        return (
          <li key={entry.id} className="flex flex-col gap-1 px-5 py-4 text-[14px]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-semibold text-ink">
                {eventLabel(entry.type)}
                {entry.type === 'NOTE_ADDED' && (
                  <span className="ml-2 rounded-tag bg-white/[0.07] px-2 py-[2px] text-[10.5px] font-bold tracking-[0.05em] text-muted-soft uppercase">
                    Internal
                  </span>
                )}
              </span>
              <time dateTime={entry.createdAt} className="text-[12.5px] text-subtle">
                {formatDateTime(entry.createdAt)}
              </time>
            </div>
            <div className="text-[13px] text-muted-dim">
              by <Who entry={entry} />
              {showSubject && (entry.submission || entry.tool || entry.targetUser) && (
                <>
                  {' '}
                  on <Subject entry={entry} />
                </>
              )}
            </div>
            {detail && <p className="mt-1 text-[13.5px] leading-[1.55] whitespace-pre-line break-words text-muted-soft">{detail}</p>}
          </li>
        )
      })}
    </ol>
  )
}
