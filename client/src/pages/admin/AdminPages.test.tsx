import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AdminShell from '@/components/admin/AdminShell'
import AuthProvider from '@/components/auth/AuthProvider'
import AccountSubmissionsPage from '@/pages/AccountSubmissionsPage'
import AdminAuditPage from '@/pages/admin/AdminAuditPage'
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage'
import AdminSubmissionReviewPage from '@/pages/admin/AdminSubmissionReviewPage'
import AdminSubmissionsPage from '@/pages/admin/AdminSubmissionsPage'
import AdminToolPage from '@/pages/admin/AdminToolPage'
import AdminToolsPage from '@/pages/admin/AdminToolsPage'
import AdminUserPage from '@/pages/admin/AdminUserPage'
import { apiError, json, stubFetch, type Route as StubRoute } from '@/test/fetchStub'
import {
  adminStats,
  auditEntry,
  GRACE_ADMIN,
  ROOT_SUPER,
  SUBMISSION_ID,
  submissionDetail,
  toolDetail,
  userDetail,
  VOCABULARY,
} from '@/test/adminFixtures'
import { ADA } from '@/test/fixtures'
import type { PublicUser } from '@/types/auth'

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
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="submissions" element={<AdminSubmissionsPage />} />
            <Route path="submissions/:submissionId" element={<AdminSubmissionReviewPage />} />
            <Route path="tools" element={<AdminToolsPage />} />
            <Route path="tools/:toolId" element={<AdminToolPage />} />
            <Route path="users/:userId" element={<AdminUserPage />} />
            <Route path="audit" element={<AdminAuditPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return stub
}

const as = (user: PublicUser): Record<string, StubRoute> => ({ 'GET /auth/me': () => json(200, { user }) })
const adminCalls = (calls: { path: string }[]) => calls.filter((call) => call.path.startsWith('/admin'))

describe('admin access', () => {
  it('shows the Admin entry on the account page to admins only', async () => {
    renderAt('/account/submissions', { ...as(GRACE_ADMIN), 'GET /me/submissions': () => json(200, { items: [] }) })
    const link = await screen.findByRole('link', { name: 'Admin' })
    expect(link.getAttribute('href')).toBe('/admin')
  })

  it('hides the Admin entry from a regular user', async () => {
    renderAt('/account/submissions', { ...as(ADA), 'GET /me/submissions': () => json(200, { items: [] }) })
    await screen.findByText(/haven’t submitted a tool yet/)
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull()
  })

  it('tells a non-admin the area is admins-only and never calls the admin API', async () => {
    const { calls } = renderAt('/admin', as({ ...ADA, role: 'TOOL_OWNER' }))
    expect(await screen.findByText('Admins only')).toBeTruthy()
    expect(adminCalls(calls)).toEqual([])
  })

  it('sends a signed-out visitor to /login with a return path', async () => {
    renderAt('/admin/submissions?status=SUBMITTED', { 'GET /auth/me': () => apiError(401, 'UNAUTHENTICATED', 'x') })
    expect(await screen.findByText(/login page \?next=%2Fadmin%2Fsubmissions%3Fstatus%3DSUBMITTED/)).toBeTruthy()
  })

  it('treats a 401 from the admin API as an expired session and returns to /login', async () => {
    let signedIn = true
    renderAt('/admin', {
      'GET /auth/me': () => (signedIn ? json(200, { user: GRACE_ADMIN }) : apiError(401, 'UNAUTHENTICATED', 'Log in to continue.')),
      'GET /admin/stats': () => {
        signedIn = false
        return apiError(401, 'UNAUTHENTICATED', 'Log in to continue.')
      },
    })
    expect(await screen.findByText(/login page \?next=%2Fadmin/)).toBeTruthy()
  })

  it('shows the server’s refusal when the role no longer allows it (403)', async () => {
    renderAt('/admin', { ...as(GRACE_ADMIN), 'GET /admin/stats': () => apiError(403, 'FORBIDDEN', 'Your account does not have permission to do that.') })
    expect(await screen.findByText('Your account does not have permission to do that.')).toBeTruthy()
  })
})

