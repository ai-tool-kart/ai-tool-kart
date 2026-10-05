import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest, register as registerRequest } from '@/services/auth'
import type { Credentials, Registration } from '@/services/auth'
import { AuthContext, type AuthContextValue } from '@/components/auth/authContext'
import { ApiRequestError } from '@/services/http'
import type { AuthState } from '@/types/auth'

/*
 * Who is signed in — for the UI only.
 *
 * GET /api/auth/me is the source of truth: it runs once on load (so a
 * refresh keeps you signed in, via the HttpOnly cookie the browser owns) and
 * again after every login, registration and logout. The state never holds a
 * token, and nothing here is a security boundary: every protected action is
 * authorized again by the server.
 *
 * A 503 AUTH_UNAVAILABLE (no database on the server) becomes 'unavailable',
 * which the Submit page treats as "submit anonymously, as before". Any other
 * failure to reach /auth/me is treated as signed out.
 */


async function readState(signal?: AbortSignal): Promise<AuthState> {
  try {
    return { status: 'authenticated', user: await fetchCurrentUser(signal) }
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'AUTH_UNAVAILABLE') return { status: 'unavailable' }
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return { status: 'anonymous' }
  }
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const mounted = useRef(true)

  const apply = useCallback((next: AuthState) => {
    if (mounted.current) setState(next)
    return next
  }, [])

  const refresh = useCallback(async () => apply(await readState()), [apply])

  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    readState(controller.signal).then(apply, () => {})
    return () => {
      mounted.current = false
      controller.abort()
    }
  }, [apply])

  const login = useCallback(
    async (credentials: Credentials) => {
      const user = await loginRequest(credentials)
      apply({ status: 'authenticated', user })
      return user
    },
    [apply],
  )

  const register = useCallback(
    async (registration: Registration) => {
      const user = await registerRequest(registration)
      apply({ status: 'authenticated', user })
      return user
    },
    [apply],
  )

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } finally {
      // Whatever the network did, this browser should stop showing a signed-in
      // state; /auth/me then confirms what the server thinks.
      apply({ status: 'anonymous' })
      await refresh()
    }
  }, [apply, refresh])

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, register, logout, refresh }),
    [state, login, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
