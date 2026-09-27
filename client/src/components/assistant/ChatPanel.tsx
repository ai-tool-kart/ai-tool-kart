import { useEffect, useRef, useState } from 'react'
import AssistantChip from '@/components/assistant/AssistantChip'
import ChatMessage, { AssistantBubble } from '@/components/assistant/ChatMessage'
import { BotIcon, SendIcon } from '@/components/assistant/icons'
import { ASSISTANT_GREETING, ASSISTANT_SUGGESTIONS } from '@/data/assistant'
import { MAX_MESSAGE_CHARS } from '@/services/assistant'
import type { AssistantSession } from '@/hooks/useAssistant'

/*
 * The left half of the assistant stage: header, transcript, composer.
 *
 * Source: AI Tool Kart Site.dc.html, `[data-panel]` inside the hero. Fixed
 * height (474px stacked, 736px beside the plan — see AssistantStage) with the
 * transcript as the only scrolling region, so the header and composer never
 * move while an answer arrives. Stacked, it keeps a fixed height too — a chat
 * that grew the page would push the plan panel off-screen exactly when it
 * filled in.
 *
 * This is the narrow pane: the entry point, not the result. The starter chips
 * wrap rather than scroll sideways, because at this width a horizontal rail
 * hid the third suggestion entirely, and "Start over" sits beside them since
 * the header no longer has room for it next to the status pill.
 *
 * Presentation only. It renders an `AssistantSession` and calls back into it;
 * it never fetches, and it holds no state but the composer's own draft text and
 * focus. That is what lets the "Build Your AI Setup" card drive the very same
 * conversation without this component knowing it exists.
 *
 * ── The error state ──────────────────────────────────────────────────────────
 *
 * The design has none: its assistant was a scripted timeout that could not fail.
 * A real endpoint can be unreachable, can time out, and can answer 422 after
 * three unusable model replies. The failure is rendered as a bubble in the
 * transcript rather than a banner over it, so the question the reader asked
 * stays on screen next to the reason it did not get answered, with a retry that
 * re-sends that same turn.
 */

const SCROLLBARLESS = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

/** Header status word. Mirrors the design's `assistStatus`. */
function statusLabel(session: AssistantSession): string {
  if (session.status === 'thinking') return 'Thinking'
  if (session.status === 'error') return 'Stalled'
  if (session.plan) return 'Plan ready'
  if (session.hasStarted) return 'Building'
  return 'Ready'
}

interface ChatPanelProps {
  session: AssistantSession
  /** Header title. Defaults to the design's own wording. */
  label?: string
}

