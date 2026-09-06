import GridTable from '@/components/ui/GridTable'
import type { ComparisonRow } from '@/types/content'
import type { LegacyMockTool } from '@/types/tool'
import type { ReactNode } from 'react'

/*
 * Side-by-side tool comparison, driven by ComparisonRow accessors so the same
 * component serves the Home teaser (5 rows) and the Compare page (9 rows).
 */

interface ComparisonTableProps {
  tools: LegacyMockTool[]
  rows: ComparisonRow[]
  headLabel?: string
  /** Column headers — plain names on the teaser, selects on the Compare page. */
  headCells?: ReactNode[]
  density?: 'compare' | 'teaser'
}

export default function ComparisonTable({
  tools,
  rows,
  headLabel = 'Pick your tools',
  headCells,
  density = 'compare',
}: ComparisonTableProps) {
  return (
    <GridTable
      density={density}
      headLabel={headLabel}
      headCells={headCells ?? tools.map((tool) => tool.name)}
      rows={rows.map((row) => ({
        label: row.label,
        cells: tools.map((tool) => row.cell(tool)),
      }))}
    />
  )
}
