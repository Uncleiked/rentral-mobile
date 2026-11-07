'use client'

import { useState, useTransition } from 'react'
import { appealSafetyNoticeAction } from '@/app/actions/safetyActions'

export function SafetyAppealForm({ noticeId }: { noticeId: string }) {
  const [statement, setStatement] = useState('')
  const [feedback, setFeedback] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pending, startTransition] = useTransition()
  return <form className="mt-5 space-y-3" onSubmit={event => {
    event.preventDefault()
    startTransition(async () => {
      try {
        const result = await appealSafetyNoticeAction({ noticeId, statement })
        setFeedback(result.success ? 'Your appeal is pending an independent staff review.' : result.error)
        if (result.success) setSubmitted(true)
      } catch { setFeedback('We could not connect. Your response is still here; please retry.') }
    })
  }}>
    <label className="block text-sm text-text-secondary">Your response
      <textarea name="statement" required minLength={30} maxLength={4000} rows={5} value={statement} disabled={pending || submitted} onChange={event => setStatement(event.target.value)} aria-describedby={`appeal-help-${noticeId}`} className="mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-50" />
    </label>
    <p id={`appeal-help-${noticeId}`} className="text-xs leading-relaxed text-text-muted">Explain why the notice should be removed and identify any relevant booking or message evidence. Do not include government ID numbers, bank details or private information about other people. You can submit one appeal for this notice.</p>
    <button disabled={pending || submitted} className="min-h-11 w-full rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50 sm:w-auto">{pending ? 'Submitting…' : submitted ? 'Appeal submitted' : 'Submit appeal'}</button>
    {feedback && <p role="status" className="text-sm leading-relaxed text-text-secondary">{feedback}</p>}
  </form>
}
