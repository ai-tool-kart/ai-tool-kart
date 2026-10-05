import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Unmount everything rendered by a test and drop any stubbed fetch.
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
