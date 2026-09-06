import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from '@/components/assistant/icons'

/*
 * One of the two pickers in "Build Your AI Setup".
 *
 * Source: AI Tool Kart Site.dc.html, the `[data-setup]` blocks. Three states,
 * exactly as the design has them:
 *
 *   choosing  a 52px field showing the current value, or the prompt
 *   open      a 238px-tall menu of options, each with a tick when selected,
 *             ending in "Other / type manually…"
 *   typing    the field becomes a text input with a "List" escape back
 *
 * The free-text state is not a nicety: the option lists come from the
 * catalogue's taxonomy, and someone whose role is not in it must still be able
 * to say what they do. It is also the fallback when the taxonomy request fails —
 * see hooks/useTaxonomy.ts for why there is no bundled copy of the list.
 */

const FIELD =
  'flex h-[52px] items-center gap-[10px] rounded-[15px] px-[14px] transition-[border-color,background-color,box-shadow] duration-300'

interface SetupPickerProps {
  /** Visible when nothing is chosen, e.g. "I am a". */
  placeholder: string
  /** Placeholder inside the free-text input, e.g. "Type your role…". */
  typePlaceholder: string
  /** Accessible name for the field. */
  label: string
  icon: ReactNode
  options: string[]
  /** The chosen or typed value. Empty string means nothing chosen. */
  value: string
  onChange: (value: string) => void
  /** Enter inside the field submits the whole card, as in the design. */
  onSubmit: () => void
  /** Rendered in place of the options when the list could not be loaded. */
  emptyHint: string
}

export default function SetupPicker({
  placeholder,
  typePlaceholder,
  label,
  icon,
  options,
  value,
  onChange,
  onSubmit,
  emptyHint,
}: SetupPickerProps) {
  const [open, setOpen] = useState(false)
  const [typing, setTyping] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /*
   * The design closes an open menu on any click outside a [data-setup] block.
   *
   * `rootRef` MUST stay attached to that block. Unattached, `current` is null,
   * the optional chain yields undefined, and every pointerdown — including the
   * one landing on an option — reads as "outside" and closes the menu, which
   * unmounts the option before its click can fire. The picker then looks like it
   * works and silently selects nothing.
   */
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (typing) inputRef.current?.focus()
  }, [typing])

  if (typing) {
    return (
      <div ref={rootRef} data-setup="1" className="relative z-[2] min-w-[min(100%,210px)] flex-[1_1_236px]">
        <div className="flex h-[52px] items-center gap-[9px] rounded-[15px] border border-[rgba(178,150,255,0.4)] bg-[rgba(26,21,48,0.7)] pr-2 pl-[14px] shadow-[0_0_0_3px_rgba(124,90,246,0.1)]">
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSubmit()
            }}
            aria-label={label}
            placeholder={typePlaceholder}
            className="min-w-0 flex-auto border-0 bg-transparent text-[14.5px] tracking-[-0.012em] text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setTyping(false)
              setOpen(true)
            }}
            className="flex-none cursor-pointer rounded-[9px] px-[9px] py-[6px] text-[11.5px] font-semibold text-muted-dim transition-[color,background-color] duration-250 hover:bg-white/[0.06] hover:text-[#E4DFF0]"
          >
            List
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} data-setup="1" className="relative z-[2] min-w-[min(100%,210px)] flex-[1_1_236px]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className={`${FIELD} w-full cursor-pointer border text-left hover:border-[rgba(178,150,255,0.42)] ${
          open
            ? 'border-[rgba(178,150,255,0.44)] bg-[rgba(26,21,48,0.74)] shadow-[0_0_0_3px_rgba(124,90,246,0.1)]'
            : 'border-white/[0.1] bg-white/[0.032]'
        }`}
      >
        <span className="flex h-[22px] w-[22px] flex-none items-center justify-center text-[#A793E0]">
          {icon}
        </span>
        <span
          className={`min-w-0 flex-auto truncate text-[14.5px] font-medium tracking-[-0.012em] ${
            value ? 'text-ink' : 'text-muted-dim'
          }`}
        >
          {value || placeholder}
        </span>
        <ChevronDownIcon
          className={`h-[14px] w-[14px] flex-none text-[#7E88AA] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-40 flex max-h-[238px] flex-col gap-px overflow-y-auto overscroll-contain rounded-field border border-[rgba(178,150,255,0.24)] bg-[linear-gradient(180deg,rgba(21,17,38,0.97),rgba(11,9,22,0.98))] p-[6px] shadow-[inset_0_1px_0_rgba(232,222,255,0.16),0_26px_52px_-26px_rgba(0,0,0,0.95)] backdrop-blur-[20px] [animation:akRise_.26s_cubic-bezier(.16,.84,.44,1)_both] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {options.length === 0 && (
            <p className="px-[11px] py-[9px] text-[12.5px] leading-[1.45] text-subtle">
              {emptyHint}
            </p>
          )}
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
              className="flex cursor-pointer items-center gap-[9px] rounded-chip px-[11px] py-[9px] text-left text-[13.5px] font-medium tracking-[-0.008em] text-[#C6BFDA] transition-[color,background-color] duration-200 hover:bg-[rgba(124,90,246,0.16)] hover:text-white"
            >
              <span className="min-w-0 flex-auto truncate">{option}</span>
              {option === value && (
                <span aria-hidden="true" className="flex-none text-[12px] text-accent">
                  ✓
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setTyping(true)
            }}
            className="flex cursor-pointer items-center rounded-chip px-[11px] py-[9px] text-left text-[13.5px] font-medium tracking-[-0.008em] text-[#C6BFDA] transition-[color,background-color] duration-200 hover:bg-[rgba(124,90,246,0.16)] hover:text-white"
          >
            Other / type manually…
          </button>
        </div>
      )}
    </div>
  )
}
