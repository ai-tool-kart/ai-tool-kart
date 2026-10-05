import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AuthForm, { type AuthMode } from '@/components/auth/AuthForm'
import AuthProvider from '@/components/auth/AuthProvider'
import { apiError, json, stubFetch, type Route } from '@/test/fetchStub'
import { ADA } from '@/test/fixtures'

function setup(mode: AuthMode, routes: Record<string, Route>) {
  const stub = stubFetch({ 'GET /auth/me': () => apiError(401, 'UNAUTHENTICATED', 'x'), ...routes })
  const onSuccess = vi.fn()
  render(
    <AuthProvider>
      <AuthForm mode={mode} onModeChange={() => {}} onSuccess={onSuccess} />
    </AuthProvider>,
  )
  return { ...stub, onSuccess, user: userEvent.setup() }
}

describe('AuthForm', () => {
  it('signs in and reports the user', async () => {
    const { user, onSuccess, callsTo } = setup('login', { 'POST /auth/login': () => json(200, { user: ADA }) })
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/password/i), 'a long password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(ADA))
    // Only the credentials: never a user id or role.
    expect(Object.keys(callsTo('POST /auth/login')[0]?.body as object).sort()).toEqual(['email', 'password'])
  })

  it('shows the server’s vague message on 401', async () => {
    const { user, onSuccess } = setup('login', {
      'POST /auth/login': () => apiError(401, 'UNAUTHENTICATED', 'Email or password is incorrect.'),
    })
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows the retry time on 429', async () => {
    const { user } = setup('login', {
      'POST /auth/login': () => apiError(429, 'RATE_LIMITED', 'Too many.', {}, { 'Retry-After': '600' }),
    })
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/password/i), 'a long password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Try again in about 10 minutes/)).toBeTruthy()
  })

  it('explains 503 AUTH_UNAVAILABLE', async () => {
    const { user } = setup('login', {
      'POST /auth/login': () => apiError(503, 'AUTH_UNAVAILABLE', 'Accounts are not available.'),
    })
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/password/i), 'a long password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Accounts are temporarily unavailable/)).toBeTruthy()
  })

  it('registers with name, email and password — and only those', async () => {
    const { user, onSuccess, callsTo } = setup('register', { 'POST /auth/register': () => json(201, { user: ADA }) })
    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText(/^email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'a long password')
    await user.type(screen.getByLabelText(/confirm password/i), 'a long password')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(callsTo('POST /auth/register')[0]?.body).toEqual({ email: 'ada@example.com', password: 'a long password', name: 'Ada' })
  })

  it('catches a mismatched confirmation without calling the server', async () => {
    const { user, callsTo } = setup('register', {})
    await user.type(screen.getByLabelText(/^email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'a long password')
    await user.type(screen.getByLabelText(/confirm password/i), 'a different one')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('The passwords don’t match.')).toBeTruthy()
    expect(callsTo('POST /auth/register')).toHaveLength(0)
  })

  it('puts 409 EMAIL_TAKEN on the email field', async () => {
    const message = 'An account with this email already exists. Log in instead.'
    const { user } = setup('register', {
      'POST /auth/register': () => apiError(409, 'EMAIL_TAKEN', message, { fields: { email: message } }),
    })
    await user.type(screen.getByLabelText(/^email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'a long password')
    await user.type(screen.getByLabelText(/confirm password/i), 'a long password')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    const error = await screen.findByText(message)
    expect(error.id).toBe('email-error')
  })
})