export default function ChatPanel({ session, label = 'AI Assistant' }: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const busy = session.status === 'thinking'

  /*
   * Follow the conversation as it grows. `scrollTop = scrollHeight` rather than
   * scrollIntoView, which would scroll the PAGE to bring the panel's last child
   * into view and yank the reader away from the hero.
   */
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [session.turns, session.status])

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setDraft('')
    session.send(trimmed)
  }

  return (
    <div
      data-panel="1"
      className="relative flex h-[474px] min-w-0 flex-col overflow-hidden sm:h-[520px] lg:h-[736px] rounded-card-lg border border-[rgba(178,150,255,0.15)] bg-[linear-gradient(180deg,rgba(18,14,32,0.9)_0%,rgba(9,7,18,0.94)_100%)] shadow-[inset_0_1px_0_rgba(232,222,255,0.13),0_22px_46px_-42px_rgba(124,88,244,0.75)]"
    >
      <header className="flex items-start gap-[10px] border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(124,90,246,0.1),rgba(124,90,246,0))] px-4 py-[14px]">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-chip border border-[rgba(178,150,255,0.3)] bg-[linear-gradient(158deg,rgba(167,139,250,0.26),rgba(255,255,255,0.03))] text-[#D8C8FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          <BotIcon className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-[2px]">
          <span className="text-[15px] font-semibold tracking-[-0.016em] text-[#EFEAFB]">
            {label}
          </span>
          <span className="text-[12px] leading-[1.4] text-pretty text-subtle">
            Describe the work — the plan builds itself
          </span>
        </span>

        <span
          className="mt-[3px] ml-auto inline-flex items-center gap-[7px] rounded-pill border border-[rgba(178,150,255,0.24)] bg-[rgba(124,90,246,0.12)] px-[10px] py-[5px] text-[10.5px] font-semibold tracking-[0.1em] whitespace-nowrap text-[#C6B2FF] uppercase"
          role="status"
        >
          <span
            aria-hidden="true"
            className="h-[6px] w-[6px] rounded-full bg-[#B99BFF] shadow-[0_0_10px_2px_rgba(167,139,250,0.85)] [animation:akPulse_3s_ease-in-out_infinite]"
          />
          {statusLabel(session)}
        </span>
      </header>

      <div
        ref={scrollRef}
        data-hero-chat="1"
        className={`flex min-h-0 flex-auto flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-[15px] ${SCROLLBARLESS}`}
      >
        <AssistantBubble>{ASSISTANT_GREETING}</AssistantBubble>

        {session.turns.map((turn) => (
          <ChatMessage key={turn.id} turn={turn} onFollowUp={submit} disabled={busy} />
        ))}

        {busy && (
          <div className="flex items-center gap-[9px] [animation:akFade_.3s_ease_both]">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-tag border border-[rgba(178,150,255,0.28)] bg-[linear-gradient(158deg,rgba(167,139,250,0.24),rgba(255,255,255,0.03))] text-[#D8C8FF]">
              <BotIcon className="h-[13px] w-[13px]" />
            </span>
            <div
              className="flex items-center gap-[5px] rounded-[14px_14px_14px_5px] border border-white/[0.08] bg-white/[0.045] px-[14px] py-3"
              role="status"
              aria-label="The assistant is thinking"
            >
              {[0, 0.16, 0.32].map((delay) => (
                <span
                  key={delay}
                  aria-hidden="true"
                  className="h-[5px] w-[5px] rounded-full bg-[#C4A8FF]"
                  style={{ animation: `akPulse 1.1s ease-in-out ${delay}s infinite` }}
                />
              ))}
            </div>
          </div>
        )}

        {session.status === 'error' && session.error && (
          <div
            role="alert"
            className="flex flex-col gap-[9px] [animation:akRise_.5s_cubic-bezier(.16,.84,.44,1)_both]"
          >
            <div className="flex max-w-[94%] gap-[9px]">
              <span
                aria-hidden="true"
                className="flex h-6 w-6 flex-none items-center justify-center rounded-tag border border-[rgba(255,124,158,0.32)] bg-pink-bg text-[13px] font-bold text-pink"
              >
                !
              </span>
              <div className="rounded-[14px_14px_14px_5px] border border-[rgba(255,124,158,0.26)] bg-pink-bg px-[14px] py-[11px] text-[13.5px] leading-[1.55] tracking-[-0.008em] text-pretty text-[#EBD3DC]">
                {session.error}
              </div>
            </div>
            {session.canRetry && (
              <div className="flex flex-wrap gap-[7px] pl-[33px]">
                <AssistantChip onClick={session.retry}>Try again</AssistantChip>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-none flex-col gap-[10px] border-t border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.022),rgba(255,255,255,0))] px-4 pt-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10.5px] font-semibold tracking-[0.14em] text-[#7E7899] uppercase">
            Try an example
          </span>
          {session.hasStarted && (
            <button
              type="button"
              onClick={session.reset}
              className="cursor-pointer rounded-[4px] text-[11.5px] font-medium whitespace-nowrap text-[#7E7899] transition-colors duration-250 hover:text-[#C9B6FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Start over
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-[7px]">
          {ASSISTANT_SUGGESTIONS.map((suggestion) => (
            <AssistantChip key={suggestion} disabled={busy} onClick={() => submit(suggestion)}>
              {suggestion}
            </AssistantChip>
          ))}
        </div>

        <div className="relative flex items-center gap-[10px] rounded-tile border border-white/[0.1] bg-white/[0.045] py-[7px] pr-[7px] pl-[15px]">
          {focused && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-px rounded-[17px] border border-[rgba(196,168,255,0.5)] shadow-[0_0_0_3px_rgba(124,90,246,0.12),0_0_34px_-12px_rgba(167,139,250,0.85)] [animation:akFade_.4s_ease_both]"
            />
          )}
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit(draft)
            }}
            /* The server rejects a longer message outright; refusing the
               keystroke tells the reader now rather than after a round trip. */
            maxLength={MAX_MESSAGE_CHARS}
            aria-label="Tell the assistant what you want to get done"
            placeholder="Tell me what you want to get done…"
            className="relative min-w-0 flex-auto border-0 bg-transparent py-[9px] text-[14px] tracking-[-0.01em] text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => submit(draft)}
            disabled={busy || draft.trim().length === 0}
            aria-label="Send"
            className="relative flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[12px] border border-white/[0.2] bg-[linear-gradient(180deg,#A98CFF_0%,#7C5AF6_52%,#5F41E4_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_10px_22px_-12px_rgba(116,80,244,0.95)] transition-[transform,box-shadow] duration-250 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_14px_28px_-10px_rgba(116,80,244,1)] active:translate-y-0 active:scale-95 disabled:cursor-default disabled:opacity-45 disabled:hover:translate-y-0"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
