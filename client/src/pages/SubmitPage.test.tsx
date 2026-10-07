import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AuthProvider from '@/components/auth/AuthProvider'
import SubmitPage from '@/pages/SubmitPage'
import { apiError, json, stubFetch, type Route as StubRoute } from '@/test/fetchStub'
import { ADA } from '@/test/fixtures'

/*
 * The Submit page's account integration: the sign-in gate, keeping the form
 * intact while it is open, continuing the held submission, and the
 * success → status link. Only the starting form is faked (a ready listing),
 * so each test can press "Launch listing" straight away.
 */

vi.mock('@/types/submit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/types/submit')>()
  return {
    ...actual,
    createEmptySubmission: () => ({
      ...actual.createEmptySubmission(),
      siteUrl: 'https://example-tool.com',
      name: 'Example Tool',
      tagline: 'Does example things.',
      description: 'A tool used by the client tests.',
      category: 'Writing',
      pricingModel: 'Free',
      launchWeekId: '2026-11-16',
    }),
  }
})

const CREATED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const created = () => json(201, { id: CREATED_ID, status: 'SUBMITTED', createdAt: '2026-10-05T10:00:00.000Z' })

/** Keys the server's strict submission schema accepts. Anything else would be a bug. */
const SCHEMA_KEYS = new Set([
  'siteUrl', 'name', 'tagline', 'description', 'category', 'pricingModel', 'price', 'tags',
  'audience', 'alternatives', 'faqs', 'launchStory', 'plan', 'launchWeekId', 'company',
])

function RouteProbe({ name }: { name: string }) {
  const location = useLocation()
  return <p>{`${name} ${location.search}`}</p>
}

