import { useNavigate } from 'react-router-dom'
import CategoryGrid from '@/components/categories/CategoryGrid'
import Section from '@/components/layout/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { CATEGORIES } from '@/data/categories'

/*
 * Category tiles. Clicking a tile pre-selects that category on Browse — the
 * prototype set state.cat then switched view; the routed equivalent is a param.
 */

export default function CategoriesSection() {
  const navigate = useNavigate()

  return (
    <Section>
      <SectionHeading
        eyebrow="38 categories"
        title="Browse by what you're trying to do"
      />
      <div className="mt-[34px]">
        <CategoryGrid
          categories={CATEGORIES}
          onCategoryClick={(category) =>
            navigate(`/browse?cat=${encodeURIComponent(category.name)}`)
          }
        />
      </div>
    </Section>
  )
}
