'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { z } from 'zod'
import { accountEmailChangeResultSchema, accountEmailChangeRequestSchema, accountPasswordResultSchema, accountPasswordSchema,
  accountSecuritySchema, accountSessionRevocationSchema, accountSessionsSchema, type AccountSecurity, type AccountSessions } from '@/lib/contracts/account-security'
import { accountSecurityRequest } from '@/lib/account-security-client'
import { EmailConfirmationForm } from '@/components/account/EmailConfirmationForm'

const inputClass = 'w-full min-w-0 rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
const buttonClass = 'min-h-11 max-w-full whitespace-normal rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-sm font-semibold text-text-primary hover:bg-glass-light-hover disabled:opacity-50'
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block min-w-0 space-y-2 text-sm text-text-secondary"><span>{label}</span>{children}</label> }

export function SecurityCard({ userId }: { userId: string }) {
  const router = useRouter(), requestId = useRef(0)
  const [account, setAccount] = useState<AccountSecurity | null>(null), [sessions, setSessions] = useState<AccountSessions | null>(null)
  const [busy, setBusy] = useState<string | null>('loading'), [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null)
  const [password, setPassword] = useState(''), [replacement, setReplacement] = useState(''), [confirmation, setConfirmation] = useState('')
  const [email, setEmail] = useState(''), [emailPassword, setEmailPassword] = useState('')
  const fetchData = useCallback((signal?: AbortSignal) => Promise.allSettled([
    accountSecurityRequest('/account', accountSecuritySchema, { expectedUserId: userId, signal }), accountSecurityRequest('/sessions', accountSessionsSchema, { expectedUserId: userId, signal }),
  ]), [userId])
  const receive = useCallback((result: Awaited<ReturnType<typeof fetchData>>) => {
    if (result[0].status === 'fulfilled') setAccount(result[0].value)
    if (result[1].status === 'fulfilled') setSessions(result[1].value)
    const failed = result.find(item => item.status === 'rejected')
    setError(failed?.status === 'rejected' ? failed.reason instanceof Error ? failed.reason.message : 'Account details could not be loaded.' : null)
    setBusy(null)
  }, [])
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const started = ++requestId.current, result = await fetchData(signal)
    if (!signal?.aborted && started === requestId.current) receive(result)
  }, [fetchData, receive])
  useEffect(() => {
    const controller = new AbortController(), started = ++requestId.current
    void fetchData(controller.signal).then(result => { if (!controller.signal.aborted && started === requestId.current) receive(result) })
    return () => controller.abort()
  }, [fetchData, receive])
  function signInAgain() { router.replace('/sign-in'); router.refresh() }
  async function act(name: string, run: () => Promise<void>) {
    setBusy(name); setError(null); setMessage(null)
    try { await run() } catch (reason) { setError(reason instanceof Error ? reason.message : 'The account action could not be confirmed. Refresh before continuing.') }
    finally { setBusy(null) }
  }
  async function passwordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (replacement !== confirmation) { setError('Make sure the two new passwords match.'); return }
    const parsed = accountPasswordSchema.safeParse({ currentPassword: password, newPassword: replacement })
    if (!parsed.success) { setError('Enter your current password and a new password of at least 8 characters.'); return }
    await act('password', async () => {
      await accountSecurityRequest('/password', accountPasswordResultSchema, { method: 'POST', body: parsed.data, expectedUserId: userId })
      setPassword(''); setReplacement(''); setConfirmation(''); signInAgain()
    })
  }
  async function emailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = accountEmailChangeRequestSchema.safeParse({ newEmail: email, currentPassword: emailPassword })
    if (!parsed.success) { setError('Enter a valid new email address and your current password.'); return }
    await act('email', async () => {
      try {
        const result = await accountSecurityRequest('/email-change', accountEmailChangeResultSchema, { method: 'POST', body: parsed.data, expectedUserId: userId })
        setMessage(result.delivery === 'email' ? 'Confirmation messages are queued for both inboxes.' : 'Ask your Rentral operator for the separate confirmation codes.')
        setEmail(''); await refresh()
      } finally { setEmailPassword('') }
    })
  }
  async function revoke(id?: string) {
    await act(`session:${id ?? 'all'}`, async () => {
      const result = await accountSecurityRequest(`/sessions${id ? `/${id}` : ''}`, accountSessionRevocationSchema, { method: 'DELETE', expectedUserId: userId })
      if (result.current || result.signInRequired) signInAgain()
      else { setMessage('The selected session has been signed out.'); await refresh() }
    })
  }
  async function olderSessions() {
    if (!sessions?.nextCursor) return
    await act('older', async () => {
      const page = await accountSecurityRequest(`/sessions?${new URLSearchParams({ cursor: sessions.nextCursor! })}`, accountSessionsSchema, { expectedUserId: userId })
      setSessions(current => ({ items: [...new Map([...(current?.items ?? []), ...page.items].map(item => [item.id, item])).values()], nextCursor: page.nextCursor }))
    })
  }
  return <section id="account-security" aria-labelledby="account-security-title" className="min-w-0 max-w-full scroll-mt-24 space-y-6 rounded-2xl border border-border-subtle bg-surface-card p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-accent-hover" /><h2 id="account-security-title" className="text-lg font-semibold text-text-primary">Account security</h2></div>
      <button type="button" className={buttonClass} disabled={Boolean(busy)} onClick={() => { setBusy('loading'); void refresh() }}>Refresh status</button></div>
    <p className="text-sm leading-relaxed text-text-muted">Keep your password private and review active sign-ins. Password and completed email changes sign out all existing sessions.</p>
    {busy === 'loading' && <p role="status" className="text-sm text-text-muted">Loading account details…</p>}
    {error && <p role="alert" className="break-words text-sm text-trust-flagged">{error}</p>}
    {message && <p role="status" className="break-words text-sm text-accent-hover">{message}</p>}
    {account && <div className="grid min-w-0 grid-cols-1 gap-7 lg:grid-cols-2">
      <form onSubmit={passwordSubmit} className="min-w-0 space-y-4"><h3 className="text-sm font-semibold text-text-primary">Change password</h3>
        <Field label="Current password"><input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className={inputClass} disabled={Boolean(busy)} /></Field>
        <Field label="New password"><input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={replacement} onChange={event => setReplacement(event.target.value)} className={inputClass} disabled={Boolean(busy)} /></Field>
        <Field label="Confirm new password"><input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className={inputClass} disabled={Boolean(busy)} /></Field>
        <button type="submit" disabled={Boolean(busy)} className="min-h-11 w-full rounded-xl bg-accent-primary px-4 py-3 text-sm font-semibold text-text-inverse hover:bg-accent-hover disabled:opacity-50">{busy === 'password' ? 'Updating…' : 'Update password and sign out'}</button>
      </form>
      <div className="min-w-0 space-y-4"><h3 className="text-sm font-semibold text-text-primary">Email address</h3><p className="break-all text-sm text-text-secondary">{account.email}</p>
        {account.emailChange ? <div className="min-w-0 space-y-4 rounded-xl border border-border-subtle bg-background-app p-4">
          <p className="break-all text-sm text-text-secondary">Requested address: {account.emailChange.newEmail}</p>
          <p className="text-xs leading-relaxed text-text-muted">Current inbox: {account.emailChange.oldConfirmed ? 'confirmed' : 'waiting'}. New inbox: {account.emailChange.newConfirmed ? 'confirmed' : 'waiting'}. Expires {new Date(account.emailChange.expiresAt).toLocaleTimeString()}.</p>
          <EmailConfirmationForm onConfirmed={async complete => { if (complete) signInAgain(); else await refresh() }} />
          <button type="button" disabled={Boolean(busy)} className={buttonClass} onClick={() => void act('cancel-email', async () => { await accountSecurityRequest('/email-change', z.object({ cancelled: z.literal(true) }), { method: 'DELETE', expectedUserId: userId }); await refresh() })}>Cancel email change</button>
        </div> : <form onSubmit={emailSubmit} className="space-y-4">
          <Field label="New email address"><input type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} className={inputClass} disabled={Boolean(busy) || account.delivery === 'unavailable'} /></Field>
          <Field label="Password to authorize email change"><input type="password" autoComplete="current-password" maxLength={128} required value={emailPassword} onChange={event => setEmailPassword(event.target.value)} className={inputClass} disabled={Boolean(busy) || account.delivery === 'unavailable'} /></Field>
          <p className="text-xs leading-relaxed text-text-muted">{account.delivery === 'unavailable' ? 'Email confirmations are unavailable. Contact the Rentral operator.' : 'Both the current and new inbox must confirm before your address changes.'}</p>
          <button type="submit" className={buttonClass} disabled={Boolean(busy) || account.delivery === 'unavailable'}>{busy === 'email' ? 'Requesting…' : 'Request email change'}</button>
        </form>}
      </div>
    </div>}
    {sessions && <div className="space-y-4 border-t border-border-subtle pt-6"><h3 className="text-sm font-semibold text-text-primary">Active sessions</h3>
      {sessions.items.length === 0 && <p className="text-sm text-text-muted">No active sessions were found. Refresh or sign in again.</p>}
      <ul className="space-y-3">{sessions.items.map(session => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-background-app p-4"><div className="min-w-0"><p className="text-sm text-text-secondary">{session.current ? 'This session' : 'Another session'}</p><p className="mt-1 text-xs text-text-muted">Started {new Date(session.createdAt).toLocaleString()} · Expires {new Date(session.expiresAt).toLocaleDateString()}</p></div>
        <button type="button" disabled={Boolean(busy)} className={buttonClass} onClick={() => void revoke(session.id)}>Sign out {session.current ? 'this session' : 'session'}</button></li>)}</ul>
      <div className="flex flex-wrap gap-3">{sessions.nextCursor && <button type="button" disabled={Boolean(busy)} className={buttonClass} onClick={() => void olderSessions()}>Load older sessions</button>}<button type="button" disabled={Boolean(busy)} className={buttonClass} onClick={() => void revoke()}>Sign out all sessions</button></div>
    </div>}
    <div className="flex flex-wrap gap-5 text-sm"><Link href="/forgot-password" className="text-accent-hover underline underline-offset-4">Recover a forgotten password</Link><Link href="/confirm-email" className="text-text-muted underline underline-offset-4">Enter an email confirmation code</Link></div>
  </section>
}
