import GlowCard from '@/components/ui/GlowCard'
import type { Category } from '@/types/category'

/** Category tile — name, note and a "N tools →" link line. */

interface CategoryCardProps {
  category: Category
  onClick?: () => void
}

export default function CategoryCard({ category, onClick }: CategoryCardProps) {
  return (
    <GlowCard
      onClick={onClick}
      reveal="stagger"
      glowSize={300}
      glowFrom={0.234}
      glowMid={0.072}
      className="flex min-h-[140px] flex-col gap-2 rounded-card border border-hairline bg-[image:var(--gradient-glass)] p-5 shadow-card-flat transition-[transform,box-shadow,border-color,background-color] duration-[350ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:border-accent-line hover:bg-white/[0.055] hover:shadow-[0_24px_44px_-26px_rgba(116,80,244,0.45)]"
    >
      <div className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
        {category.name}
      </div>
      <div className="flex-auto text-[13px] leading-[1.5] text-pretty text-muted-dim">
        {category.note}
      </div>
      <div className="text-[12.5px] font-semibold tracking-[0.04em] text-accent">
        {category.count} tools →
      </div>
    </GlowCard>
  )
}
