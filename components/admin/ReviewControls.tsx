'use client'

import { useState, useTransition } from 'react'
import { adminOperationAction } from '@/app/actions/adminActions'

export function ReviewControls({ id, dispute = false }: { id: string; dispute?: boolean }) {
  const [operation, setOperation] = useState(dispute ? 'resolve_dispute' : 'check_address')
  const [reason, setReason] = useState('')
  const [resolution, setResolution] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  return <form className="mt-5 space-y-3 min-w-0 max-w-full" onSubmit={event => { event.preventDefault(); startTransition(async () => {
    try { const result = await adminOperationAction({ id, operation, reason, ...(dispute ? { resolution } : {}) }); setMessage(result.success ? (dispute ? 'Review saved to the audit log. Refunds and payouts remain separate.' : 'Review saved to the audit log.') : result.error) }
    catch { setMessage('The action could not be confirmed. Refresh this page before trying again.') }
  }) }}>
    <label className="block text-xs text-text-muted min-w-0 max-w-full">Action<select value={operation} onChange={event => setOperation(event.target.value)} className="mt-1 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary min-h-11 min-w-0 max-w-full">{dispute ? <option value="resolve_dispute">Resolve report with a written decision</option> : <><option value="check_address">Check recording against address</option><option value="approve_document">Approve document after human review</option><option value="reject_document">Reject document</option><option value="publish">Publish after every prerequisite passes</option><option value="suspend">Remove from discovery for review</option></>}</select></label>
    {dispute && <><label className="block text-xs text-text-muted min-w-0 max-w-full">Booking outcome<select required value={resolution} onChange={event => setResolution(event.target.value)} className="mt-1 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary min-h-11 min-w-0 max-w-full"><option value="">Choose the reviewed outcome</option><option value="resume">Restore an eligible active booking</option><option value="complete">Complete with recorded supporting evidence</option><option value="cancel">Cancel reservation and flag paid funds for review</option></select></label><p className="text-xs leading-relaxed text-text-muted">Other open reports keep the booking disputed. This review never sends a refund or payout.</p></>}
    <label className="block text-xs text-text-muted min-w-0 max-w-full">Review notes<textarea required minLength={dispute ? 30 : 15} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} rows={3} className="mt-1 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary min-h-11 min-w-0 max-w-full" /></label>
    <button disabled={pending} className="rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse disabled:opacity-50 min-h-11 max-w-full whitespace-normal break-words">{pending ? 'Processing…' : 'Apply review'}</button>
    {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </form>
}
