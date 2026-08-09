import CategoryCard from '@/components/categories/CategoryCard'
import type { Category } from '@/types/category'

/** 4-up grid of category tiles. */

interface CategoryGridProps {
  categories: Category[]
  onCategoryClick?: (category: Category) => void
}

export default function CategoryGrid({ categories, onCategoryClick }: CategoryGridProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {categories.map((category) => (
        <CategoryCard
          key={category.name}
          category={category}
          onClick={onCategoryClick ? () => onCategoryClick(category) : undefined}
        />
      ))}
    </div>
  )
}
