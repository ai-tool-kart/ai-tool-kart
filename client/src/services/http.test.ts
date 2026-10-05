import { describe, expect, it } from 'vitest'
import { apiRequest, ApiRequestError } from '@/services/http'
import { apiError, json, noContent, stubFetch } from '@/test/fetchStub'

describe('apiRequest', () => {
  it('sends credentials same-origin only, so the session cookie never goes cross-origin', async () => {
    const { calls } = stubFetch({ 'GET /ping': () => json(200, { ok: true }) })
    await apiRequest('/ping')
    expect(calls[0]?.credentials).toBe('same-origin')
  })

  it('defaults to GET, and to POST with a JSON body', async () => {
    const { calls } = stubFetch({ 'GET /a': () => json(200, {}), 'POST /b': () => json(201, {}) })
    await apiRequest('/a')
    await apiRequest('/b', { body: { x: 1 } })
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST'])
    expect(calls[1]?.body).toEqual({ x: 1 })
  })

  it.each(['PUT', 'PATCH', 'DELETE'] as const)('supports %s', async (method) => {
    const { calls } = stubFetch({ [`${method} /thing`]: () => json(200, { done: true }) })
    await expect(apiRequest('/thing', { method })).resolves.toEqual({ done: true })
    expect(calls[0]?.method).toBe(method)
  })

  it('resolves 204 No Content without trying to parse a body', async () => {
    stubFetch({ 'POST /auth/logout': () => noContent() })
    await expect(apiRequest<void>('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it.each([
    [401, 'UNAUTHENTICATED', 'Log in to continue.'],
    [403, 'FORBIDDEN', 'Your account does not have permission to do that.'],
    [503, 'AUTH_UNAVAILABLE', 'Accounts are not available on this server right now.'],
  ])('maps %i to ApiRequestError with the server code and message', async (status, code, message) => {
    stubFetch({ 'GET /x': () => apiError(status, code, message) })
    const error = await apiRequest('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status, code, message })
  })

  it('carries Retry-After on a 429', async () => {
    stubFetch({ 'POST /auth/login': () => apiError(429, 'RATE_LIMITED', 'Too many.', {}, { 'Retry-After': '120' }) })
    const error = (await apiRequest('/auth/login', { body: {} }).catch((e: unknown) => e)) as ApiRequestError
    expect(error.code).toBe('RATE_LIMITED')
    expect(error.retryAfterSeconds).toBe(120)
  })

  it('keeps per-field messages from a 400', async () => {
    stubFetch({ 'POST /auth/register': () => apiError(400, 'VALIDATION_FAILED', 'Bad.', { fields: { email: 'Enter a valid email address.' } }) })
    const error = (await apiRequest('/auth/register', { body: {} }).catch((e: unknown) => e)) as ApiRequestError
    expect(error.fields).toEqual({ email: 'Enter a valid email address.' })
  })
})
