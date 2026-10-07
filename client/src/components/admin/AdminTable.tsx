import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LABEL, SURFACE } from '@/components/admin/adminTheme'

/*
 * A compact list-table for the admin console.
 *
 * Header and rows share ONE column template (`columns`, a literal Tailwind
 * class such as "md:grid-cols-[minmax(0,2fr)_120px]"), so columns line up
 * from row to row. Each row is a single link to the record — the whole row
 * is the click target, keyboard included. Below `md` the header hides and
 * each row's cells stack, so nothing scrolls sideways on a phone.
 */

export interface Column<T> {
  header: string
  render: (row: T) => ReactNode
  /** Extra cell classes, e.g. "md:text-right". */
  className?: string
}

interface AdminTableProps<T> {
  /** Accessible name of the list. */
  label: string
  columns: Column<T>[]
  /** Literal grid template class applied to the header and every row from `md` up. */
  template: string
  rows: T[]
  rowKey: (row: T) => string
  rowHref: (row: T) => string
}

export default function AdminTable<T>({ label, columns, template, rows, rowKey, rowHref }: AdminTableProps<T>) {
  return (
    <div className={`${SURFACE} overflow-hidden`}>
      <div aria-hidden="true" className={`hidden gap-x-4 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2 md:grid ${template}`}>
        {columns.map((column) => (
          <span key={column.header} className={`${LABEL} ${column.className ?? ''}`}>
            {column.header}
          </span>
        ))}
      </div>
      <ul aria-label={label} className="divide-y divide-white/[0.05]">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <Link
              to={rowHref(row)}
              className={`grid grid-cols-1 items-center gap-x-4 gap-y-1.5 px-4 py-3 transition-colors duration-100 hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none md:py-2.5 ${template}`}
            >
              {columns.map((column) => (
                <span key={column.header} className={`min-w-0 ${column.className ?? ''}`}>
                  {column.render(row)}
                </span>
              ))}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
