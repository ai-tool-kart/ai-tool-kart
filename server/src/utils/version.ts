/*
 * The server's version string, read from package.json.
 *
 * Resolved by walking up from this module rather than by a fixed relative path,
 * because the same source runs from two layouts: `node src/index.ts` (this file
 * at src/utils/) and the compiled output (dist/src/utils/). One path cannot be
 * correct for both, and a version that silently reads "0.0.0" in production is
 * worse than a few lines of walking.
 *
 * Never throws. A server that cannot report its own version should still boot.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const UNKNOWN = '0.0.0-unknown'
const MAX_DEPTH = 6

function resolveVersion(): string {
  let dir: string
  try {
    dir = dirname(fileURLToPath(import.meta.url))
  } catch {
    return UNKNOWN
  }

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(candidate, 'utf8'))
        if (parsed && typeof parsed === 'object' && 'version' in parsed) {
          const version = (parsed as { version: unknown }).version
          if (typeof version === 'string' && version.length > 0) return version
        }
      } catch {
        return UNKNOWN
      }
      return UNKNOWN
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return UNKNOWN
}

export const SERVER_VERSION: string = resolveVersion()
