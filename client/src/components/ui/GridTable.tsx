import { Fragment } from 'react'
import type { ReactNode } from 'react'

/*
 * The CSS-grid "table" used by both the Compare page and the Pricing matrix.
 *
 * The design fakes table borders by putting a 1px hairline background behind a
 * 1px-gap grid, so each cell's own fill leaves the gaps showing through. Rows
 * are not <table> markup in the source and are kept as a grid here to preserve
 * that effect exactly.
 */

export interface GridTableRow {
  label: string
  cells: ReactNode[]
}

interface GridTableProps {
  /** First column header, e.g. "Pick your tools" / "What's included". */
  headLabel: string
  /** One node per data column — a select on Compare, a tier name on Pricing. */
  headCells: ReactNode[]
  rows: GridTableRow[]
  density?: 'compare' | 'matrix'
}

const PRESETS = {
  compare: {
    shell: 'rounded-panel shadow-[0_24px_50px_-36px_rgba(0,0,0,0.90)]',
    columns: 'grid-cols-[220px_repeat(3,1fr)]',
    headLabelCell: 'p-5',
    headCell: 'px-5 py-4',
    labelCell: 'px-5 py-[17px] text-[14px]',
    cell: 'px-5 py-[17px] text-[14.5px]',
  },
  matrix: {
    shell: 'rounded-card-lg',
    columns: 'grid-cols-[1.4fr_repeat(3,1fr)]',
    headLabelCell: 'px-5 py-[15px]',
    headCell: 'px-5 py-[15px] text-[14.5px] font-semibold text-ink',
    labelCell: 'px-5 py-[14px] text-[14px]',
    cell: 'px-5 py-[14px] text-[14px]',
  },
} as const

export default function GridTable({
  headLabel,
  headCells,
  rows,
  density = 'compare',
}: GridTableProps) {
  const preset = PRESETS[density]

  return (
    <div className={`overflow-hidden border border-hairline ${preset.shell}`}>
      <div className={`grid gap-px bg-hairline ${preset.columns}`}>
        <div
          className={`bg-row-head text-[12.5px] tracking-[0.1em] uppercase text-subtle ${preset.headLabelCell}`}
        >
          {headLabel}
        </div>
        {headCells.map((cell, i) => (
          <div key={i} className={`bg-row-head ${preset.headCell}`}>
            {cell}
          </div>
        ))}

        {rows.map((row) => (
          <Fragment key={row.label}>
            <div className={`bg-row-body text-muted-dim ${preset.labelCell}`}>{row.label}</div>
            {row.cells.map((cell, i) => (
              <div key={i} className={`bg-row-body text-ink ${preset.cell}`}>
                {cell}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
