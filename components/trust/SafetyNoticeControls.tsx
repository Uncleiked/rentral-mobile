'use client'

import { useState, useTransition } from 'react'
import { issueSafetyNoticeAction } from '@/app/actions/safetyActions'
import { safetyCategories, safetyCategoryLabels } from '@/lib/trust/safety-policy'

export function SafetyNoticeControls({ disputeId }: { disputeId: string }) {
  const [category, setCategory] = useState<string>('misrepresentation')
  const [reason, setReason] = useState('')
  const [evidenceReviewed, setEvidenceReviewed] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pending, startTransition] = useTransition()
  const fieldClass = 'mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
  return <form className="mt-5 space-y-3" onSubmit={event => {
    event.preventDefault()
    startTransition(async () => {
      try {
        const result = await issueSafetyNoticeAction({ disputeId, category, reason, evidenceReviewed })
        setFeedback(result.success ? 'Safety notice issued and decision recorded in the audit trail.' : result.error)
        if (result.success) setSubmitted(true)
      } catch { setFeedback('The review could not connect. Please retry.') }
    })
  }}>
    <label className="block text-xs text-text-muted">Reviewed concern<select value={category} onChange={event => setCategory(event.target.value)} className={fieldClass}>{safetyCategories.map(value => <option key={value} value={value}>{safetyCategoryLabels[value]}</option>)}</select></label>
    <label className="block text-xs text-text-muted">Finding and evidence reviewed<textarea required minLength={30} maxLength={2000} rows={4} value={reason} onChange={event => setReason(event.target.value)} className={fieldClass} /></label>
    <p className="text-xs leading-relaxed text-text-muted">These reasons are visible to the affected account and staff. Do not disclose the reporter’s identity, government identifiers or sensitive evidence here. A report or low rating alone does not establish a safety finding.</p>
    <label className="flex min-h-11 items-start gap-3 py-2 text-xs leading-relaxed text-text-secondary"><input type="checkbox" required checked={evidenceReviewed} onChange={event => setEvidenceReviewed(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent-primary" />I independently reviewed the booking and available evidence and confirm a public caution notice is warranted.</label>
    <button disabled={pending || submitted || !evidenceReviewed} className="min-h-11 w-full rounded-xl border border-glass-border-warning bg-glass-warning px-5 py-3 text-sm font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50 sm:w-auto">{pending ? 'Saving…' : submitted ? 'Notice issued' : 'Issue reviewed safety notice'}</button>
    {feedback && <p role="status" className="text-sm text-text-secondary">{feedback}</p>}
  </form>
}
