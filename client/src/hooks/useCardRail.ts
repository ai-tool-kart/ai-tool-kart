import { useCallback, useEffect, useRef, useState } from 'react'

/*
 * A horizontally scrolling card rail with paging arrows.
 *
 * Source: AI Tool Kart Site.dc.html — `bindRail()` / `useRailStep()`, the
 * behaviour behind the "Popular ways", "Recently added" and workflow rails.
 * Ported as written, including the two details that make it feel right:
 *
 *  - an arrow moves ONE page (70% of the visible width), not one card, so a
 *    click always changes what is on screen rather than nudging it;
 *  - the arrows and the edge fades follow the REAL scroll position, so
 *    dragging the rail, flicking it on a trackpad and clicking an arrow all
 *    leave the same state behind. The prototype's 6px tolerance is kept: sub-
 *    pixel layout leaves a fraction at each end, and without it the "scroll
 *    right" arrow never disappears.
 *
 * The rail owns no styling. It reports what it can scroll and the caller draws
 * the arrows and the mask, because those differ per section in the design.
 */

/** Below this, the rail is treated as being at the end. Sub-pixel tolerance. */
const EDGE_TOLERANCE = 6

export interface CardRail {
  /** Attach to the scrolling element. */
  ref: React.RefObject<HTMLDivElement | null>
  canScrollPrev: boolean
  canScrollNext: boolean
  /** Pages the rail by one screenful. `-1` back, `1` forward. */
  step: (direction: -1 | 1) => void
}

export interface UseCardRailOptions {
  /**
   * Smallest page step, in px. The design uses roughly one card plus its gap so
   * that on a narrow viewport — where 70% of the width is less than a card —
   * an arrow still advances a whole card rather than part of one.
   */
  minStep: number
}

export function useCardRail({ minStep }: UseCardRailOptions): CardRail {
  const ref = useRef<HTMLDivElement | null>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const sync = () => {
      setCanScrollPrev(el.scrollLeft > EDGE_TOLERANCE)
      setCanScrollNext(el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_TOLERANCE)
    }

    el.addEventListener('scroll', sync, { passive: true })
    // Both the viewport and the content can change width — a font swap or a
    // count arriving late reflows the cards — so the element itself is watched
    // rather than the window.
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    sync()

    return () => {
      el.removeEventListener('scroll', sync)
      observer.disconnect()
    }
  }, [])

  const step = useCallback(
    (direction: -1 | 1) => {
      const el = ref.current
      if (!el) return
      el.scrollBy({
        left: direction * Math.max(minStep, Math.round(el.clientWidth * 0.7)),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      })
    },
    [minStep],
  )

  return { ref, canScrollPrev, canScrollNext, step }
}
