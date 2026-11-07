'use client'

import { useState, useTransition } from 'react'
import { decideSafetyAppealAction } from '@/app/actions/safetyActions'

export function SafetyAppealControls({ appealId }: { appealId: string }) {
  const [decision, setDecision] = useState('removed')
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pending, startTransition] = useTransition()
  const fieldClass = 'mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
  return <form className="mt-5 space-y-3" onSubmit={event => {
    event.preventDefault()
    startTransition(async () => {
      try {
        const result = await decideSafetyAppealAction({ appealId, decision, reason })
        setFeedback(result.success ? 'Appeal decision saved to the audit trail.' : result.error)
        if (result.success) setSubmitted(true)
      } catch { setFeedback('The decision could not connect. Please retry.') }
    })
  }}>
    <label className="block text-xs text-text-muted">Decision<select value={decision} onChange={event => setDecision(event.target.value)} className={fieldClass}><option value="removed">Accept appeal and remove notice</option><option value="upheld">Uphold the notice after review</option></select></label>
    <label className="block text-xs text-text-muted">Decision shared with the affected account<textarea required minLength={30} maxLength={2000} rows={4} value={reason} onChange={event => setReason(event.target.value)} className={fieldClass} /></label>
    <p className="text-xs leading-relaxed text-text-muted">Explain the evidence and outcome without exposing private information about other people. This decision is final for this appeal and cannot be rewritten.</p>
    <button disabled={pending || submitted} className="min-h-11 w-full rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50 sm:w-auto">{pending ? 'Saving…' : submitted ? 'Decision saved' : 'Save appeal decision'}</button>
    {feedback && <p role="status" className="text-sm text-text-secondary">{feedback}</p>}
  </form>
}
