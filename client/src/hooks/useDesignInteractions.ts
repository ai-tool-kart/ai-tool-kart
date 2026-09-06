import { useEffect } from 'react'

/*
 * The four pointer/scroll behaviours the final design installs once on its root:
 *
 *   [data-spot]    a violet spotlight tracks the cursor across a card
 *   [data-magnet]  a button leans a few px toward the cursor and lifts
 *   [data-reveal]  content fades and rises 18px as it enters the viewport
 *   [data-par]     a background layer drifts against the scroll
 *
 * Source: AI Tool Kart Site.dc.html — initSpotlight(), initMagnets(),
 * initReveal()/scanReveal()/sweepReveal(), and the parallax pass in the scroll
 * rAF. Ported behaviour-for-behaviour, including the details that matter:
 *
 *  - every effect is ONE delegated listener on the root, not a listener per
 *    element, so a page with sixty cards still installs four listeners;
 *  - writes are coalesced into a single requestAnimationFrame and are custom
 *    properties or transforms only, so nothing here triggers layout;
 *  - reveal is position-driven rather than IntersectionObserver-driven, so an
 *    element skipped by a scroll jump can never stay invisible, and a 4s
 *    failsafe shows anything still hidden regardless of position;
 *  - touch pointers are ignored by the two hover effects — on a touch screen
 *    they would fire once on tap and stick.
 *
 * The markup carries the attributes; this file is the only place that reads
 * them. Components therefore stay declarative and never register handlers of
 * their own for these effects.
 */

/** How far a magnetic element leans toward the cursor, in px. */
const MAGNET_PULL = 6
/** Reveal fires once an element's top passes this fraction of the viewport. */
const REVEAL_TRIGGER = 0.92
/** Per-sibling stagger for `data-reveal="stagger"`, capped so late cards aren't slow. */
const STAGGER_STEP = 0.055
const STAGGER_MAX = 0.33
/** Anything still hidden this long after mount is shown regardless of position. */
const REVEAL_FAILSAFE_MS = 4000

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Coalesces writes into one animation frame.
 *
 * Pointer events fire far faster than the compositor paints; without this a
 * fast drag across a grid would queue dozens of redundant style writes.
 */
function rafWriter<T>(write: (payload: T) => void): (payload: T) => void {
  let pending: T | undefined
  let queued = false

  return (payload: T) => {
    pending = payload
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      if (pending !== undefined) write(pending)
    })
  }
}

/** Violet spotlight tracking the cursor inside a [data-spot] card. */
function installSpotlight(root: HTMLElement): () => void {
  let active: HTMLElement | undefined

  const paint = rafWriter<{ el: HTMLElement; x: number; y: number }>(({ el, x, y }) => {
    el.style.setProperty('--mx', `${x}px`)
    el.style.setProperty('--my', `${y}px`)
  })

  const fade = (el: HTMLElement, visible: boolean) => {
    el.querySelectorAll<HTMLElement>('[data-spot-layer],[data-spot-edge]').forEach((layer) => {
      layer.style.opacity = visible ? '1' : '0'
    })
  }

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    const target = event.target as HTMLElement | null
    const el = target?.closest<HTMLElement>('[data-spot]') ?? undefined

    if (!el) {
      if (active) fade(active, false)
      active = undefined
      return
    }

    if (active !== el) {
      if (active) fade(active, false)
      active = el
      fade(el, true)
    }

    const rect = el.getBoundingClientRect()
    paint({
      el,
      x: Math.round(event.clientX - rect.left),
      y: Math.round(event.clientY - rect.top),
    })
  }

  const onLeave = () => {
    if (active) fade(active, false)
    active = undefined
  }

  root.addEventListener('pointermove', onMove, { passive: true })
  root.addEventListener('pointerleave', onLeave, { passive: true })

  return () => {
    root.removeEventListener('pointermove', onMove)
    root.removeEventListener('pointerleave', onLeave)
  }
}

/** Magnetic lean + lift on [data-magnet] buttons. */
function installMagnets(root: HTMLElement): () => void {
  const paint = rafWriter<{ el: HTMLElement; x: number; y: number }>(({ el, x, y }) => {
    el.style.transform = `translate3d(${x.toFixed(2)}px,${(y - 3).toFixed(2)}px,0)`
  })

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    const target = event.target as HTMLElement | null
    const el = target?.closest<HTMLElement>('[data-magnet]')
    if (!el) return

    const rect = el.getBoundingClientRect()
    paint({
      el,
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2 * MAGNET_PULL,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 2 * (MAGNET_PULL * 0.5),
    })
  }

  // pointerout (not pointerleave) so the reset also fires when the cursor moves
  // from the button onto a sibling; the relatedTarget check keeps it from
  // resetting while the cursor is still travelling over the button's own child.
  const onOut = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null
    const el = target?.closest<HTMLElement>('[data-magnet]')
    if (el && !el.contains(event.relatedTarget as Node | null)) el.style.transform = ''
  }

  root.addEventListener('pointermove', onMove, { passive: true })
  root.addEventListener('pointerout', onOut, { passive: true })

  return () => {
    root.removeEventListener('pointermove', onMove)
    root.removeEventListener('pointerout', onOut)
  }
}

