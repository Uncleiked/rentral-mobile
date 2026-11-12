'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { finishGoogleSignIn } from '../actions'
import { accountField, accountPrimaryAction } from '@/components/ui/account-styles'

const field = accountField
export function GoogleFinishForm({ kind, email }: { kind: 'new' | 'link'; email: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const router = useRouter()
  return <form className="mt-6 min-w-0 space-y-5" aria-busy={busy} onSubmit={event => {
    event.preventDefault(); if (busy) return
    const form = event.currentTarget; if (!form.reportValidity()) return
    setBusy(true); setError('')
    void finishGoogleSignIn(new FormData(form)).then(result => {
      if ('error' in result) setError(result.error)
      else { router.replace(result.redirectTo); router.refresh() }
    }).catch(() => setError('Unable to connect. Please try again.')).finally(() => setBusy(false))
  }}>
    <p className="break-words text-sm leading-6 text-text-secondary">{kind === 'link' ? 'Confirm your existing Rentral password to connect Google to your account. Matching email addresses alone never connect accounts.' : 'Choose how you will use Rentral before creating your account.'}</p>
    <p className="break-all text-sm font-medium text-text-primary">{email}</p>
    {kind === 'link' ? <div><label className="mb-2 block text-sm text-text-secondary" htmlFor="existing-password">Existing Rentral password</label><input className={field} id="existing-password" name="password" type="password" autoComplete="current-password" maxLength={128} required /><a href="/forgot-password" className="mt-2 inline-flex min-h-11 items-center text-sm text-accent-hover">Forgot your password?</a></div> :
      <><fieldset className="min-w-0 space-y-3"><legend className="mb-3 text-sm font-medium text-text-primary">Account type</legend>{(['individual', 'organization'] as const).map(value => <label key={value} className="flex min-h-14 items-center gap-3 rounded-xl border border-border-subtle bg-background-app p-4 text-sm text-text-primary transition-colors focus-within:border-accent-primary hover:border-accent-primary"><input type="radio" name="accountType" value={value} required className="size-4 accent-accent-primary" /><span>{value === 'individual' ? 'Individual' : 'Organization'}</span></label>)}</fieldset><label className="flex items-start gap-3 text-sm leading-6 text-text-secondary"><input type="checkbox" name="termsAccepted" required className="mt-1 size-4 shrink-0 accent-accent-primary" /><span>I accept the <a className="text-accent-hover" href="/terms">terms</a> and <a className="text-accent-hover" href="/privacy">privacy policy</a>.</span></label></>}
    {error && <p role="alert" className="break-words text-sm text-trust-flagged">{error}</p>}
    <button className={accountPrimaryAction} disabled={busy}>{busy ? 'Please wait...' : kind === 'link' ? 'Connect Google and sign in' : 'Create account'}</button>
    <a href="/sign-in" className="flex min-h-11 items-center justify-center rounded-xl text-center text-sm text-text-secondary hover:text-text-primary">Start sign-in again</a>
  </form>
}
