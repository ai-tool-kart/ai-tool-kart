import type { Tool } from '@/types/tool'

export interface Faq {
  q: string
  a: string
}

/** Hero stat pair. Values are editorial copy in the design, not derived. */
export interface Stat {
  value: string
  label: string
}

/**
 * A comparison-table row defined as an accessor over a Tool, so the table stays
 * data-driven instead of hand-written cells.
 */
export interface ComparisonRow {
  label: string
  cell: (tool: Tool) => string
}
