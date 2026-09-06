import type { ReactNode } from 'react'
import CatalogueToolCard from '@/components/catalogue/CatalogueToolCard'
import type { Tool } from '@/types/tool'

/*
 * The catalogue results grid.
 *
 * `repeat(auto-fit, minmax(268px, 1fr))` is the design's own column rule and is
 * why this needs no breakpoints: the grid fits as many 268px-minimum columns as
 * the container allows and stretches them to fill, so it goes 4-up on a wide
 * desktop and 1-up on a phone by arithmetic rather than by media query. The
 * cards inside are equal-height because the grid stretches them, which is what
 * keeps every footer on a shared baseline.
 *
 * Milestone 4's home sections can render this directly for any Tool[] — a
 * featured six, a recently-added row — without a second grid component.
 */

interface CatalogueToolGridProps {
  tools: Tool[]
  onOpen?: (tool: Tool) => void
  onCompare?: (tool: Tool) => void
  /** Appended inside the grid, e.g. the skeletons of a page being loaded. */
  children?: ReactNode
}

export const GRID_CLASS = 'grid grid-cols-[repeat(auto-fit,minmax(268px,1fr))] gap-5'

export default function CatalogueToolGrid({
  tools,
  onOpen,
  onCompare,
  children,
}: CatalogueToolGridProps) {
  return (
    <div className={GRID_CLASS}>
      {tools.map((tool, index) => (
        <CatalogueToolCard
          key={tool.id}
          tool={tool}
          index={index}
          {...(onOpen ? { onOpen } : {})}
          {...(onCompare ? { onCompare } : {})}
        />
      ))}
      {children}
    </div>
  )
}
