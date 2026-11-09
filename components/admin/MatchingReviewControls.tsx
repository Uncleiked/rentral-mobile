'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { matchingButton, matchingField } from '@/lib/matching/client'
import { useMatchingRequest } from '@/components/account/ApiActorScope'

export function MatchingReviewControls({ id, restore = false, canRestore = true }: { id: string; restore?: boolean; canRestore?: boolean }) {
  const matchingRequest = useMatchingRequest()
  const [decision, setDecision] = useState(''), [reason, setReason] = useState(''), [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition(), router = useRouter()
  if (restore && !canRestore) return <p className="mt-4 text-xs text-text-muted">A different reviewer independent of both participants must decide restoration.</p>
  return <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); startTransition(async () => {
    try {
      if (restore) await matchingRequest(`staff/matching/profiles/${id}/restore`, z.object({ restored: z.literal(true) }), { method: 'POST', body: { reason } })
      else await matchingRequest(`staff/matching/reports/${id}`, z.object({ reviewed: z.literal(true) }), { method: 'PATCH', body: { decision, reason } })
      setMessage('Review recorded. Refreshing the current queue.'); router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Refresh the queue before trying again.') }
  }) }}>
    {!restore && <label className="block text-sm text-text-secondary">Decision<select required value={decision} onChange={event => setDecision(event.target.value)} className={matchingField}><option value="">Choose an evidence-based decision</option><option value="resolve">Resolve without restricting matching</option><option value="restrict">Restrict this matching profile</option></select></label>}
    <label className="block text-sm text-text-secondary">Independent review notes<textarea required minLength={30} maxLength={2000} rows={3} value={reason} onChange={event => setReason(event.target.value)} className={matchingField} /></label>
    <p className="text-xs leading-relaxed text-text-muted">{restore ? 'Restoration clears the matching restriction and preserves the owner’s visibility choice. The original reviewer and both participants cannot restore it.' : 'Only the reported evidence is shown. This decision affects matching access and never creates a public safety notice.'}</p>
    <button disabled={pending} className={matchingButton}>{pending ? 'Saving…' : restore ? 'Restore matching eligibility' : 'Record review'}</button>{message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </form>
}
