import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/*
 * Resets scroll on navigation.
 *
 * The design's go(page) did `window.scrollTo(0, 0)` on every view change; real
 * routes need the same behaviour explicitly.
 */

export default function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
