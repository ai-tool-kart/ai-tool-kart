import { useCallback, useEffect, useState } from 'react'
import { getAllPosts, getPostBySlug, WordPressError } from '@/services/wordpress'
import type { BlogPost } from '@/types/blog'

/*
 * Data hooks for the blog views.
 *
 * Fetching lives here rather than in BlogPage/BlogArticlePage so the same
 * loading/error/retry contract is reused by any future consumer — the Home
 * "Latest from AI Tool Kart" section can call `getLatestPosts(3)` through the
 * same service without touching this file.
 */

export interface AsyncResource<T> {
  data: T | undefined
  isLoading: boolean
  /** A reader-facing message, or undefined when the request succeeded. */
  error: string | undefined
  retry: () => void
}

function messageFor(error: unknown): string {
  if (error instanceof WordPressError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong while loading the journal.'
}

/**
 * Runs `load` on mount and on every retry, aborting the in-flight request when
 * the inputs change or the component unmounts.
 */
function useAsyncResource<T>(load: (signal: AbortSignal) => Promise<T>): AsyncResource<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(undefined)

    load(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setData(result)
        setIsLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(messageFor(cause))
        setIsLoading(false)
      })

    return () => controller.abort()
    // `attempt` is the retry trigger; `load` is memoized by each caller below.
  }, [load, attempt])

  return { data, isLoading, error, retry }
}

/** Every published post, newest first. Powers the /blog listing. */
export function useBlogPosts(): AsyncResource<BlogPost[]> {
  const load = useCallback((signal: AbortSignal) => getAllPosts(signal), [])
  return useAsyncResource(load)
}

/**
 * One post by slug. `data === null` means WordPress answered but has no post
 * under that slug — a 404 for the reader, not a failure.
 */
export function useBlogPost(slug: string | undefined): AsyncResource<BlogPost | null> {
  const load = useCallback((signal: AbortSignal) => getPostBySlug(slug ?? '', signal), [slug])
  return useAsyncResource(load)
}
