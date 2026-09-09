import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/*
 * Scroll position on navigation.
 *
 * Two jobs:
 *
 *  - a plain route change starts at the top. The design's go(page) did
 *    `window.scrollTo(0, 0)` on every view change; real routes need it stated.
 *  - a link carrying a fragment (the nav's Community item, `/#community`) lands
 *    on that element instead. React Router does not act on a hash by itself —
 *    when the URL changes the target usually has not rendered yet — so a
 *    fragment link does nothing at all unless somewhere does this.
 *
 * ── Why the anchor is re-applied ─────────────────────────────────────────────
 *
 * Arriving at `/#community` from another page is the hard case. The homepage's
 * catalogue- and CMS-backed sections all sit ABOVE Community, and they mount as
 * skeletons and then resize — and Featured, Recently Added and Blog & Insights
 * remove themselves outright when their source is unreachable. Scrolling once
 * on mount would land correctly and then drift by the height of whatever
 * settled overhead, which on a cold start with the API down is thousands of
 * pixels.
 *
 * So the target is re-anchored over a short window, from two signals:
 *
 *  - a ResizeObserver, because a height change IS the drift;
 *  - a handful of timed passes, because the observer alone was measurably not
 *    enough. Watching `document.body` missed a 23px shrink just above the
 *    target and left the landing 23px low, every time.
 *
 * The first anchor is applied SYNCHRONOUSLY, before either is attached. An
 * earlier version did the first pass inside requestAnimationFrame and was
 * silently dead whenever rAF did not run — background tabs never fire it, and
 * it proved flaky under automation too, landing at the top of the page instead
 * of the section. Effects already run after commit, so the element is in the
 * DOM and there is nothing to wait for.
 *
 * The whole thing is abandoned the instant the reader touches the wheel, the
 * screen or a key: an anchor that keeps yanking the page back is worse than one
 * that ends up slightly off, and the reader's own scroll is the clearest
 * possible signal that they have arrived and taken over.
 */

/** How long to keep the target pinned while the page above it settles. */
const SETTLE_MS = 1200

/**
 * When to re-apply the anchor, in ms after the first pass.
 *
 * Front-loaded: skeletons swap for content early, and anything still moving a
 * second later is rare enough that the reader has usually taken over by then.
 */
const PASSES_MS = [50, 150, 350, 700, SETTLE_MS]

export default function ScrollToTop() {
  /*
   * `key` is in the dependency list so clicking the same fragment link twice
   * scrolls twice — pathname and hash are unchanged on the second click, and
   * without it the effect would not re-run.
   */
  const { pathname, hash, key } = useLocation()

  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''))

    if (!id) {
      window.scrollTo(0, 0)
      return
    }

    const anchor = () => {
      // The target carries `scroll-margin-top`, which scrollIntoView honours,
      // so the heading clears the sticky header without arithmetic here.
      document.getElementById(id)?.scrollIntoView()
    }

    anchor()

    const observer = new ResizeObserver(anchor)
    observer.observe(document.body)

    const timers = PASSES_MS.map((delay) => window.setTimeout(anchor, delay))

    const release = () => {
      observer.disconnect()
      timers.forEach(window.clearTimeout)
      window.clearTimeout(stopTimer)
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchstart', release)
      window.removeEventListener('keydown', release)
    }

    const stopTimer = window.setTimeout(release, SETTLE_MS + 50)
    window.addEventListener('wheel', release, { passive: true })
    window.addEventListener('touchstart', release, { passive: true })
    window.addEventListener('keydown', release)

    return release
  }, [pathname, hash, key])

  return null
}
