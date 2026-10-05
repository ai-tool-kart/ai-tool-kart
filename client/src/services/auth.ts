import { apiRequest } from '@/services/http'
import type { OwnerSubmission, PublicUser } from '@/types/auth'

/*
 * Account transport — /api/auth/* and /api/me/submissions.
 *
 * One function per endpoint, no state. Every call goes through apiRequest,
 * which sends the session cookie same-origin only and never exposes it.
 * Nothing here accepts or sends a user id: the server reads identity from
 * the session alone.
 */

export interface Credentials {
  email: string
  password: string
}

export interface Registration extends Credentials {
  name?: string
}

interface UserResponse {
  user: PublicUser
}

export async function fetchCurrentUser(signal?: AbortSignal): Promise<PublicUser> {
  return (await apiRequest<UserResponse>('/auth/me', { signal })).user
}

export async function login(credentials: Credentials): Promise<PublicUser> {
  return (await apiRequest<UserResponse>('/auth/login', { body: credentials })).user
}

export async function register(registration: Registration): Promise<PublicUser> {
  return (await apiRequest<UserResponse>('/auth/register', { body: registration })).user
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' })
}

export async function fetchMySubmissions(signal?: AbortSignal): Promise<OwnerSubmission[]> {
  return (await apiRequest<{ items: OwnerSubmission[] }>('/me/submissions', { signal })).items
}

export async function fetchMySubmission(id: string, signal?: AbortSignal): Promise<OwnerSubmission> {
  return (await apiRequest<{ submission: OwnerSubmission }>(`/me/submissions/${encodeURIComponent(id)}`, { signal }))
    .submission
}
