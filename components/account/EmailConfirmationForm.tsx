'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { accountEmailConfirmResultSchema, accountEmailConfirmSchema } from '@/lib/contracts/account-security'
import { accountSecurityRequest } from '@/lib/account-security-client'
import { accountField, accountPrimaryAction } from '@/components/ui/account-styles'

export function EmailConfirmationForm({ onConfirmed }: { onConfirmed?: (completed: boolean) => void | Promise<void> }) {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null), [error, setError] = useState<string | null>(null)
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null)
    try {
      const input = accountEmailConfirmSchema.safeParse({ token: code.trim() })
      if (!input.success) { setError('Paste your complete 43-character confirmation code.'); return }
      const result = await accountSecurityRequest('/email-change/confirm', accountEmailConfirmResultSchema, { method: 'POST', body: input.data })
      setCode('')
      setMessage(result.status === 'completed' ? 'Both email addresses are confirmed. Sign in using your new address.' : 'One address is confirmed. Enter the separate code sent to the other inbox to complete the change.')
      await onConfirmed?.(result.status === 'completed')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Confirmation could not be completed. Check your account status before retrying.') }
    finally { setBusy(false) }
  }
  return <div className="min-w-0 max-w-full space-y-5">
    <p className="text-sm leading-relaxed text-text-secondary">Each inbox receives a separate code. Your sign-in address changes after both are confirmed. Codes expire in 15 minutes.</p>
    <form onSubmit={confirm} className="min-w-0 space-y-4" aria-busy={busy}>
      <label className="block min-w-0 space-y-2 text-sm text-text-secondary"><span>Confirmation code</span><input value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} minLength={43} maxLength={43} required disabled={busy}
        className={accountField} /></label>
      <button type="submit" disabled={busy} className={accountPrimaryAction}>{busy ? 'Confirming…' : 'Confirm this inbox'}</button>
    </form>
    {error && <p role="alert" className="break-words text-sm text-trust-flagged">{error}</p>}
    {message && <p role="status" className="break-words text-sm text-accent-hover">{message}</p>}
    <div className="flex flex-wrap gap-x-5 text-sm"><Link href="/sign-in" className="inline-flex min-h-11 items-center text-accent-hover underline underline-offset-4">Sign in</Link><Link href="/marketplace/profile#account-security" className="inline-flex min-h-11 items-center text-text-secondary underline underline-offset-4">Account settings</Link></div>
  </div>
}
