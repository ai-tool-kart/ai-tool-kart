import { useCallback, useRef } from 'react'
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

export function useHomeAssistant(): HomeAssistant {
  const session = useAssistant()
  const stageRef = useRef<HTMLDivElement>(null)

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

  return { session, stageRef, revealStage, ask }
}
