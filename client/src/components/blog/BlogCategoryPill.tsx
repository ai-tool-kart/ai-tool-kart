/*
 * Uppercase category pill.
 *
 * Source: AI Tool Kart Site.dc.html — the featured card uses the violet-tinted
 * treatment, the grid cards a quieter neutral one. Both fall back to "Journal"
 * when the post carries no category (or only WordPress's "Uncategorized").
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
  return <span className={VARIANTS[variant]}>{category ?? 'Journal'}</span>
}
