import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAssistant, type AssistantSession } from '@/hooks/useAssistant'

/*
 * The homepage's single assistant conversation, and the stage it is drawn in.
 *
 * ── Why this moved out of Hero ───────────────────────────────────────────────
 *
 * The session used to be created inside the hero, because the hero held the
 * three surfaces onto it: the search box, the chat composer and "Let's Build".
 * The setup cards further down the page are a fourth, and they must join the
 * SAME thread — a plan opened from "Research → Draft → Polish" has to be
 * refinable by the next message typed into the chat, and a reader who opens two
 * setups should get one conversation that heard both, not two conversations.
 *
 * A second `useAssistant()` in the setup section would have produced exactly
 * that split, plus a second server-side context accumulating in parallel. So the
 * one session is owned here, one level above both, and handed down. Nothing
 * about the hero's behaviour changed; only where the hook is called.
 *
 * The scroll target lives here too, because it is the same thing: a turn sent
 * from anywhere on the page has to bring the panel that answers it into view.
 *
 * ── Turns arriving from another page ─────────────────────────────────────────
 *
 * /workflows has setup cards but no assistant, so "View Setup" there navigates
 * here carrying the composed sentence in router state. This hook is where that
 * is picked up, because it already owns both halves of what answering it needs:
 * the session and the scroll.
 *
 * Two things make that safe, and both were bugs before they were guards:
 *
 *   SENT ONCE      the effect is keyed to `location.key`, which is unique per
 *                  history entry, and the key is recorded SYNCHRONOUSLY before
 *                  the turn goes out. Clearing the router state is not enough
 *                  on its own — StrictMode runs the effect twice before the
 *                  clear has committed, and the setup was asked for twice, two
 *                  identical bubbles in the transcript.
 *
 *   SCROLLED LAST  the reveal waits a frame. ScrollToTop lives in PageShell and
 *                  sends a plain route change to the top of the page; child
 *                  effects run before parent ones, so revealing immediately
 *                  meant scrolling to the stage and then being yanked straight
 *                  back to the hero.
 *
 * The state is also cleared, with `replace` so no history entry is added, so a
 * Back into this entry does not carry the message a second time.
 */

export interface HomeAssistant {
  session: AssistantSession
  /** Attach to the assistant stage so a turn sent from elsewhere can find it. */
  stageRef: React.RefObject<HTMLDivElement | null>
  /** Brings the stage into view — used after sending from outside it. */
  revealStage: () => void
  /** Sends a turn from anywhere on the page and reveals the answer. */
  ask: (message: string) => void
}

/** What another page puts in router state to open a setup in the assistant. */
interface AssistantHandoff {
  assistantMessage?: unknown
}

export function useHomeAssistant(): HomeAssistant {
  const session = useAssistant()
  const stageRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  /*
   * Only scrolls when the panel is actually off-screen, as the design does:
   * yanking the page on every send would fight a reader who has already
   * scrolled to where they want to be.
   */
  const revealStage = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.top >= 80 && rect.bottom <= window.innerHeight) return
    window.scrollTo({ top: window.scrollY + rect.top - 120, behavior: 'smooth' })
  }, [])

  const ask = useCallback(
    (message: string) => {
      session.send(message)
      revealStage()
    },
    [session, revealStage],
  )

  /*
   * A setup opened from /workflows.
   *
   * Everything this effect reads that is not in its dependency list is read
   * through a ref or is stable for the life of one history entry. `session` and
   * `revealStage` are deliberately excluded: `session.send` changes identity on
   * every turn, and depending on it would re-run the handoff each time the
   * conversation moved.
   */
  const consumedKeyRef = useRef<string | undefined>(undefined)
  const handoff = (location.state as AssistantHandoff | null)?.assistantMessage
  const handoffKey = location.key

  useEffect(() => {
    if (typeof handoff !== 'string' || handoff.trim().length === 0) return
    if (consumedKeyRef.current === handoffKey) return
    // Recorded before anything else, so StrictMode's second pass is a no-op.
    consumedKeyRef.current = handoffKey

    navigate(location.pathname + location.search, { replace: true, state: null })
    session.send(handoff)

    /*
     * A frame later, so PageShell's ScrollToTop has already reset the page and
     * this lands on top of it rather than under it.
     *
     * Deliberately NOT cancelled on cleanup. Cancelling is the obvious thing to
     * write and it silently disables the scroll: StrictMode tears the effect
     * down and re-runs it, the teardown kills the frame, and the re-run returns
     * at the guard above without scheduling another. `revealStage` already
     * no-ops when the stage is not mounted, so a frame that outlives the effect
     * costs one null check.
     */
    requestAnimationFrame(() => revealStage())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, handoffKey])

  return { session, stageRef, revealStage, ask }
}
