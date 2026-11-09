'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acknowledgeLifecycleFailureAction, reconcileLifecycleEmailAction, reviewLifecycleAction } from '@/app/actions/lifecycleActions'

export function LifecycleReviewControls({ id, kind, canManage = true, notificationId }: { id: string; kind: 'renewals' | 'terminations' | 'failures'; canManage?: boolean; notificationId?: string }) {
  const [decision, setDecision] = useState(''), [reason, setReason] = useState(''), [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition(), router = useRouter()
  if (!canManage) return <p className="mt-4 text-xs text-text-muted">Your role can read this incident. A moderator can record its review.</p>
  return <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); startTransition(async () => {
    try {
      const result = kind === 'failures' ? await acknowledgeLifecycleFailureAction({ id, reason }) : await reviewLifecycleAction({ id, kind, decision, reason })
      setMessage(result.success ? (kind === 'failures' ? 'Incident reviewed. The underlying record was preserved.' : 'Decision saved. Financial settlement remains separate.') : result.error)
      if (result.success) router.refresh()
    } catch { setMessage('This review could not be confirmed. Refresh before trying again.') }
  }) }}>
    {kind !== 'failures' && <label className="block text-xs text-text-muted">Decision<select required value={decision} onChange={event => setDecision(event.target.value)} className="mt-1 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary"><option value="">Choose the reviewed outcome</option><option value="approve">Approve after every requirement passes</option><option value="reject">Reject with a documented reason</option></select></label>}
    <label className="block text-xs text-text-muted">Review notes<textarea required minLength={30} maxLength={2000} rows={3} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary" /></label>
    <p className="text-xs leading-relaxed text-text-muted">{kind === 'failures' ? 'Recording this review does not resend an email, alter a booking, or move money. A later failure will reopen the incident.' : 'Approval requires both participants and an independent evidence review. Existing payment records are preserved.'}</p>
    <button disabled={pending} className="min-h-11 rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50">{pending ? 'Saving…' : kind === 'failures' ? 'Mark incident reviewed' : 'Save decision'}</button>
    {notificationId && <button type="button" disabled={pending} className="ml-3 min-h-11 rounded-xl border border-border-subtle px-4 py-3 text-sm text-text-secondary disabled:opacity-50" onClick={() => {
      if (reason.trim().length < 30) { setMessage('Add review notes of at least 30 characters before checking a provider receipt.'); return }
      startTransition(async () => { try {
        const result = await reconcileLifecycleEmailAction({ id: notificationId, reason })
        setMessage(result.success ? `Provider lookup: ${result.data.status.replaceAll('_', ' ')}. The email was not resent.` : result.error)
        if (result.success) router.refresh()
      } catch { setMessage('The provider lookup could not be confirmed. The email was not resent.') } })
    }}>Check existing email receipt</button>}
    {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </form>
}
