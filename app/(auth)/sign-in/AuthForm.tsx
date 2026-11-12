'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login, signup } from './actions'
import { startGoogleSignIn } from '@/app/auth/google/actions'
import { toast } from 'sonner'
import { accountCard, accountField, accountPrimaryAction, accountSecondaryAction } from '@/components/ui/account-styles'

const field = accountField
export default function AuthForm({ providers, initialError = '' }: { providers: { google: boolean; apple: boolean }; initialError?: string }) {
  const [isLoading, setIsLoading] = useState(false), [errorMessage, setErrorMessage] = useState(initialError)
  const [showPassword, setShowPassword] = useState(false), [creating, setCreating] = useState(false)
  const [accountType, setAccountType] = useState<'individual' | 'organization' | null>(null), [accepted, setAccepted] = useState(false)
  const router = useRouter()
  async function handleGoogle() {
    if (isLoading || !providers.google) return
    setErrorMessage('')
    if (creating && (!accountType || !accepted)) { setErrorMessage('Choose an account type and accept the terms before continuing.'); return }
    setIsLoading(true)
    try {
      const result = await startGoogleSignIn(creating ? { mode: 'signup', accountType, termsAccepted: accepted } : { mode: 'signin' })
      if ('error' in result) setErrorMessage(result.error)
      else window.location.assign(result.url)
    } catch { setErrorMessage('Unable to connect. Check your connection and try again.') }
    finally { setIsLoading(false) }
  }
  async function handleEmail(form: HTMLFormElement) {
    if (isLoading || !form.reportValidity()) return
    setIsLoading(true); setErrorMessage('')
    try {
      const result = await (creating ? signup : login)(new FormData(form))
      if ('error' in result) setErrorMessage(result.error)
      else {
        toast.success(result.message ?? (creating ? 'Account created!' : 'Signed in successfully.'))
        router.replace(result.redirectTo); router.refresh()
      }
    } catch { setErrorMessage('Unable to connect. Check your connection and try again.') }
    finally { setIsLoading(false) }
  }
  return <section className={accountCard}>
    <header className="mb-7"><p className="text-xs font-semibold uppercase tracking-widest text-accent-hover">Your Rentral account</p><h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">{creating ? 'Create your account' : 'Welcome to Rentral'}</h1><p className="mt-2 text-sm leading-6 text-text-secondary">{creating ? 'Choose your account type, then create an account with Google or email.' : 'Sign in with your email and password, or continue with Google.'}</p></header>
    <form className="min-w-0 space-y-5" aria-busy={isLoading} onSubmit={event => { event.preventDefault(); void handleEmail(event.currentTarget) }}>
      {creating && <><fieldset className="min-w-0 space-y-3"><legend className="mb-3 text-sm font-semibold text-text-primary">Account type</legend>{(['individual', 'organization'] as const).map(type => <label key={type} className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${accountType === type ? 'border-accent-primary bg-accent-muted' : 'border-border-subtle bg-background-app'}`}><input className="mt-1 size-4 shrink-0 accent-accent-primary" type="radio" name="accountType" value={type} checked={accountType === type} onChange={() => setAccountType(type)} required /><span className="min-w-0"><span className="block text-sm font-semibold text-text-primary">{type === 'individual' ? 'Individual' : 'Organization'}</span><span className="mt-1 block text-xs leading-5 text-text-muted">{type === 'individual' ? 'Rent or list assets using your own account.' : 'Submit registration evidence for admin approval.'}</span></span></label>)}</fieldset><label className="flex items-start gap-3 text-sm leading-6 text-text-secondary"><input className="mt-1 size-4 shrink-0 accent-accent-primary" type="checkbox" name="termsAccepted" checked={accepted} onChange={event => setAccepted(event.target.checked)} required /><span>I accept the <a className="text-accent-hover underline underline-offset-4" href="/terms">terms</a> and <a className="text-accent-hover underline underline-offset-4" href="/privacy">privacy policy</a>.</span></label></>}
      <button type="button" onClick={() => void handleGoogle()} disabled={isLoading || !providers.google} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-sm font-semibold text-text-primary transition-all hover:bg-glass-light-hover disabled:cursor-not-allowed disabled:opacity-50"><svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 12h8" stroke="currentColor" strokeWidth="2" /></svg>Continue with Google</button>
      {!providers.google && <p className="text-xs leading-5 text-text-muted">Google sign-in is awaiting configuration. Email and password are available.</p>}
      <div className="flex items-center gap-3 py-2" aria-hidden="true"><span className="h-px flex-1 bg-border-subtle" /><span className="text-xs text-text-muted">or use email</span><span className="h-px flex-1 bg-border-subtle" /></div>
      <div><label htmlFor="email" className="mb-2 block text-sm font-medium text-text-secondary">Email</label><input className={field} id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div>
      <div><div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><label htmlFor="password" className="text-sm font-medium text-text-secondary">Password</label><a href="/forgot-password" className="inline-flex min-h-11 items-center text-xs font-medium text-accent-hover">Forgot Password?</a></div><div className="relative"><input className={field + ' pr-20'} id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={creating ? 'new-password' : 'current-password'} minLength={creating ? 8 : 1} maxLength={128} required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></div>
      {errorMessage && <p role="alert" className="break-words text-sm leading-6 text-trust-flagged">{errorMessage}</p>}
      <button type="submit" disabled={isLoading} className={accountPrimaryAction}>{isLoading ? 'Please wait...' : creating ? 'Create Account' : 'Sign In'}</button>
      <button type="button" disabled={isLoading} onClick={() => { setCreating(value => !value); setErrorMessage('') }} className={accountSecondaryAction + ' w-full'}>{creating ? 'I already have an account' : 'Create Account'}</button>
    </form>
  </section>
}