describe('dashboard', () => {
  it('shows a loading state, then the real statistics and recent activity', async () => {
    renderAt('/admin', { ...as(GRACE_ADMIN), 'GET /admin/stats': () => json(200, adminStats()) })
    expect(await screen.findByText('Loading…')).toBeTruthy()
    const awaiting = await screen.findByRole('link', { name: /Awaiting review/ })
    expect(within(awaiting).getByText('4')).toBeTruthy()
    expect(awaiting.getAttribute('href')).toBe('/admin/submissions?status=SUBMITTED,UNDER_REVIEW')
    expect(screen.getByText('Not an AI tool.')).toBeTruthy()
  })

  it('shows an empty state when nothing has been moderated', async () => {
    renderAt('/admin', { ...as(GRACE_ADMIN), 'GET /admin/stats': () => json(200, adminStats({ recentActivity: [] })) })
    expect(await screen.findByText('No moderation or admin actions yet.')).toBeTruthy()
  })

  it('shows an error with a working retry', async () => {
    let attempts = 0
    renderAt('/admin', {
      ...as(GRACE_ADMIN),
      'GET /admin/stats': () => (++attempts === 1 ? apiError(500, 'INTERNAL', 'Something went wrong. The error has been logged.') : json(200, adminStats())),
    })
    expect(await screen.findByText('Something went wrong. The error has been logged.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: /Awaiting review/ })).toBeTruthy()
  })
})

describe('submission queue', () => {
  const page = (items: number, total: number, pageNumber = 1) =>
    json(200, {
      items: Array.from({ length: items }, (_, index) => ({
        ...submissionDetail({ id: `${index}0000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, name: `Tool ${pageNumber}-${index}` }),
      })),
      total,
      page: pageNumber,
      pageSize: 25,
    })

  it('lists submissions with submitter and status, linking to the review screen', async () => {
    renderAt('/admin/submissions', { ...as(GRACE_ADMIN), 'GET /admin/submissions': () => page(2, 2) })
    const link = await screen.findByRole('link', { name: /Tool 1-0/ })
    expect(link.getAttribute('href')).toBe('/admin/submissions/00000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(within(link).getByText('Ada')).toBeTruthy()
    expect(within(link).getByText('Submitted')).toBeTruthy()
  })

  it('sends filters, search and pages to the server', async () => {
    const { callsTo } = renderAt('/admin/submissions', {
      ...as(GRACE_ADMIN),
      'GET /admin/submissions': (call) => page(25, 30, new URLSearchParams(call.query).get('page') === '2' ? 2 : 1),
    })
    await screen.findByRole('link', { name: /Tool 1-0/ })

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'REJECTED')
    await waitFor(() => expect(new URLSearchParams(callsTo('GET /admin/submissions').at(-1)?.query).get('status')).toBe('REJECTED'))

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search submissions' }), 'ada@example.com{Enter}')
    await waitFor(() => expect(new URLSearchParams(callsTo('GET /admin/submissions').at(-1)?.query).get('q')).toBe('ada@example.com'))

    await userEvent.click(await screen.findByRole('button', { name: 'Next →' }))
    await waitFor(() => expect(new URLSearchParams(callsTo('GET /admin/submissions').at(-1)?.query).get('page')).toBe('2'))
    expect(await screen.findByText('26–30 of 30')).toBeTruthy()
  })

  it('shows an empty state for a filter with no matches', async () => {
    renderAt('/admin/submissions?status=REJECTED', { ...as(GRACE_ADMIN), 'GET /admin/submissions': () => page(0, 0) })
    expect(await screen.findByText('No submissions match these filters.')).toBeTruthy()
  })
})

describe('submission review', () => {
  const path = `/admin/submissions/${SUBMISSION_ID}`
  const detailRoute = `GET /admin/submissions/${SUBMISSION_ID}`

  it('requires a reason before a rejection can be confirmed, then shows the new status', async () => {
    const { callsTo } = renderAt(path, {
      ...as(GRACE_ADMIN),
      [detailRoute]: () => json(200, { submission: submissionDetail() }),
      [`POST /admin/submissions/${SUBMISSION_ID}/reject`]: (call) =>
        json(200, {
          submission: submissionDetail({
            status: 'REJECTED',
            rejectionReason: (call.body as { reason: string }).reason,
            allowedActions: ['note'],
            proposal: null,
          }),
        }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Reject…' }))
    const dialog = screen.getByRole('dialog', { name: 'Reject this submission?' })
    const confirm = within(dialog).getByRole('button', { name: 'Reject submission' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    await userEvent.type(within(dialog).getByRole('textbox'), 'too short')
    expect(confirm.disabled).toBe(true)
    await userEvent.type(within(dialog).getByRole('textbox'), ' — duplicate listing')
    expect(confirm.disabled).toBe(false)
    await userEvent.click(confirm)

    expect(await screen.findByText(/Submission rejected/)).toBeTruthy()
    expect(callsTo(`POST /admin/submissions/${SUBMISSION_ID}/reject`)[0]?.body).toEqual({ reason: 'too short — duplicate listing' })
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    expect((screen.getByRole('button', { name: 'Approve…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('requires a message to request changes', async () => {
    renderAt(path, { ...as(GRACE_ADMIN), [detailRoute]: () => json(200, { submission: submissionDetail() }) })
    await userEvent.click(await screen.findByRole('button', { name: 'Request changes…' }))
    const dialog = screen.getByRole('dialog', { name: 'Request changes?' })
    expect((within(dialog).getByRole('button', { name: 'Send change request' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('on a 409 conflict, says so and reloads the record from the server', async () => {
    let loads = 0
    renderAt(path, {
      ...as(GRACE_ADMIN),
      [detailRoute]: () => {
        loads += 1
        return json(200, { submission: loads === 1 ? submissionDetail() : submissionDetail({ status: 'APPROVED', allowedActions: ['note'], proposal: null }) })
      },
      [`POST /admin/submissions/${SUBMISSION_ID}/request-changes`]: () =>
        apiError(409, 'CONFLICT', 'This submission is approved, so it cannot be sent back for changes. Reload to see its current state.'),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Request changes…' }))
    await userEvent.type(screen.getByRole('textbox', { name: /What should change/ }), 'Please add a pricing page.')
    await userEvent.click(screen.getByRole('button', { name: 'Send change request' }))
    expect(await screen.findByText(/cannot be sent back for changes/)).toBeTruthy()
    await waitFor(() => expect(loads).toBe(2))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Request changes…' }) as HTMLButtonElement).disabled).toBe(true))
  })

  it('approval is pre-filled from the proposal and shows the server’s field errors on the right inputs', async () => {
    const { callsTo } = renderAt(path, {
      ...as(GRACE_ADMIN),
      [detailRoute]: () => json(200, { submission: submissionDetail() }),
      'GET /admin/vocabulary': () => json(200, VOCABULARY),
      [`POST /admin/submissions/${SUBMISSION_ID}/approve`]: () =>
        apiError(400, 'VALIDATION_FAILED', 'The catalogue record is not valid yet.', { fields: { 'tool.stages': 'Too small: expected array to have >=1 items' } }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Approve…' }))
    const slug = (await screen.findByRole('textbox', { name: /Slug/ })) as HTMLInputElement
    expect(slug.value).toBe('example-tool')

    await userEvent.click(screen.getByRole('button', { name: 'Review approval' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve and create draft' }))

    expect(await screen.findByText('Too small: expected array to have >=1 items')).toBeTruthy()
    expect(callsTo(`POST /admin/submissions/${SUBMISSION_ID}/approve`)[0]?.body).toMatchObject({ tool: { slug: 'example-tool', mono: 'Ex', roles: ['Writer'] } })
  })

  it('internal notes are labelled admin-only and are posted to the notes endpoint', async () => {
    const { callsTo } = renderAt(path, {
      ...as(GRACE_ADMIN),
      [detailRoute]: () => json(200, { submission: submissionDetail() }),
      [`POST /admin/submissions/${SUBMISSION_ID}/notes`]: () => json(200, { submission: submissionDetail() }),
    })
    expect(await screen.findByText(/Only admins see notes/)).toBeTruthy()
    await userEvent.type(screen.getByRole('textbox', { name: /internal note/i }), 'Called the founder.')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('Note added.')).toBeTruthy()
    expect(callsTo(`POST /admin/submissions/${SUBMISSION_ID}/notes`)[0]?.body).toEqual({ note: 'Called the founder.' })
  })

  it('warns about a catalogue duplicate', async () => {
    renderAt(path, {
      ...as(GRACE_ADMIN),
      [detailRoute]: () =>
        json(200, { submission: submissionDetail({ duplicates: { catalogueTool: { id: 'claude', name: 'Claude', location: 'live-catalogue' }, otherSubmissions: [] } }) }),
    })
    expect(await screen.findByText(/already has a tool at this address/)).toBeTruthy()
  })

  it('a malformed or unknown id shows not-found', async () => {
    renderAt('/admin/submissions/nope', { ...as(GRACE_ADMIN), 'GET /admin/submissions/nope': () => apiError(404, 'NOT_FOUND', 'No submission found with that id.') })
    expect(await screen.findByText('No submission found with that id.')).toBeTruthy()
  })
})

describe('tool editing', () => {
  const routes = (extra: Record<string, StubRoute> = {}) => ({
    ...as(GRACE_ADMIN),
    'GET /admin/tools/alpha-writer': () => json(200, toolDetail()),
    'GET /admin/vocabulary': () => json(200, VOCABULARY),
    ...extra,
  })

  it('sends only the changed fields with the loaded timestamp, after confirmation', async () => {
    const { callsTo } = renderAt(
      '/admin/tools/alpha-writer',
      routes({ 'PATCH /admin/tools/alpha-writer': () => json(200, toolDetail({ meta: { source: 'seed', createdAt: 'x', updatedAt: '2026-10-07T00:00:00.000Z' } })) }),
    )
    const save = (await screen.findByRole('button', { name: 'Save changes' })) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    const name = screen.getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Alpha Writer Pro')
    await userEvent.clear(screen.getByRole('textbox', { name: /^Tags/ }))
    await userEvent.type(screen.getByRole('textbox', { name: /^Tags/ }), 'Writing, Editing')
    await userEvent.click(save)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/Saved. The change is recorded/)).toBeTruthy()
    expect(callsTo('PATCH /admin/tools/alpha-writer')[0]?.body).toEqual({
      expectedUpdatedAt: '2026-10-05T00:00:00.000Z',
      changes: { name: 'Alpha Writer Pro', tags: ['Writing', 'Editing'] },
    })
  })

  it('shows server validation errors under the field', async () => {
    renderAt(
      '/admin/tools/alpha-writer',
      routes({ 'PATCH /admin/tools/alpha-writer': () => apiError(400, 'VALIDATION_FAILED', 'Some fields need attention.', { fields: { url: 'must be an http(s) URL' } }) }),
    )
    const url = await screen.findByRole('textbox', { name: 'Website URL' })
    fireEvent.change(url, { target: { value: 'javascript:alert(1)' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('must be an http(s) URL')).toBeTruthy()
    expect(screen.getByText('Some fields need attention.')).toBeTruthy()
  })

  it('says when the live catalogue differs and lists rule violations', async () => {
    renderAt(
      '/admin/tools/alpha-writer',
      routes({ 'GET /admin/tools/alpha-writer': () => json(200, toolDetail({ liveCatalogue: { present: true, matchesDatabase: false }, issues: ['summary: Too small'] })) }),
    )
    expect(await screen.findByText(/serves a different version of this record/)).toBeTruthy()
    expect(screen.getByText('summary: Too small')).toBeTruthy()
  })
})

describe('user and role management', () => {
  const userPath = `/admin/users/${ADA.id}`

  it('shows no role control to an ADMIN', async () => {
    renderAt(userPath, { ...as(GRACE_ADMIN), [`GET /admin/users/${ADA.id}`]: () => json(200, userDetail()) })
    await screen.findByText('Account')
    expect(screen.queryByRole('group', { name: 'Set role' })).toBeNull()
  })

  it('lets a SUPER_ADMIN change a role after confirming, and shows a server refusal', async () => {
    let attempt = 0
    const { callsTo } = renderAt(userPath, {
      ...as(ROOT_SUPER),
      [`GET /admin/users/${ADA.id}`]: () => json(200, userDetail({ assignableRoles: ['USER', 'ADMIN', 'SUPER_ADMIN'] })),
      [`PATCH /admin/users/${ADA.id}/role`]: () =>
        ++attempt === 1
          ? json(200, { user: { ...ADA, role: 'ADMIN' } })
          : apiError(409, 'CONFLICT', 'This is the last active super admin. Promote someone else first.'),
    })
    const group = await screen.findByRole('group', { name: 'Set role' })
    expect((within(group).getByRole('button', { name: 'User' }) as HTMLButtonElement).disabled).toBe(true)

    await userEvent.click(within(group).getByRole('button', { name: 'Admin' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Change role' }))
    expect(await screen.findByText('Role is now Admin.')).toBeTruthy()
    expect(callsTo(`PATCH /admin/users/${ADA.id}/role`)[0]?.body).toEqual({ role: 'ADMIN' })

    await userEvent.click(within(await screen.findByRole('group', { name: 'Set role' })).getByRole('button', { name: 'Super admin' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Change role' }))
    expect(await screen.findByText('This is the last active super admin. Promote someone else first.')).toBeTruthy()
  })
})

describe('audit log', () => {
  it('renders entries read-only, with internal notes marked', async () => {
    renderAt('/admin/audit', {
      ...as(GRACE_ADMIN),
      'GET /admin/audit': () =>
        json(200, {
          items: [
            auditEntry(),
            auditEntry({ id: 'e2', type: 'NOTE_ADDED', metadata: { note: 'Checked the pricing page.' } }),
            auditEntry({ id: 'e3', kind: 'admin', type: 'USER_ROLE_CHANGED', submission: null, targetUser: { id: ADA.id, email: ADA.email }, metadata: { from: 'USER', to: 'ADMIN' } }),
          ],
          total: 3,
          page: 1,
          pageSize: 50,
        }),
    })
    const list = await screen.findByRole('list', { name: 'Audit history' })
    expect(within(list).getByText('Checked the pricing page.')).toBeTruthy()
    expect(within(list).getByText('Admin-only')).toBeTruthy()
    expect(within(list).getByText('User → Admin')).toBeTruthy()
    expect(within(list).queryAllByRole('button')).toEqual([])
  })
})

describe('admin console shell', () => {
  it('is its own console: admin navigation and role, none of the public site chrome', async () => {
    renderAt('/admin/submissions', {
      ...as(ROOT_SUPER),
      'GET /admin/submissions': () => json(200, { items: [], total: 0, page: 1, pageSize: 25 }),
    })
    await screen.findByText('Queue is empty')
    const navs = screen.getAllByRole('navigation', { name: 'Admin sections' })
    for (const nav of navs) {
      expect(within(nav).getAllByRole('link').map((link) => link.textContent?.replace(/^\d+/, ''))).toEqual(['Overview', 'Submissions', 'Tools', 'Users', 'Audit log'])
      expect(within(nav).getByRole('link', { current: 'page' }).textContent).toMatch(/Submissions/)
    }
    // The signed-in role is shown; the public header, ticker and CTA are not.
    expect(screen.getAllByText('Super admin').length).toBeGreaterThan(0)
    expect(screen.queryByText('Submit Your Tool')).toBeNull()
    expect(screen.queryByText('View all updates')).toBeNull()
    expect(screen.getByRole('link', { name: 'View site ↗' }).getAttribute('href')).toBe('/')
  })

  it('Sign out ends the session through the existing logout and leaves the console', async () => {
    let signedIn = true
    const { callsTo } = renderAt('/admin', {
      'GET /auth/me': () => (signedIn ? json(200, { user: GRACE_ADMIN }) : apiError(401, 'UNAUTHENTICATED', 'x')),
      'GET /admin/stats': () => json(200, adminStats()),
      'POST /auth/logout': () => {
        signedIn = false
        return new Response(null, { status: 204 })
      },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText(/login page \?next=%2Fadmin/)).toBeTruthy()
    expect(callsTo('POST /auth/logout')).toHaveLength(1)
  })

  it('an empty database catalogue is a normal, explained state', async () => {
    renderAt('/admin/tools', {
      ...as(GRACE_ADMIN),
      'GET /admin/vocabulary': () => json(200, VOCABULARY),
      'GET /admin/tools': () => json(200, { items: [], total: 0, page: 1, pageSize: 25 }),
    })
    expect(await screen.findByText('No database tools yet')).toBeTruthy()
    expect(screen.getByText(/Draft tools appear here when a submission is approved/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the review queue' }).getAttribute('href')).toBe('/admin/submissions?status=SUBMITTED,UNDER_REVIEW')
  })

  it('does not call a submission’s own approved tool a duplicate', async () => {
    renderAt(`/admin/submissions/${SUBMISSION_ID}`, {
      ...as(GRACE_ADMIN),
      [`GET /admin/submissions/${SUBMISSION_ID}`]: () =>
        json(200, {
          submission: submissionDetail({
            status: 'APPROVED',
            toolId: 'example-tool',
            allowedActions: ['note'],
            proposal: null,
            duplicates: { catalogueTool: { id: 'example-tool', name: 'Example Tool', location: 'database' }, otherSubmissions: [] },
          }),
        }),
    })
    expect(await screen.findByText('Decided — internal notes only.')).toBeTruthy()
    expect(screen.queryByText(/already has a tool at this address/)).toBeNull()
  })

  it('role changes are presented as a privileged, audited operation', async () => {
    renderAt(`/admin/users/${ADA.id}`, {
      ...as(ROOT_SUPER),
      [`GET /admin/users/${ADA.id}`]: () => json(200, userDetail({ assignableRoles: ['USER', 'ADMIN', 'SUPER_ADMIN'] })),
    })
    expect(await screen.findByText('Privileged operation · Super admin')).toBeTruthy()
    const group = screen.getByRole('group', { name: 'Set role' })
    expect(within(group).getByRole('button', { name: 'User' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(within(group).getByRole('button', { name: 'Admin' }))
    expect(within(screen.getByRole('dialog')).getByText('Privileged operation · audited')).toBeTruthy()
  })
})
