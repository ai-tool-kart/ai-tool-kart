import type { ReactNode } from 'react'
import AssistantChip from '@/components/assistant/AssistantChip'
import { BotIcon } from '@/components/assistant/icons'
import type { ChatTurn } from '@/types/assistant'

/*
 * One bubble in the assistant transcript.
 *
 * Source: AI Tool Kart Site.dc.html, the `[data-hero-chat]` list. The design
 * gives the two roles different geometry, not just different colour — the
 * assistant's bubble notches its bottom-LEFT corner (14px 14px 14px 5px) and
 * sits behind a 24px avatar; the user's notches its bottom-RIGHT and is right
 * aligned with no avatar. Both rise in over 500ms.
 *
 * Follow-up chips belong to the assistant bubble they arrived with, which is why
 * they render here rather than in the panel: the design indents them 33px so
 * they line up with the bubble's text edge rather than the avatar's.
 */

/** Shared by a real bubble and the static greeting above the transcript. */
export function AssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-[94%] gap-[9px]">
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-tag border border-[rgba(178,150,255,0.28)] bg-[linear-gradient(158deg,rgba(167,139,250,0.24),rgba(255,255,255,0.03))] text-[#D8C8FF]">
        <BotIcon className="h-[13px] w-[13px]" />
      </span>
      <div className="rounded-[14px_14px_14px_5px] border border-white/[0.08] bg-white/[0.045] px-[14px] py-[11px] text-[13.5px] leading-[1.55] tracking-[-0.008em] text-pretty text-[#D6D0E8]">
        {children}
      </div>
    </div>
  )
}

interface ChatMessageProps {
  turn: ChatTurn
  /** Sends the chip's label as the next message. */
  onFollowUp: (text: string) => void
  /** Chips on older turns stay visible but inert while a request is in flight. */
  disabled: boolean
}

export default function ChatMessage({ turn, onFollowUp, disabled }: ChatMessageProps) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end [animation:akRise_.5s_cubic-bezier(.16,.84,.44,1)_both]">
        <div className="max-w-[88%] rounded-[14px_14px_5px_14px] border border-[rgba(178,150,255,0.26)] bg-[linear-gradient(180deg,rgba(108,68,220,0.34),rgba(70,40,160,0.2))] px-[14px] py-[11px] text-[13.5px] leading-[1.5] tracking-[-0.008em] text-pretty text-[#EDE7FF]">
          {turn.text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[9px] [animation:akRise_.5s_cubic-bezier(.16,.84,.44,1)_both]">
      <AssistantBubble>{turn.text}</AssistantBubble>
      {turn.followUps && turn.followUps.length > 0 && (
        <div className="flex flex-wrap gap-[7px] pl-[33px]">
          {turn.followUps.map((label) => (
            <AssistantChip key={label} onClick={() => onFollowUp(label)} disabled={disabled}>
              {label}
            </AssistantChip>
          ))}
        </div>
      )}
    </div>
  )
}
