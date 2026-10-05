import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AuthProvider from '@/components/auth/AuthProvider'
import AccountSubmissionsPage from '@/pages/AccountSubmissionsPage'
import SubmissionStatusPage from '@/pages/SubmissionStatusPage'
import { apiError, json, stubFetch, type Route as StubRoute } from '@/test/fetchStub'
import { ADA, ownerSubmission } from '@/test/fixtures'

function LoginProbe() {
  const location = useLocation()
  return <p>login page {location.search}</p>
}

function renderAt(path: string, routes: Record<string, StubRoute>) {
  const stub = stubFetch(routes)
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route path="/account/submissions" element={<AccountSubmissionsPage />} />
          <Route path="/account/submissions/:id" element={<SubmissionStatusPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return stub
}

const signedIn: Record<string, StubRoute> = { 'GET /auth/me': () => json(200, { user: ADA }) }

describe('My submissions', () => {
  it('lists the signed-in user’s submissions with status, linking to each', async () => {
    const { calls } = renderAt('/account/submissions', {
      ...signedIn,
      'GET /me/submissions': () =>
        json(200, {
          items: [
            ownerSubmission({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Second Tool', status: 'UNDER_REVIEW' }),
            ownerSubmission({ name: 'First Tool' }),
          ],
        }),
    })
    expect(await screen.findByText('Second Tool')).toBeTruthy()
    expect(screen.getByText('In review')).toBeTruthy()
    const link = screen.getByRole('link', { name: /First Tool/ })
    expect(link.getAttribute('href')).toBe('/account/submissions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    // The list request names no user: the server scopes it by session.
    const listCall = calls.find((c) => c.path === '/me/submissions')
    expect(listCall?.body).toBeUndefined()
  })

  it('shows an empty state with a way to submit', async () => {
    renderAt('/account/submissions', { ...signedIn, 'GET /me/submissions': () => json(200, { items: [] }) })
    expect(await screen.findByText(/haven’t submitted a tool yet/)).toBeTruthy()
  })

  it('sends a signed-out visitor to /login with a return path', async () => {
    renderAt('/account/submissions', { 'GET /auth/me': () => apiError(401, 'UNAUTHENTICATED', 'x') })
    expect(await screen.findByText(/login page \?next=%2Faccount%2Fsubmissions/)).toBeTruthy()
  })

  it('says accounts are unavailable when the server has none', async () => {
    renderAt('/account/submissions', { 'GET /auth/me': () => apiError(503, 'AUTH_UNAVAILABLE', 'x') })
    expect(await screen.findByText('Accounts are unavailable')).toBeTruthy()
  })
})

describe('Submission status page', () => {
  it('loads straight from the URL (a refresh) and shows the status', async () => {
    renderAt('/account/submissions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
      ...signedIn,
      'GET /me/submissions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': () =>
        json(200, { submission: ownerSubmission({ status: 'CHANGES_REQUESTED', ownerMessage: 'Please add pricing.' }) }),
    })
    expect(await screen.findByText('Changes requested')).toBeTruthy()
    expect(screen.getByText('Please add pricing.')).toBeTruthy()
    expect(screen.getByText('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBeTruthy()
  })

  it('shows the same "not found" for someone else’s, an unknown or a malformed id (server 404)', async () => {
    renderAt('/account/submissions/not-mine', {
      ...signedIn,
      'GET /me/submissions/not-mine': () => apiError(404, 'NOT_FOUND', 'No submission found with that id.'),
    })
    expect(await screen.findByText('Submission not found')).toBeTruthy()
  })
})
