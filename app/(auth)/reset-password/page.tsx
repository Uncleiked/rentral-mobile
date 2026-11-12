'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { AccountPage } from '@/components/layout/AccountPage'
import { accountCard, accountField, accountPrimaryAction, accountSecondaryAction } from '@/components/ui/account-styles'
import { updatePassword } from './actions'

export default function ResetPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    if (!form.checkValidity()) { form.reportValidity(); return }
    setIsLoading(true)
    const formData = new FormData(form)
    try {
      const result = await updatePassword(formData)
      if (!result.success) toast.error(result.error)
      else {
        toast.success('Password updated successfully!')
        router.replace(result.redirectTo)
        router.refresh()
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally { setIsLoading(false) }
  }

  return <AccountPage><section className={accountCard}>
    <header className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-hover">Account recovery</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">Set a new password</h1>
      <p className="mt-2 text-sm leading-6 text-text-secondary">Use your reset code to choose a new password for your account.</p>
    </header>
    <form onSubmit={handleSubmit} className="min-w-0 space-y-5" aria-busy={isLoading}>
      <div className="min-w-0 space-y-2">
        <label className="block text-sm font-medium text-text-secondary" htmlFor="token">Reset code</label>
        <input className={accountField} id="token" name="token" autoComplete="off" autoCapitalize="none" spellCheck={false} required minLength={43} maxLength={43} disabled={isLoading} placeholder="Paste your complete reset code" />
      </div>
      <div className="min-w-0 space-y-2">
        <label className="block text-sm font-medium text-text-secondary" htmlFor="password">New Password</label>
        <div className="relative min-w-0">
          <input className={accountField + ' pr-16'} id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} disabled={isLoading} aria-describedby="password-help" />
          <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xs font-medium text-text-secondary hover:text-text-primary" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button>
        </div>
        <p id="password-help" className="text-xs leading-5 text-text-muted">Use at least 8 characters.</p>
      </div>
      <div className="min-w-0 space-y-2">
        <label className="block text-sm font-medium text-text-secondary" htmlFor="confirmPassword">Confirm New Password</label>
        <input className={accountField} id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} disabled={isLoading} />
      </div>
      <button type="submit" className={accountPrimaryAction} disabled={isLoading}>{isLoading ? 'Saving...' : 'Update Password'}</button>
      <Link href="/sign-in" className={accountSecondaryAction + ' w-full'}>Back to Sign In</Link>
    </form>
  </section></AccountPage>
}
