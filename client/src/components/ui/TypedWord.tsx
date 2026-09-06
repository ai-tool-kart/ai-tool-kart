import { useEffect, useRef, useState } from 'react'

/*
 * The headline word that types and backspaces through a list.
 *
 * Source: AI Tool Kart Site.dc.html, initHeroWord() — hold 2000ms, backspace at
 * 100ms a character, pause 350ms at empty, type at 140ms a character, first tick
 * after 1600ms. The timings are the design's; they are what make it read as
 * deliberate rather than restless.
 *
 * NOTE — the source's own comment claims "the slot reserves the width of the
 * longest word so the line never shifts", but its markup reserves nothing: the
 * word span has no width, so the caret and the full stop after it travel as the
 * word types, and the centred headline shifts with them. The markup is what the
 * design renders, so the markup is what is reproduced here. Setting
 * `reserveWidth` restores the behaviour the comment describes, if the intent
 * turns out to have been the comment rather than the result.
 *
 * Under `prefers-reduced-motion` the cycle never starts and the first word
 * stands, which is what the design's global reduced-motion rule amounts to.
 *
 * State lives in this component rather than in the Hero so a keystroke repaints
 * one span, not the whole hero.
 */

const HOLD_MS = 2000
const DELETE_MS = 100
const EMPTY_PAUSE_MS = 350
const TYPE_MS = 140
const START_DELAY_MS = 1600

interface TypedWordProps {
  words: readonly string[]
  /** Hold the longest word's width so the line cannot shift. Off, as in the source. */
  reserveWidth?: boolean
  className?: string
}

export default function TypedWord({
  words,
  reserveWidth = false,
  className = '',
}: TypedWordProps) {
  const [text, setText] = useState(words[0] ?? '')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (words.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let wordIndex = 0
    let charCount = words[0].length
    let mode: 'hold' | 'delete' | 'type' = 'hold'

    const tick = () => {
      let delay: number

      if (mode === 'hold') {
        mode = 'delete'
        delay = HOLD_MS
      } else if (mode === 'delete') {
        charCount -= 1
        delay = DELETE_MS
        if (charCount <= 0) {
          charCount = 0
          wordIndex = (wordIndex + 1) % words.length
          mode = 'type'
          delay = EMPTY_PAUSE_MS
        }
      } else {
        charCount += 1
        delay = TYPE_MS
        if (charCount >= words[wordIndex].length) {
          charCount = words[wordIndex].length
          mode = 'hold'
        }
      }

      setText(words[wordIndex].slice(0, Math.max(0, charCount)))
      timer.current = window.setTimeout(tick, delay)
    }

    timer.current = window.setTimeout(tick, START_DELAY_MS)
    return () => window.clearTimeout(timer.current)
  }, [words])

  if (!reserveWidth) return <span className={className}>{text}</span>

  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '')

  return (
    <span className={`inline-grid ${className}`}>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {longest}
      </span>
      <span className="col-start-1 row-start-1 text-left">{text}</span>
    </span>
  )
}
