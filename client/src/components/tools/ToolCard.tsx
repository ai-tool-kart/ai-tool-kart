import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Chip from '@/components/ui/Chip'
import GlowCard from '@/components/ui/GlowCard'
import Monogram from '@/components/ui/Monogram'
import type { LegacyMockTool } from '@/types/tool'
import { formatCategoryModel, formatRating } from '@/utils/format'

/*
 * LEGACY tool card, in its three treatments from the first handoff.
 *
 * Milestone 3 replaced the Browse card with components/tools/CatalogueToolCard,
 * which is typed on the real catalogue record. This one now serves only the
 * four surfaces still reading data/tools.ts, all of which are redesigned in
 * Milestone 4 — at which point this file goes with them.
 *
 * Its three treatments from the handoff:
 *
 *  - featured: Home "Featured tools" grid — 24px padding, r22, glass gradient,
 *              top accent hairline, badge, tags, rating/price footer.
 *  - browse:   Browse results grid — 22px padding, r20, flat fill, rating in the
 *              header, price + Compare footer.
 *  - trending: Home marquee — fixed 300px width, r18, trend badge, no tags.
 *
 * The layouts genuinely differ, so each is rendered explicitly rather than
 * forced through one parameterised template.
 */

interface ToolCardProps {
  tool: LegacyMockTool
  variant?: 'featured' | 'browse' | 'trending'
  onClick?: () => void
  onCompare?: () => void
}

export default function ToolCard({
  tool,
  variant = 'featured',
  onClick,
  onCompare,
}: ToolCardProps) {
  if (variant === 'trending') {
    return (
      <div
        onClick={onClick}
        className="w-[300px] cursor-pointer rounded-card border border-hairline bg-white/[0.035] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.40),0_8px_22px_-16px_rgba(0,0,0,0.90)] transition-[transform,box-shadow,border-color] duration-[350ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[6px] hover:border-accent-line hover:shadow-[0_2px_4px_rgba(0,0,0,0.46),0_26px_46px_-24px_rgba(116,80,244,0.4)]"
      >
        <div className="flex items-center gap-3">
          <Monogram mono={tool.mono} size="sm" />
          <div className="min-w-0">
            <div className="truncate text-[16px] font-semibold text-ink">{tool.name}</div>
            <div className="text-[12.5px] text-subtle">{tool.cat}</div>
          </div>
          <div className="ml-auto flex-none">
            <Badge variant="trend">{tool.trend}</Badge>
          </div>
        </div>
        <div className="mt-[14px] text-[13.5px] leading-[1.5] text-pretty text-muted">
          {tool.tagline}
        </div>
      </div>
    )
  }

  if (variant === 'browse') {
    return (
      <GlowCard
        reveal="stagger"
        glowSize={320}
        glowFrom={0.216}
        glowMid={0.072}
        className="flex flex-col gap-[14px] rounded-card-lg border border-hairline bg-white/[0.035] p-[22px] shadow-[0_1px_2px_rgba(0,0,0,0.40)] transition-[transform,box-shadow,border-color] duration-[350ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:border-accent-line hover:shadow-[0_26px_50px_-30px_rgba(116,80,244,0.5)]"
      >
        <div className="flex items-start gap-3">
          <Monogram mono={tool.mono} size="md" />
          <div className="min-w-0 flex-auto">
            <div className="text-[17px] font-semibold tracking-[-0.012em] text-ink">
              {tool.name}
            </div>
            <div className="mt-[2px] truncate text-[12.5px] text-subtle">
              {formatCategoryModel(tool.cat, tool.model)}
            </div>
          </div>
          <div className="flex-none text-[13.5px] font-semibold text-ink">
            {formatRating(tool.rating)}
          </div>
        </div>
        <div className="flex-auto text-[14px] leading-[1.5] text-pretty text-muted">
          {tool.tagline}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-[10px] border-t border-white/[0.07] pt-[13px]">
          <div className="text-[13.5px] whitespace-nowrap text-muted-soft">{tool.price}</div>
          <Button variant="ghost" onClick={onCompare}>
            Compare
          </Button>
        </div>
      </GlowCard>
    )
  }

  return (
    <GlowCard
      onClick={onClick}
      reveal="stagger"
      glowSize={360}
      glowFrom={0.252}
      glowMid={0.09}
      className="flex flex-col gap-[15px] rounded-card-lg border border-hairline bg-[image:var(--gradient-glass)] p-6 shadow-card transition-[transform,box-shadow,border-color,background] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[7px] hover:border-accent-line hover:bg-[image:linear-gradient(180deg,rgba(160,120,255,0.13),rgba(255,255,255,0.03)_46%)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.46),0_34px_60px_-28px_rgba(116,80,244,0.45)]"
    >
      {/* Top accent hairline. */}
      <div
        aria-hidden="true"
        className="absolute top-0 right-6 left-6 h-[2px] rounded-[2px] bg-[linear-gradient(90deg,rgba(154,110,255,0.7),rgba(146,172,255,0.425),transparent)]"
      />

      {tool.badge && (
        <div className="self-start">
          <Badge variant="editorial">{tool.badge}</Badge>
        </div>
      )}

      <div className="flex items-center gap-[13px]">
        <Monogram mono={tool.mono} size="lg" />
        <div className="min-w-0 flex-auto">
          <div className="text-[18px] font-semibold tracking-[-0.015em] break-words text-ink">
            {tool.name}
          </div>
          <div className="mt-[3px] truncate text-[13px] text-subtle">
            {formatCategoryModel(tool.cat, tool.model)}
          </div>
        </div>
      </div>

      <div className="flex-auto text-[14.5px] leading-[1.55] text-pretty text-muted">
        {tool.tagline}
      </div>

      <div className="flex flex-wrap gap-[7px]">
        {tool.tags.map((tag) => (
          <Chip key={tag}>{tag}</Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-[14px] gap-y-[6px] border-t border-white/[0.07] pt-[15px]">
        <div className="text-[13.5px] whitespace-nowrap text-muted-dim">
          <span className="font-semibold text-ink">{formatRating(tool.rating)}</span> ·{' '}
          {tool.reviews}
        </div>
        <div className="text-[13.5px] font-semibold whitespace-nowrap text-ink">
          {tool.price}
        </div>
      </div>
    </GlowCard>
  )
}
