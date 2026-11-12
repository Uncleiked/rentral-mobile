'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmLeaseRequestAction } from '@/app/actions/lifecycleActions'

export function LeaseCounterpartyControls({ id, kind }: { id: string; kind: 'renewals' | 'terminations' }) {
  const [decision, setDecision] = useState(''), [reason, setReason] = useState(''), [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition(), router = useRouter()
  return <form className="mt-5 space-y-3 min-w-0 max-w-full" onSubmit={event => { event.preventDefault(); startTransition(async () => {
    try { const result = await confirmLeaseRequestAction({ id, kind, decision, reason }); setMessage(result.success ? 'Your response was recorded. Independent review is still required.' : result.error); if (result.success) router.refresh() }
    catch { setMessage('Your response could not be confirmed. Refresh the request before trying again.') }
  }) }}>
    <label className="block text-xs text-text-muted min-w-0 max-w-full">Your response<select required value={decision} onChange={event => setDecision(event.target.value)} disabled={pending} className="mt-1 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary min-h-11 min-w-0 max-w-full"><option value="">Choose a response</option><option value="accept">Agree to these proposed dates</option><option value="reject">Decline this request</option></select></label>
    <label className="block text-xs text-text-muted min-w-0 max-w-full">Response notes<textarea required minLength={15} maxLength={2000} rows={3} value={reason} onChange={event => setReason(event.target.value)} disabled={pending} className="mt-1 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary min-h-11 min-w-0 max-w-full" /></label>
    <button disabled={pending} className="min-h-11 rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50 max-w-full whitespace-normal break-words">{pending ? 'Saving…' : 'Record response'}</button>
    {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </form>
}
