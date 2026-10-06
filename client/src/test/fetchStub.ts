import { vi } from 'vitest'

/*
 * A stubbed `fetch` for client tests: routes by "METHOD /path" (the part
 * after /api) and records every call so a test can assert on what was sent
 * — method, credentials mode, headers and JSON body.
 */

export interface RecordedCall {
  method: string
  path: string
  /** The query string without its "?" ('' when none), for asserting filters. */
  query: string
  credentials: RequestCredentials | undefined
  body: unknown
}

export type Route = (call: RecordedCall) => Response | Promise<Response>

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}

export function apiError(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers?: Record<string, string>): Response {
  return json(status, { error: { code, message, ...extra } }, headers)
}

export function stubFetch(routes: Record<string, Route>) {
  const calls: RecordedCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const [path = '', query = ''] = url.replace(/^.*?\/api(?=\/)/, '').split('?')
    const method = (init.method ?? 'GET').toUpperCase()
    const call: RecordedCall = {
      method,
      path,
      query,
      credentials: init.credentials,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    const route = routes[`${method} ${path}`] ?? routes[`* ${path}`]
    if (!route) return apiError(404, 'NOT_FOUND', `No stub for ${method} ${path}`)
    return route(call)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock, callsTo: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key) }
}
