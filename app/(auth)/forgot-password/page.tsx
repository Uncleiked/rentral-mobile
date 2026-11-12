'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { AccountPage } from '@/components/layout/AccountPage'
import { accountCard, accountField, accountPrimaryAction, accountSecondaryAction } from '@/components/ui/account-styles'
import { sendPasswordReset } from './actions'

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [delivery, setDelivery] = useState<'email' | 'development-outbox'>('email')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    if (!form.checkValidity()) { form.reportValidity(); return }
    setIsLoading(true)
    const formData = new FormData(form)
    try {
      const result = await sendPasswordReset(formData)
      if (!result.success) toast.error(result.error)
      else { setIsSuccess(true); setDelivery(result.delivery); toast.success(result.message) }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally { setIsLoading(false) }
  }

  return <AccountPage><section className={accountCard}>
    <header className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-hover">Account recovery</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">Reset your password</h1>
      <p className="mt-2 text-sm leading-6 text-text-secondary">Enter your email to request a password reset code.</p>
    </header>
    {isSuccess ? <div className="min-w-0 space-y-5" role="status">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent-muted text-accent-hover">
        <svg aria-hidden="true" className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      </div>
      <p className="text-sm leading-6 text-text-secondary">{delivery === 'email' ? 'If your account exists, check your inbox for its recovery code.' : 'Ask your Rentral operator for your recovery code.'}</p>
      <Link href="/reset-password" className={accountPrimaryAction}>Use reset code</Link>
      <Link href="/sign-in" className={accountSecondaryAction + ' w-full'}>Back to Sign In</Link>
    </div> : <form onSubmit={handleSubmit} className="min-w-0 space-y-5" aria-busy={isLoading}>
      <div className="min-w-0 space-y-2">
        <label className="block text-sm font-medium text-text-secondary" htmlFor="email">Email address</label>
        <input className={accountField} id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required disabled={isLoading} />
      </div>
      <button type="submit" className={accountPrimaryAction} disabled={isLoading}>{isLoading ? 'Requesting...' : 'Request reset code'}</button>
      <Link href="/sign-in" className={accountSecondaryAction + ' w-full'}>Back to Sign In</Link>
    </form>}
  </section></AccountPage>
}
