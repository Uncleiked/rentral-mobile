import { useState } from 'react'
import { authRequest, signIn } from '../lib/auth'
import { useAuth } from '../providers/AuthProvider'

type Mode = 'login' | 'signup' | 'recover' | 'reset'
export function useSignIn() {
  const { error: sessionError, clearError } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  function changeMode(next: Mode): void { setMode(next); setError(null); setNotice(null); setPassword(''); clearError() }
  async function submit(): Promise<void> {
    if (busy) return
    if (mode !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return }
    if (mode !== 'recover' && (!password || (mode !== 'login' && password.length < 8))) { setError(mode === 'login' ? 'Enter your password.' : 'Use at least 8 characters.'); return }
    if (mode === 'reset' && !/^[A-Za-z0-9_-]{43}$/.test(resetToken.trim())) { setError('Paste your complete reset code.'); return }
    setBusy(true); setError(null); setNotice(null); clearError()
    try {
      if (mode === 'recover') {
        await authRequest('/password-reset', { email: email.trim() })
        setNotice('If your account exists, its reset code is in the private email outbox on the computer running Rentral. Copy it and choose “Use reset code”.')
      } else if (mode === 'reset') {
        await authRequest('/reset-password', { token: resetToken.trim(), password })
        setMode('login'); setPassword(''); setResetToken(''); setNotice('Password updated. Sign in with your new password.')
      } else await signIn(email.trim(), password, mode === 'signup')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'This request could not be completed. Please try again.') }
    finally { setBusy(false) }
  }
  return { mode, email, setEmail, password, setPassword, resetToken, setResetToken, busy, error: error ?? sessionError, notice, changeMode, submit }
}
