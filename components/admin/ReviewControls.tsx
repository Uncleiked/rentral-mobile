'use client'

import { useState, useTransition } from 'react'
import { adminOperationAction } from '@/app/actions/adminActions'

export function ReviewControls({ id, dispute = false }: { id: string; dispute?: boolean }) {
  const [operation, setOperation] = useState(dispute ? 'resolve_dispute' : 'check_address')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  return <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); startTransition(async () => {
    try { const result = await adminOperationAction({ id, operation, reason }); setMessage(result.success ? 'Review saved to the audit log.' : result.error) }
    catch { setMessage('The action could not connect. Please retry.') }
  }) }}>
    <label className="block text-xs text-text-muted">Action<select value={operation} onChange={event => setOperation(event.target.value)} className="mt-1 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary">{dispute ? <option value="resolve_dispute">Resolve report with a written decision</option> : <><option value="check_address">Check recording against address</option><option value="analyze_document">Request AI document screening</option><option value="approve_document">Approve document after human review</option><option value="reject_document">Reject document</option><option value="publish">Publish after every prerequisite passes</option><option value="suspend">Remove from discovery for review</option></>}</select></label>
    <label className="block text-xs text-text-muted">Review notes<textarea required minLength={15} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} rows={3} className="mt-1 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary" /></label>
    <button disabled={pending} className="rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse disabled:opacity-50">{pending ? 'Processing…' : 'Apply review'}</button>
    {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </form>
}