/**
 * Entry reveals for [data-reveal].
 *
 * Returns a `scan` callback so a route change can pick up newly mounted nodes —
 * the prototype had one page and never needed it; a router does.
 */
function installReveal(root: HTMLElement): { scan: () => void; dispose: () => void } {
  let pending: HTMLElement[] = []

  const sweep = (force = false) => {
    if (pending.length === 0) return
    const viewport = window.innerHeight || 800
    const still: HTMLElement[] = []

    for (const el of pending) {
      if (!el.isConnected) continue
      if (!force && el.getBoundingClientRect().top > viewport * REVEAL_TRIGGER) {
        still.push(el)
        continue
      }
      const delay = Number(el.dataset.akDelay ?? 0)
      el.style.transition =
        `opacity .75s cubic-bezier(.16,.84,.44,1) ${delay}s,` +
        ` transform .85s cubic-bezier(.16,.84,.44,1) ${delay}s`
      el.style.opacity = '1'
      el.style.transform = 'translate3d(0,0,0)'
      window.setTimeout(() => {
        el.style.willChange = 'auto'
      }, 1100 + delay * 1000)
    }

    pending = still
  }

  const scan = () => {
    const nodes = root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-ak-seen])')
    // Stagger counts reset per scan, and are keyed by parent so each grid
    // staggers independently rather than continuing the previous grid's count.
    const counters = new Map<Node, number>()

    nodes.forEach((el) => {
      el.dataset.akSeen = '1'
      let delay: number
      if (el.dataset.reveal === 'stagger') {
        const index = counters.get(el.parentNode as Node) ?? 0
        counters.set(el.parentNode as Node, index + 1)
        delay = Math.min(index * STAGGER_STEP, STAGGER_MAX)
      } else {
        delay = Number.parseFloat(el.dataset.reveal ?? '') || 0
      }
      el.dataset.akDelay = String(delay)
      el.style.opacity = '0'
      el.style.transform = 'translate3d(0,18px,0)'
      el.style.willChange = 'opacity, transform'
      pending.push(el)
    })

    sweep()
  }

  const onScroll = () => sweep()
  const onResize = () => sweep()

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  const failsafe = window.setTimeout(() => sweep(true), REVEAL_FAILSAFE_MS)

  return {
    scan,
    dispose: () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.clearTimeout(failsafe)
      // Leave nothing mid-transition if the tree unmounts while items are hidden.
      sweep(true)
    },
  }
}

/** Background layers drifting against the scroll, at the rate in `data-par`. */
function installParallax(root: HTMLElement): () => void {
  const paint = rafWriter<number>((scrollY) => {
    root.querySelectorAll<HTMLElement>('[data-par]').forEach((el) => {
      const rate = Number.parseFloat(el.dataset.par ?? '') || 0
      el.style.transform = `translate3d(0,${(scrollY * rate).toFixed(2)}px,0)`
    })
  })

  const onScroll = () => paint(window.scrollY)
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  return () => window.removeEventListener('scroll', onScroll)
}

/**
 * Installs every design interaction on `document.body`, once.
 *
 * Call it from the site shell. `revealKey` re-scans for freshly mounted
 * `[data-reveal]` nodes — pass the current pathname so each route's content
 * animates in rather than appearing already-revealed or, worse, staying at
 * opacity 0.
 */
export function useDesignInteractions(revealKey: string): void {
  useEffect(() => {
    if (prefersReducedMotion()) return

    const root = document.body
    const disposers = [installSpotlight(root), installMagnets(root), installParallax(root)]
    const reveal = installReveal(root)
    revealScan = reveal.scan
    reveal.scan()

    return () => {
      revealScan = undefined
      reveal.dispose()
      disposers.forEach((dispose) => dispose())
    }
  }, [])

  // A separate effect so a route change re-scans without tearing down the
  // listeners — remounting them would drop every element's "already revealed"
  // marker and replay the whole page.
  useEffect(() => {
    revealScan?.()
  }, [revealKey])
}

/*
 * Module-level rather than a ref: the scan callback is created by the install
 * effect and consumed by the route effect, which must not re-run when the
 * installer does. One shell mounts at a time, so a single slot is sufficient.
 */
let revealScan: (() => void) | undefined
