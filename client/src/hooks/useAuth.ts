import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from '@/components/auth/authContext'

/** The signed-in state and account actions. Must be used under <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.')
  return value
}
