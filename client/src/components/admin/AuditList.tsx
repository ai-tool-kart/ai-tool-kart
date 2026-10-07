import { Link } from 'react-router-dom'
import { ActionBadge, Chip } from '@/components/admin/AdminBadges'
import { SURFACE } from '@/components/admin/adminTheme'
import type { AuditEntry } from '@/types/admin'
import { auditDetail, formatDateTime } from '@/utils/adminFormat'

/*
 * A read-only activity stream of audit entries: timestamp, action, actor →
 * target, and the one-line detail (the reason, the note, the fields
 * changed). The full metadata the API returned is one click away in a
 * disclosure, rendered as key/value lines rather than a JSON blob.
 *
 * There is deliberately no edit or delete affordance anywhere: both audit
 * tables are append-only in the database, and the API has no route that
 * could change one.
 */

const LINK = 'text-ink hover:text-[#cbbaff]'

function Who({ entry }: { entry: AuditEntry }) {
  if (entry.actorType === 'SYSTEM' || !entry.actor) return <span className="text-[#a9a4bd]">System</span>
  return (
    <Link to={`/admin/users/${entry.actor.id}`} className={LINK}>
      {entry.actor.name || entry.actor.email}
    </Link>
  )
}

function Subject({ entry }: { entry: AuditEntry }) {
  if (entry.submission) {
    return (
      <Link to={`/admin/submissions/${entry.submission.id}`} className={LINK}>
        {entry.submission.name}
      </Link>
    )
  }
  return (
    <>
      {entry.tool && (
        <Link to={`/admin/tools/${entry.tool.id}`} className={LINK}>
          {entry.tool.name}
        </Link>
      )}
      {entry.tool && entry.targetUser && <span className="text-[#5e5a72]"> · </span>}
      {entry.targetUser && (
        <Link to={`/admin/users/${entry.targetUser.id}`} className={LINK}>
          {entry.targetUser.email}
        </Link>
      )}
    </>
  )
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.map(show).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Key/value lines; a `changes` map becomes "field: before → after". `shown` is already on screen. */
function metadataLines(metadata: Record<string, unknown>, shown: string | undefined): [string, string][] {
  const lines: [string, string][] = []
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'changes' && value && typeof value === 'object') {
      for (const [field, change] of Object.entries(value as Record<string, { from?: unknown; to?: unknown }>)) {
        lines.push([field, `${show(change?.from)} → ${show(change?.to)}`])
      }
    } else if (show(value) !== shown) lines.push([key, show(value)])
  }
  return lines
}

function MetadataLines({ lines }: { lines: [string, string][] }) {
  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-[6px] border border-white/[0.06] bg-[#08080b] px-3 py-2 font-mono text-[11.5px] sm:grid-cols-[max-content_minmax(0,1fr)]">
      {lines.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-[#7f7a95]">{key}</dt>
          <dd className="break-words whitespace-pre-wrap text-[#cfcbe0]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function AuditList({ entries, showSubject = true }: { entries: AuditEntry[]; showSubject?: boolean }) {
  return (
    <ol aria-label="Audit history" className={`${SURFACE} divide-y divide-white/[0.05]`}>
      {entries.map((entry) => {
        const detail = auditDetail(entry)
        const lines = metadataLines(entry.metadata, detail)
        return (
          <li key={entry.id} className="grid gap-x-4 gap-y-1.5 px-4 py-3 text-[13px] md:grid-cols-[150px_minmax(0,1fr)]">
            <time dateTime={entry.createdAt} className="font-mono text-[11.5px] leading-[20px] text-[#7f7a95]">
              {formatDateTime(entry.createdAt)}
            </time>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <ActionBadge type={entry.type} />
                {entry.type === 'NOTE_ADDED' && (
                  <Chip tone="neutral" dot={false}>
                    Admin-only
                  </Chip>
                )}
                <span className="text-[#8e88a8]">
                  <Who entry={entry} />
                  {showSubject && (entry.submission || entry.tool || entry.targetUser) && (
                    <>
                      <span className="text-[#5e5a72]"> → </span>
                      <Subject entry={entry} />
                    </>
                  )}
                </span>
              </div>
              {detail && <p className="mt-1.5 text-[13px] leading-[1.55] break-words whitespace-pre-line text-[#cfcbe0]">{detail}</p>}
              {lines.length > 0 && (
                <details className="group mt-1">
                  <summary className="w-fit cursor-pointer list-none font-mono text-[11px] text-[#6f6a85] select-none hover:text-[#a9a4bd]">
                    <span className="group-open:hidden">+ metadata</span>
                    <span className="hidden group-open:inline">− metadata</span>
                  </summary>
                  <MetadataLines lines={lines} />
                </details>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