function renderSubmit(routes: Record<string, StubRoute>) {
  const stub = stubFetch({ 'GET /taxonomy': () => apiError(503, 'INTERNAL', 'unavailable'), ...routes })
  render(
    <MemoryRouter initialEntries={['/submit']}>
      <AuthProvider>
        <Routes>
          <Route path="/submit" element={<SubmitPage />} />
          <Route path="/account/submissions/:id" element={<p>status page</p>} />
          <Route path="/login" element={<RouteProbe name="login page" />} />
          <Route path="/register" element={<RouteProbe name="register page" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return { ...stub, user: userEvent.setup() }
}

const launch = () => screen.getByRole('button', { name: /launch listing/i })
const nameInput = () => document.querySelector<HTMLInputElement>('[data-field="name"] input')

describe('SubmitPage with accounts', () => {
  it('signed out: Launch opens the gate, sends nothing, and leaves the form intact', async () => {
    const { user, callsTo } = renderSubmit({ 'GET /auth/me': () => apiError(401, 'UNAUTHENTICATED', 'x') })
    await waitFor(() => expect(nameInput()?.value).toBe('Example Tool'))
    await user.clear(nameInput()!)
    await user.type(nameInput()!, 'Edited Name')

    await user.click(launch())
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Create an account to submit/)).toBeTruthy()
    expect(callsTo('POST /submissions')).toHaveLength(0)

    // The form underneath is still mounted with what was typed.
    expect(nameInput()?.value).toBe('Edited Name')
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0)
  })

  it('registering in the gate continues the held submission automatically', async () => {
    let signedIn = false
    const { user, callsTo } = renderSubmit({
      'GET /auth/me': () => (signedIn ? json(200, { user: ADA }) : apiError(401, 'UNAUTHENTICATED', 'x')),
      'POST /auth/register': () => {
        signedIn = true
        return json(201, { user: ADA })
      },
      'POST /submissions': () => created(),
    })
    await waitFor(() => expect(nameInput()?.value).toBe('Example Tool'))
    await user.click(launch())
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^email/i), 'ada@example.com')
    await user.type(within(dialog).getByLabelText(/^password/i), 'a long password')
    await user.type(within(dialog).getByLabelText(/confirm password/i), 'a long password')
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    await screen.findByText("You're on the list")
    const [submission] = callsTo('POST /submissions')
    expect(submission).toBeDefined()
    expect((submission!.body as Record<string, unknown>).name).toBe('Example Tool')
    // The submitter is never sent — no userId, ownerId or role in the body.
    for (const key of Object.keys(submission!.body as object)) expect(SCHEMA_KEYS.has(key)).toBe(true)

    const status = screen.getByRole('link', { name: 'View status' })
    expect(status.getAttribute('href')).toBe(`/account/submissions/${CREATED_ID}`)
    await user.click(status)
    expect(await screen.findByText('status page')).toBeTruthy()
  })

  it('signed in: submits directly and says who is submitting', async () => {
    const { user, callsTo } = renderSubmit({
      'GET /auth/me': () => json(200, { user: ADA }),
      'POST /submissions': () => created(),
    })
    expect(await screen.findByText('ada@example.com')).toBeTruthy()
    await user.click(launch())
    await screen.findByText("You're on the list")
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(callsTo('POST /submissions')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'View status' })).toBeTruthy()
    // Truthful copy: no email is sent yet.
    expect(screen.getByText(/update its status here/)).toBeTruthy()
    expect(screen.queryByText(/email/i)).toBeNull()
  })

  it('no accounts on the server (503): submits anonymously as before, with no status link', async () => {
    const { user, callsTo } = renderSubmit({
      'GET /auth/me': () => apiError(503, 'AUTH_UNAVAILABLE', 'Accounts are not available.'),
      'POST /submissions': () => json(201, { id: 'json-id', status: 'pending', createdAt: '2026-10-05T10:00:00.000Z' }),
    })
    await waitFor(() => expect(nameInput()?.value).toBe('Example Tool'))
    await waitFor(() => expect(callsTo('GET /auth/me')).toHaveLength(1))
    await user.click(launch())
    await screen.findByText("You're on the list")
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('link', { name: 'View status' })).toBeNull()
    expect(screen.getByText(/review your submission before it goes live/)).toBeTruthy()
    expect(screen.queryByText(/email/i)).toBeNull()
  })

  it('a 401 from the submission (expired session) reopens the gate with the form intact', async () => {
    let meCalls = 0
    const { user } = renderSubmit({
      'GET /auth/me': () => (++meCalls === 1 ? json(200, { user: ADA }) : apiError(401, 'UNAUTHENTICATED', 'x')),
      'POST /submissions': () => apiError(401, 'UNAUTHENTICATED', 'Log in to continue.'),
    })
    expect(await screen.findByText('ada@example.com')).toBeTruthy()
    await user.click(launch())
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/sign in again/i)).toBeTruthy()
    expect(nameInput()?.value).toBe('Example Tool')
  })

  it('"Not now" closes the gate and returns to the listing', async () => {
    const { user } = renderSubmit({ 'GET /auth/me': () => apiError(401, 'UNAUTHENTICATED', 'x') })
    await waitFor(() => expect(nameInput()?.value).toBe('Example Tool'))
    await user.click(launch())
    await user.click(await screen.findByRole('button', { name: /not now/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(nameInput()?.value).toBe('Example Tool')
  })

  it('a click while the session is still loading waits for /auth/me, then proceeds', async () => {
    let answer: (response: Response) => void = () => {}
    const { user, callsTo } = renderSubmit({
      'GET /auth/me': () => new Promise<Response>((resolve) => (answer = resolve)),
      'POST /submissions': () => created(),
    })
    await waitFor(() => expect(nameInput()?.value).toBe('Example Tool'))
    await user.click(launch())
    expect(callsTo('POST /submissions')).toHaveLength(0)
    answer(json(200, { user: ADA }))
    await screen.findByText("You're on the list")
    expect(callsTo('POST /submissions')).toHaveLength(1)
  })
})

describe('SubmitPage header account actions', () => {
  const signedOut = { 'GET /auth/me': () => apiError(401, 'UNAUTHENTICATED', 'x') }
  const accountNav = () => screen.findByRole('navigation', { name: 'Account' })

  it('shows Log in and Create account to a signed-out visitor', async () => {
    renderSubmit(signedOut)
    const nav = await accountNav()
    expect(within(nav).getByRole('link', { name: 'Log in' })).toBeTruthy()
    expect(within(nav).getByRole('link', { name: 'Create account' })).toBeTruthy()
  })

  it('Log in goes to the existing login page and comes back to /submit', async () => {
    const { user } = renderSubmit(signedOut)
    await user.click(within(await accountNav()).getByRole('link', { name: 'Log in' }))
    expect(await screen.findByText('login page ?next=%2Fsubmit')).toBeTruthy()
  })

  it('Create account goes to the existing registration page and comes back to /submit', async () => {
    const { user } = renderSubmit(signedOut)
    await user.click(within(await accountNav()).getByRole('link', { name: 'Create account' }))
    expect(await screen.findByText('register page ?next=%2Fsubmit')).toBeTruthy()
  })

  it('with input on the page, the actions open the inline gate instead of leaving — nothing typed is lost', async () => {
    const { user, callsTo } = renderSubmit(signedOut)
    await waitFor(() => expect(nameInput()?.value).toBe('Example Tool'))
    await user.type(nameInput()!, ' Pro')

    const nav = await accountNav()
    expect(within(nav).queryByRole('link')).toBeNull()
    await user.click(within(nav).getByRole('button', { name: 'Log in' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Sign in to submit')).toBeTruthy()
    expect(within(dialog).getByText(/Nothing is submitted until you press Launch/)).toBeTruthy()
    expect(nameInput()?.value).toBe('Example Tool Pro')

    await user.click(within(dialog).getByRole('button', { name: /not now/i }))
    await user.click(within(nav).getByRole('button', { name: 'Create account' }))
    expect(within(await screen.findByRole('dialog')).getByText('Create an account to submit')).toBeTruthy()
    expect(callsTo('POST /submissions')).toHaveLength(0)
  })

  it('signing in from the header gate does not submit the listing', async () => {
    let signedIn = false
    const { user, callsTo } = renderSubmit({
      'GET /auth/me': () => (signedIn ? json(200, { user: ADA }) : apiError(401, 'UNAUTHENTICATED', 'x')),
      'POST /auth/login': () => {
        signedIn = true
        return json(200, { user: ADA })
      },
    })
    await waitFor(() => expect(nameInput()?.value).toBe('Example Tool'))
    await user.type(nameInput()!, ' Pro')
    await user.click(within(await accountNav()).getByRole('button', { name: 'Log in' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/email/i), 'ada@example.com')
    await user.type(within(dialog).getByLabelText(/password/i), 'correct horse battery staple')
    await user.click(within(dialog).getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText(/You’re signed in/)).toBeTruthy()
    expect(callsTo('POST /submissions')).toHaveLength(0)
    expect(nameInput()?.value).toBe('Example Tool Pro')
  })

  it('a signed-in member sees who they are, not Log in / Create account', async () => {
    renderSubmit({ 'GET /auth/me': () => json(200, { user: ADA }) })
    expect(await screen.findByText(/You’re signed in/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'My submissions' }).getAttribute('href')).toBe('/account/submissions')
    expect(screen.queryByRole('navigation', { name: 'Account' })).toBeNull()
    expect(screen.queryByText('Log in')).toBeNull()
    expect(screen.queryByText('Create account')).toBeNull()
  })

  it('shows no account actions while loading or when the server has no accounts', async () => {
    const { callsTo } = renderSubmit({ 'GET /auth/me': () => apiError(503, 'AUTH_UNAVAILABLE', 'x') })
    await waitFor(() => expect(callsTo('GET /auth/me')).toHaveLength(1))
    await waitFor(() => expect(nameInput()?.value).toBe('Example Tool'))
    expect(screen.queryByRole('navigation', { name: 'Account' })).toBeNull()
    expect(screen.queryByText(/You’re signed in/)).toBeNull()
  })

  it('adds no request of its own: /auth/me is read once', async () => {
    const { callsTo } = renderSubmit(signedOut)
    await accountNav()
    expect(callsTo('GET /auth/me')).toHaveLength(1)
  })
})
