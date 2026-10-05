import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AuthProvider from '@/components/auth/AuthProvider'
import { useAuth } from '@/hooks/useAuth'
import { apiError, json, noContent, stubFetch } from '@/test/fetchStub'
import { ADA } from '@/test/fixtures'


let actions: ReturnType<typeof useAuth> | undefined
function Probe() {
  actions = useAuth()
  const { state } = actions
  return <p data-testid="state">{state.status === 'authenticated' ? `authenticated:${state.user.email}` : state.status}</p>
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

describe('AuthProvider', () => {
  it('starts loading, then trusts /auth/me for an existing session', async () => {
    stubFetch({ 'GET /auth/me': () => json(200, { user: ADA }) })
    renderProvider()
    expect(screen.getByTestId('state').textContent).toBe('loading')
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('authenticated:ada@example.com'))
  })

  it('is anonymous on 401 from /auth/me', async () => {
    stubFetch({ 'GET /auth/me': () => apiError(401, 'UNAUTHENTICATED', 'Log in to continue.') })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anonymous'))
  })

  it('is unavailable on 503 AUTH_UNAVAILABLE (no database on the server)', async () => {
    stubFetch({ 'GET /auth/me': () => apiError(503, 'AUTH_UNAVAILABLE', 'Accounts are not available.') })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('unavailable'))
  })

  it('treats an unreachable server as signed out', async () => {
    stubFetch({ 'GET /auth/me': () => Promise.reject(new TypeError('Failed to fetch')) })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anonymous'))
  })

  it('login and register adopt the user the server returns', async () => {
    const { callsTo } = stubFetch({
      'GET /auth/me': () => apiError(401, 'UNAUTHENTICATED', 'x'),
      'POST /auth/login': () => json(200, { user: ADA }),
      'POST /auth/register': () => json(201, { user: { ...ADA, email: 'new@example.com' } }),
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anonymous'))

    await act(() => actions!.login({ email: 'ada@example.com', password: 'a long password' }))
    expect(screen.getByTestId('state').textContent).toBe('authenticated:ada@example.com')
    expect(callsTo('POST /auth/login')[0]?.body).toEqual({ email: 'ada@example.com', password: 'a long password' })

    await act(() => actions!.register({ email: 'new@example.com', password: 'a long password', name: 'New' }))
    expect(screen.getByTestId('state').textContent).toBe('authenticated:new@example.com')
  })

  it('logout calls the server, then re-reads /auth/me', async () => {
    let signedIn = true
    const { callsTo } = stubFetch({
      'GET /auth/me': () => (signedIn ? json(200, { user: ADA }) : apiError(401, 'UNAUTHENTICATED', 'x')),
      'POST /auth/logout': () => {
        signedIn = false
        return noContent()
      },
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('authenticated:ada@example.com'))
    await act(() => actions!.logout())
    expect(screen.getByTestId('state').textContent).toBe('anonymous')
    expect(callsTo('POST /auth/logout')).toHaveLength(1)
    expect(callsTo('GET /auth/me').length).toBeGreaterThanOrEqual(2)
  })

  it('keeps no token anywhere script-readable', async () => {
    stubFetch({ 'GET /auth/me': () => json(200, { user: ADA }) })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('state').textContent).toContain('authenticated'))
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
  })
})
