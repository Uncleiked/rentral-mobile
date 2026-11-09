import { AppState } from 'react-native'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { configurationError } from '../lib/config'
import { getSession, signOut as leaveSession, subscribeAuth } from '../lib/auth'
import type { AuthSession } from '../lib/auth-types'
import { api } from '../lib/api'
import { observeAuth } from '../lib/auth-observer'

type AuthContextValue = { session: AuthSession | null; loading: boolean; error: string | null; clearError: () => void; signOut: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(configurationError)
  const authNotification = useRef(0)
  useEffect(() => {
    let active = true
    const observer = observeAuth({ subscribe: subscribeAuth, getSession }, value => {
      authNotification.current++
      setSession(value); setError(configurationError)
    }, reason => { setError(reason instanceof Error ? reason.message : 'Your sign-in could not be restored.') })
    const refresh = observer.refresh
    void refresh().finally(() => { if (active) setLoading(false) })
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh() })
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh() }, 30000)
    return () => { active = false; observer.dispose(); listener.remove(); clearInterval(timer) }
  }, [])
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let active = true
    const started = authNotification.current
    void api('/me').catch(() => { if (active && started === authNotification.current) setError('Your account could not be loaded. Open Account to try again.') })
    return () => { active = false }
  }, [userId])
  const signOut = useCallback(async (): Promise<void> => { await leaveSession() }, [])
  return <AuthContext.Provider value={{ session, loading, error, signOut, clearError: () => setError(configurationError) }}>{children}</AuthContext.Provider>
}
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is required')
  return value
}
