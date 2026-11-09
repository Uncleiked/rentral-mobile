'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { commercialButton, commercialField } from '@/lib/commerce/client'
import { useCommercialRequest } from '@/components/account/ApiActorScope'
export function CampaignReviewControls({ id, status }: { id: string; status: string }) {
  const commercialRequest = useCommercialRequest()
  const [decision, setDecision] = useState(status === 'approved' ? 'pause' : ''), [reason, setReason] = useState(''), [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition(), router = useRouter()
  return <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); startTransition(async () => { try {
    await commercialRequest(`staff/campaigns/${id}`, z.object({ reviewed: z.literal(true) }), 'PATCH', { decision, reason }); setMessage('Campaign review recorded. Payment and financial settlement remain separate.'); router.refresh()
  } catch (error) { setMessage(error instanceof Error ? error.message : 'Refresh the current review queue before trying again.') } }) }}>
    <label className="block text-sm text-text-secondary">Decision<select required value={decision} onChange={event => setDecision(event.target.value)} className={commercialField}>{status === 'approved' ? <option value="pause">Pause delivery for documented review</option> : <><option value="">Choose the reviewed outcome</option><option value="approve">Approve the listed content and fixed window</option><option value="reject">Reject the campaign with a reason</option></>}</select></label><label className="block text-sm text-text-secondary">Independent review notes<textarea required minLength={30} maxLength={2000} rows={3} value={reason} onChange={event => setReason(event.target.value)} className={commercialField} /></label><p className="text-xs text-text-muted">Review does not collect money, guarantee impressions or create a refund. The owner cannot approve their own campaign.</p><button disabled={pending} className={commercialButton}>{pending ? 'Saving…' : 'Record campaign review'}</button>{message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </form>
}
