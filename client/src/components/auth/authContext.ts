import { createContext } from 'react'
import type { Credentials, Registration } from '@/services/auth'
import type { AuthState, PublicUser } from '@/types/auth'

/*
 * The auth context object, on its own so AuthProvider.tsx exports only a
 * component (fast refresh). Read it through hooks/useAuth.ts.
 */

export interface AuthContextValue {
  state: AuthState
  login(credentials: Credentials): Promise<PublicUser>
  register(registration: Registration): Promise<PublicUser>
  logout(): Promise<void>
  /** Re-reads /auth/me — e.g. after the server rejects a request with 401. */
  refresh(): Promise<AuthState>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
