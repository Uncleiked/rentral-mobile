'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { matchingReportInputSchema } from '@/lib/matching/policy'
import { matchingButton, matchingField, matchingIdSchema } from '@/lib/matching/client'
import { useMatchingRequest } from '@/components/account/ApiActorScope'

export function MatchingReport({ profileId, connectionId, messageId }: { profileId: string; connectionId?: string; messageId?: string }) {
  const matchingRequest = useMatchingRequest()
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  return <div className="mt-3">{!open ? <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-sm text-text-muted underline underline-offset-4">Report {messageId ? 'this message' : 'this profile'}</button> : <form className="space-y-3 rounded-xl border border-border-subtle p-4" onSubmit={event => { event.preventDefault(); startTransition(async () => {
    const input = matchingReportInputSchema.safeParse({ profileId, ...(connectionId ? { connectionId } : {}), ...(messageId ? { messageId } : {}), reason })
    if (!input.success) { setMessage('Describe the concern in at least 20 characters.'); return }
    try { await matchingRequest('squat-mates/reports', matchingIdSchema, { method: 'POST', body: input.data }); setMessage('Your private report was received. You can follow its review in report history.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Check report history before trying again.') }
  }) }}><label className="block text-sm text-text-secondary">Describe your concern<textarea required minLength={20} maxLength={4000} rows={3} value={reason} onChange={event => setReason(event.target.value)} className={matchingField} /></label><p className="text-xs leading-relaxed text-text-muted">Independent reviewers can read the selected evidence. Reporting remains available after blocking or withdrawal. A report does not create a public safety notice.</p><div className="flex flex-wrap items-center gap-4"><button disabled={pending || Boolean(message.startsWith('Your private report was received'))} className={matchingButton}>{pending ? 'Submitting…' : 'Send private report'}</button><Link href="/marketplace/squat-mates/reports" className="inline-flex min-h-11 items-center text-sm text-accent-hover">Report history</Link></div>{message && <p role="status" className="text-sm text-text-secondary">{message}</p>}</form>}</div>
}
