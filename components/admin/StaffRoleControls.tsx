'use client'

import { useState, useTransition } from 'react'
import { changeStaffRoleAction } from '@/app/actions/staffActions'
import { STAFF_ROLES } from '@/lib/auth/roles-policy'

type StaffAccount = { id: string; username: string | null; staff_role: string | null }

export function StaffRoleControls({ accounts }: { accounts: StaffAccount[] }) {
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('member')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const field = 'mt-1 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
  return <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface-card p-5">
    <div><h2 className="text-xl font-semibold">Staff access</h2><p className="mt-2 text-sm leading-relaxed text-text-muted">Administrators manage staff; moderators review assets and safety; finance handles payment operations; analysts open Insights. Changes apply to the next request.</p></div>
    <ul className="space-y-3" aria-label="Current staff">{accounts.map(account => <li key={account.id} className="break-words rounded-xl border border-border-subtle p-3 text-sm"><p>@{account.username ?? 'member'} · {account.staff_role}</p><p className="mt-1 break-all font-mono text-xs text-text-muted">{account.id}</p></li>)}</ul>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); setMessage(''); startTransition(async () => {
      try {
        const result = await changeStaffRoleAction({ userId, role, reason })
        setMessage(result.success ? 'Access updated and recorded in the audit trail.' : result.error)
      } catch { setMessage('The result could not be confirmed. Refresh the staff list before trying again.') }
    }) }}>
      <label className="block text-xs text-text-muted">Member ID<input required value={userId} maxLength={36} autoCapitalize="none" spellCheck={false} onChange={event => setUserId(event.target.value.trim())} className={field} /></label>
      <label className="block text-xs text-text-muted">Role<select value={role} onChange={event => setRole(event.target.value)} className={field}><option value="member">Member — remove staff access</option>{STAFF_ROLES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="block text-xs text-text-muted">Reason<textarea required minLength={15} maxLength={2000} rows={3} value={reason} onChange={event => setReason(event.target.value)} className={field} /></label>
      <p className="text-xs leading-relaxed text-text-muted">Ask another administrator to change your own role. This protects independent review and administrator access.</p>
      <button disabled={pending} className="min-h-11 rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50">{pending ? 'Saving…' : 'Save staff access'}</button>
      {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
    </form>
  </section>
}
