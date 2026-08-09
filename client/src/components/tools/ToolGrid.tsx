import ToolCard from '@/components/tools/ToolCard'
import type { Tool } from '@/types/tool'

/*
 * Grid of tool cards.
 * Columns match the design: 3-up for the featured grid, 2-up for Browse results.
 */

interface ToolGridProps {
  tools: Tool[]
  variant?: 'featured' | 'browse'
  onToolClick?: (tool: Tool) => void
  onCompare?: (tool: Tool) => void
}

export default function ToolGrid({
  tools,
  variant = 'featured',
  onToolClick,
  onCompare,
}: ToolGridProps) {
  return (
    <div
      className={
        variant === 'featured'
          ? 'grid grid-cols-3 gap-5'
          : 'grid grid-cols-2 gap-[18px]'
      }
    >
      {tools.map((tool) => (
        <ToolCard
          key={tool.id}
          tool={tool}
          variant={variant}
          onClick={onToolClick ? () => onToolClick(tool) : undefined}
          onCompare={onCompare ? () => onCompare(tool) : undefined}
        />
      ))}
    </div>
  )
}
