import { useEffect, useState } from 'react'

/*
 * "On this page" — the reference's tab row, as in-page anchors.
 *
 * Plain `#id` links, so they work without JavaScript and each section is a
 * shareable URL. The highlight follows the reader: the current section is
 * the last one whose top has scrolled past ACTIVE_LINE, a little below the
 * sticky header and this bar.
 */

/** Viewport y, in px, a section's top must pass to count as current. */
const ACTIVE_LINE = 220

export interface GuideNavItem {
  id: string
  label: string
}

export default function GuideSectionNav({ items }: { items: GuideNavItem[] }) {
  const [current, setCurrent] = useState(items[0]?.id)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      let next = items[0]?.id
      for (const item of items) {
        const top = document.getElementById(item.id)?.getBoundingClientRect().top
        if (top !== undefined && top <= ACTIVE_LINE) next = item.id
      }
      setCurrent(next)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.cancelAnimationFrame(frame)
    }
  }, [items])

  return (
    <nav aria-label="On this page" className="min-w-0">
      <ul className="flex list-none gap-1 overflow-x-auto p-1 [scrollbar-width:none]">
        {items.map((item) => {
          const active = item.id === current
          return (
            <li key={item.id} className="flex-none">
              <a
                href={`#${item.id}`}
                aria-current={active ? 'location' : undefined}
                className={`block rounded-pill px-[14px] py-[7px] text-[13px] font-medium whitespace-nowrap transition-[background-color,color] duration-200 ${
                  active
                    ? 'bg-[rgba(124,88,244,0.2)] text-ink hover:text-ink'
                    : 'text-subtle-soft hover:bg-white/[0.05] hover:text-ink'
                }`}
              >
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
