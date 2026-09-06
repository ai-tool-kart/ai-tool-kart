import { useNavigate } from 'react-router-dom'
import ToolCard from '@/components/tools/ToolCard'
import type { LegacyMockTool } from '@/types/tool'

/*
 * Auto-scrolling trending row.
 *
 * The list is duplicated so the akMarquee keyframe (translate to -50%) loops
 * seamlessly — same technique as the handoff, which renders TOOLS.concat(TOOLS).
 * Hover pauses the animation, and the reduced-motion rule in animations.css
 * effectively stops it for users who ask for that.
 */

interface TrendingMarqueeProps {
  tools: LegacyMockTool[]
}

export default function TrendingMarquee({ tools }: TrendingMarqueeProps) {
  const navigate = useNavigate()
  const loop = [...tools, ...tools]

  return (
    <div className="relative mt-9 [mask-image:linear-gradient(90deg,transparent_0,#000_7%,#000_93%,transparent_100%)] [-webkit-mask-image:linear-gradient(90deg,transparent_0,#000_7%,#000_93%,transparent_100%)]">
      <div className="flex w-max gap-[18px] px-8 pt-[6px] pb-[26px] [animation:akMarquee_68s_linear_infinite] hover:[animation-play-state:paused]">
        {loop.map((tool, i) => (
          <ToolCard
            key={`${tool.id}-${i}`}
            tool={tool}
            variant="trending"
            onClick={() => navigate('/browse')}
          />
        ))}
      </div>
    </div>
  )
}
