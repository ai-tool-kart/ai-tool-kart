import GridTable from '@/components/ui/GridTable'
import type { FeatureMatrixRow } from '@/types/pricing'

/** Plan feature-comparison matrix on the Pricing page. */

interface FeatureMatrixProps {
  tierNames: string[]
  rows: FeatureMatrixRow[]
}

export default function FeatureMatrix({ tierNames, rows }: FeatureMatrixProps) {
  return (
    <GridTable
      density="matrix"
      headLabel="What's included"
      headCells={tierNames}
      rows={rows}
    />
  )
}
