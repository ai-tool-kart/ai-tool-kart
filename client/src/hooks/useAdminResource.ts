import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ApiRequestError } from '@/services/http'

/*
 * One admin GET, with the states every admin screen renders.
 *
 *   loading    first load (a reload keeps showing the previous data)
 *   ready      `data` is the server's answer
 *   not-found  404 — unknown, malformed and inaccessible ids all look alike
 *   forbidden  403 — signed in, but the role no longer allows it
 *   error      anything else; `message` is safe to show
 *
 * A 401 means the session ended (expired, revoked by a role change, signed
 * out elsewhere). The hook re-reads /auth/me, which flips the auth state to
 * anonymous, and RequireAuth then sends the browser to /login with a return
 * path. Nothing here decides access: the server already did.
 */

export type ResourceState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'not-found' }
  | { status: 'forbidden'; message: string }
  | { status: 'error'; message: string }

export function describeError(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback
}

export function useAdminResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): { state: ResourceState<T>; reload: () => void; setData: (data: T) => void } {
  const { refresh } = useAuth()
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  // `deps` are the caller's primitives (ids, filters, page). One string
  // stands for them, so the effects below have ordinary dependency lists.
  const depsKey = JSON.stringify(deps)

  // A different record or query: never show the previous one under it.
  useEffect(() => {
    setState({ status: 'loading' })
  }, [depsKey])

  useEffect(() => {
    const controller = new AbortController()
    loadRef.current(controller.signal).then(
      (data) => setState({ status: 'ready', data }),
      (error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
        if (error instanceof ApiRequestError) {
          if (error.status === 401) return void refresh()
          if (error.status === 404) return setState({ status: 'not-found' })
          if (error.status === 403) return setState({ status: 'forbidden', message: error.message })
        }
        setState({ status: 'error', message: describeError(error, 'Could not load this page.') })
      },
    )
    return () => controller.abort()
  }, [depsKey, version, refresh])

  const reload = useCallback(() => setVersion((value) => value + 1), [])
  const setData = useCallback((data: T) => setState({ status: 'ready', data }), [])
  return { state, reload, setData }
}

/**
 * For actions (POST/PATCH/PUT/DELETE): a 401 re-reads the session the same
 * way, and the caller still gets the error to show.
 */
export function useSessionAwareAction() {
  const { refresh } = useAuth()
  return useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action()
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) void refresh()
        throw error
      }
    },
    [refresh],
  )
}
