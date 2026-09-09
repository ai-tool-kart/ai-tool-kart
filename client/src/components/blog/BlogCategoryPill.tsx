import { blogCategoryLabel } from '@/utils/blog'

/*
 * Uppercase category pill for the /blog views.
 *
 * Source: AI Tool Kart Site.dc.html — the featured card uses the violet-tinted
 * treatment, the grid cards a quieter neutral one. Both fall back to "Journal"
 * when the post carries no category (or only WordPress's "Uncategorized"); the
 * fallback word itself lives in utils/blog so Home uses the same one.
 *
 * Home's Blog & Insights pills are NOT this component: their colour is the
 * card's own tone, carried on a CSS custom property, which a fixed variant map
 * cannot express.
 */

interface BlogCategoryPillProps {
  category?: string
  variant?: 'featured' | 'card'
}

const VARIANTS = {
  featured:
    'rounded-pill border border-[rgba(178,150,255,0.28)] bg-[rgba(124,90,246,0.14)] px-[11px] py-[5px] text-[11px] tracking-[0.12em] uppercase text-[#C6B2FF]',
  card: 'rounded-pill border border-white/[0.09] bg-white/[0.03] px-[10px] py-1 text-[10.5px] tracking-[0.12em] uppercase text-accent-strong',
} as const

export default function BlogCategoryPill({
  category,
  variant = 'card',
}: BlogCategoryPillProps) {
  return <span className={VARIANTS[variant]}>{blogCategoryLabel(category)}</span>
}
