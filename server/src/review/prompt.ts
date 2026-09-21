/*
 * A `question()`-shaped async prompt, built on `readline`'s `line` event
 * rather than `Interface.question()`.
 *
 * `question()` (both the callback and `readline/promises` forms) turns out
 * to be unreliable here: over a piped, non-TTY stdin, the FIRST call
 * resolves fine but the second either throws ERR_USE_AFTER_CLOSE or hangs
 * forever, even though the underlying stream still has buffered lines
 * waiting to be read — verified directly against Node 22.13.1 on this
 * platform. Listening on `line` and queuing answers ahead of the question
 * that asks for them sidesteps whatever internal state `question()` gets
 * wrong, and works identically for a live terminal, where every question is
 * simply answered as soon as it's asked.
 */

import type { Interface } from 'node:readline'

export type Ask = (prompt: string) => Promise<string>

/** Wraps `rl` so `ask(prompt)` returns the next line typed (or piped) after `prompt` is printed. */
export function createAsker(rl: Interface): Ask {
  const queued: string[] = []
  let waiting: ((line: string) => void) | undefined

  rl.on('line', (line: string) => {
    if (waiting) {
      const resolve = waiting
      waiting = undefined
      resolve(line)
    } else {
      queued.push(line)
    }
  })

  return function ask(prompt: string): Promise<string> {
    process.stdout.write(prompt)
    const next = queued.shift()
    if (next !== undefined) return Promise.resolve(next)
    return new Promise((resolve) => {
      waiting = resolve
    })
  }
}
