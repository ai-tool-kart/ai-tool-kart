import { useEffect, useState } from 'react'

/*
 * "On this page" — the guide's section navigation, in two shapes:
 *
 *   GuideSectionNav  a horizontal pill bar, sticky under the site header —
 *                    below xl, where there is no room beside the article;
 *   GuideToc         a vertical contents list for the xl sidebar, where it
 *                    fills the space beside the reading column.
 *
 * Both are plain `#id` links, so they work without JavaScript and each
 * section is a shareable URL, and both follow the reader with the same
 * scroll-spy (useActiveSection).
 */

/** Viewport y, in px, a section's top must pass to count as current. */
const ACTIVE_LINE = 220

export interface GuideNavItem {
  id: string
  label: string
}

/**
 * The current section: the last one whose top has scrolled past ACTIVE_LINE.
 * At the very bottom of the page the last section is current even if its top
 * never reaches the line — a short final section otherwise never lights up.
 */
function useActiveSection(items: GuideNavItem[]): string | undefined {
  const [current, setCurrent] = useState(items[0]?.id)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      let next = items[0]?.id
      for (const item of items) {
        const top = document.getElementById(item.id)?.getBoundingClientRect().top
        if (top !== undefined && (top <= ACTIVE_LINE || (atBottom && top < window.innerHeight))) next = item.id
      }
      setCurrent(next)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      window.cancelAnimationFrame(frame)
    }
  }, [items])

  return current
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export default function GuideSectionNav({ items }: { items: GuideNavItem[] }) {
  const current = useActiveSection(items)
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
                className={`block rounded-pill px-[14px] py-[7px] text-[13px] font-medium whitespace-nowrap transition-[background-color,color] duration-200 ${FOCUS} ${
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

export function GuideToc({ items }: { items: GuideNavItem[] }) {
  const current = useActiveSection(items)
  return (
    <nav aria-label="On this page">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#A39CBC] uppercase">On this page</p>
      <ul className="mt-3 flex list-none flex-col border-l border-white/[0.08] p-0">
        {items.map((item) => {
          const active = item.id === current
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? 'location' : undefined}
                className={`-ml-px block border-l py-[6px] pl-4 text-[13.5px] leading-[1.4] transition-[border-color,color] duration-200 ${FOCUS} ${
                  active
                    ? 'border-accent font-medium text-ink hover:text-ink'
                    : 'border-transparent text-[#A39CBC] hover:border-white/25 hover:text-ink'
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
