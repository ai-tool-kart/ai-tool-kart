import type { ToolCategoryName } from '@/types/tool'

/** A browsable category tile. Only 8 of the tool categories have one. */
export interface Category {
  name: Extract<
    ToolCategoryName,
    'Writing' | 'Image' | 'Code' | 'Video' | 'Audio' | 'Agents' | 'Data' | 'Design'
  >
  /** Headline count from the design — editorial, not derived from the tool list. */
  count: number
  note: string
}
