import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError } from '@/services/http'
import { sendAssistantMessage } from '@/services/assistant'
import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantPlan,
  AssistantStatus,
  AssistantUnderstood,
  ChatTurn,
  ConversationContext,
  ConversationMessage,
} from '@/types/assistant'

/*
 * One assistant conversation.
 *
 * The hook owns everything stateful about the two-pane stage — the transcript,
 * the plan, the request cycle — and the panels own none of it. That split is why
 * ChatPanel and PlanPanel can be pure presentation and why the "Build Your AI
 * Setup" card can drive the same conversation by calling `send` with a composed
 * sentence instead of carrying a recommendation engine of its own.
 *
 * ── What the client is and is not allowed to decide ──────────────────────────
 *
 * `context` is the server's. It comes back on every response and goes out
 * unchanged on the next request; nothing here reads or edits it. That matters:
 * the fields inside it (`rejectedToolIds`, the accumulated `goal`) are what
 * carries "video editing, but not Descript" from turn one to turn three, and a
 * client that rebuilt them would be quietly running a second refinement layer
 * against a stale copy of the catalogue.
 *
 * The plan is likewise never merged or patched. A turn either returns a plan —
 * in which case it replaces the previous one whole — or it does not, and the
 * previous plan stands. The server decides which; `clarify` and `off_topic`
 * turns legitimately carry no plan, and blanking the panel on a clarifying
 * question would throw away work the user can still see.
 *
 * ── Concurrency ──────────────────────────────────────────────────────────────
 *
 * Turns are sequential by design, but a user can send again while one is in
 * flight (or unmount mid-request). Every send aborts the previous request and
 * bumps a sequence number; a response whose sequence is stale is dropped rather
 * than applied, so a slow first answer can never overwrite a fast second one.
 *
 * ── Why the transcript is mirrored into a ref ────────────────────────────────
 *
 * `send` needs the transcript BEFORE this turn, to post as history. Reading it
 * inside a `setTurns` updater is the obvious way to get it and is wrong: an
 * updater must be pure, and React deliberately invokes it twice under
 * StrictMode. Firing the request from in there sent every turn to the server
 * TWICE in development — one request immediately aborted by its own duplicate,
 * which is invisible in the UI and plainly visible in the server log.
 *
 * So the transcript is mirrored into `turnsRef` as it is appended, and `send`
 * reads the ref. The updater does nothing but return the next array.
 */

/** Turn ids only need to be unique within one mounted conversation. */
let turnCounter = 0
function nextTurnId(prefix: string): string {
  turnCounter += 1
  return `${prefix}-${turnCounter}`
}

export interface AssistantSession {
  /** The rendered transcript, oldest first. Excludes the static greeting. */
  turns: ChatTurn[]
  /** The most recent plan, or undefined until one arrives. */
  plan: AssistantPlan | undefined
  /** The assistant's read of role/goal/constraints, from the last reply. */
  understood: AssistantUnderstood | undefined
  status: AssistantStatus
  /** A reader-facing failure message while `status === 'error'`. */
  error: string | undefined
  /** True when `retry` would be worth offering for the current error. */
  canRetry: boolean
  /** True once anything has been said — drives "Start over" and the idle panel. */
  hasStarted: boolean
  send: (text: string) => void
  retry: () => void
  reset: () => void
}

function messageFor(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof ApiRequestError) {
    return { message: error.message, retryable: error.isRetryable }
  }
  if (error instanceof Error) return { message: error.message, retryable: true }
  return { message: 'The assistant could not be reached. Please try again.', retryable: true }
}

/** The transcript in the shape the server's history schema accepts. */
function toHistory(turns: ChatTurn[]): ConversationMessage[] {
  return turns.map((turn) => ({ role: turn.role, text: turn.text }))
}

export function useAssistant(): AssistantSession {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  /* The transcript as `send` reads it — see the header note on purity. */
  const turnsRef = useRef<ChatTurn[]>([])
  const [plan, setPlan] = useState<AssistantPlan | undefined>(undefined)
  const [understood, setUnderstood] = useState<AssistantUnderstood | undefined>(undefined)
  const [status, setStatus] = useState<AssistantStatus>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [canRetry, setCanRetry] = useState(false)

  /* Server-owned conversation state, carried but never interpreted. */
  const contextRef = useRef<ConversationContext | undefined>(undefined)
  /* The request to replay when the reader presses "Try again". */
  const lastRequestRef = useRef<AssistantChatRequest | undefined>(undefined)
  const controllerRef = useRef<AbortController | undefined>(undefined)
  const sequenceRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
    }
  }, [])

  const run = useCallback((request: AssistantChatRequest) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    sequenceRef.current += 1
    const sequence = sequenceRef.current

    lastRequestRef.current = request
    setStatus('thinking')
    setError(undefined)

    const fresh = () => mountedRef.current && sequenceRef.current === sequence

    sendAssistantMessage(request, controller.signal)
      .then((reply: AssistantChatResponse) => {
        if (!fresh()) return
        contextRef.current = reply.context
        setUnderstood(reply.understood)
        // A turn without a plan (a clarifying question) leaves the panel showing
        // whatever the last planned turn produced. See the header note.
        if (reply.plan) setPlan(reply.plan)
        turnsRef.current = [
          ...turnsRef.current,
          {
            id: nextTurnId('assistant'),
            role: 'assistant',
            text: reply.message,
            ...(reply.followUps.length > 0 ? { followUps: reply.followUps } : {}),
          },
        ]
        setTurns(turnsRef.current)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (!fresh()) return
        const { message, retryable } = messageFor(cause)
        setError(message)
        setCanRetry(retryable)
        setStatus('error')
      })
  }, [])

  const send = useCallback(
    (text: string) => {
      const message = text.trim()
      if (!message) return

      // The history posted with this turn is the transcript BEFORE it — the
      // message itself travels in `message`, and sending it twice would make
      // the model answer a question it can see it has already been asked.
      const history = toHistory(turnsRef.current)

      turnsRef.current = [
        ...turnsRef.current,
        { id: nextTurnId('user'), role: 'user', text: message },
      ]
      setTurns(turnsRef.current)

      run({
        message,
        messages: history,
        ...(contextRef.current ? { context: contextRef.current } : {}),
      })
    },
    [run],
  )

  const retry = useCallback(() => {
    const request = lastRequestRef.current
    if (request) run(request)
  }, [run])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    // Invalidates any response still in flight from the conversation we just
    // discarded, so it cannot land in the new one.
    sequenceRef.current += 1
    contextRef.current = undefined
    lastRequestRef.current = undefined
    turnsRef.current = []
    setTurns([])
    setPlan(undefined)
    setUnderstood(undefined)
    setError(undefined)
    setCanRetry(false)
    setStatus('idle')
  }, [])

  return {
    turns,
    plan,
    understood,
    status,
    error,
    canRetry,
    hasStarted: turns.length > 0,
    send,
    retry,
    reset,
  }
}
