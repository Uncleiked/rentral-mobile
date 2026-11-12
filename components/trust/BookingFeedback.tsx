'use client'

import { useState, useTransition } from 'react'
import { Star, Flag } from 'lucide-react'
import { submitReviewAction, openDisputeAction } from '@/app/actions/trustActions'

export function BookingFeedback({ bookingId, completed }: { bookingId: string; completed: boolean }) {
  const [mode, setMode] = useState<'review' | 'report'>(completed ? 'review' : 'report')
  const [rating, setRating] = useState('5')
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  return <section className="rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6 min-w-0 max-w-full wrap-anywhere text-text-primary">
    <div className="mb-5 flex flex-wrap gap-3">{completed && <button onClick={() => { setMode('review'); setMessage('') }} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm ${mode === 'review' ? 'bg-accent-muted text-accent-hover' : 'text-text-muted'}`}><Star className="size-4" />Leave a review</button>}<button onClick={() => { setMode('report'); setMessage('') }} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm ${mode === 'report' ? 'bg-accent-muted text-accent-hover' : 'text-text-muted'}`}><Flag className="size-4" />Report a problem</button></div>
    <form onSubmit={event => { event.preventDefault(); startTransition(async () => {
      try {
        const result = mode === 'review' ? await submitReviewAction({ bookingId, rating: Number(rating), comment: text }) : await openDisputeAction({ bookingId, reason: text })
        setMessage(result.success ? mode === 'review' ? 'Your review has been saved. Thank you.' : 'Your report has been opened for review.' : result.error)
        if (result.success) setText('')
      } catch { setMessage('Could not connect. Your text is still here; try again.') }
    }) }} className="space-y-4 min-w-0 max-w-full">
      {mode === 'review' && <label className="block text-sm min-w-0 max-w-full">Rating<select value={rating} onChange={event => setRating(event.target.value)} className="ml-3 rounded-lg border border-border-subtle bg-background-app px-3 py-2 min-h-11 min-w-0 max-w-full">{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} {value === 1 ? 'star' : 'stars'}</option>)}</select></label>}
      <label className="block text-sm text-text-secondary min-w-0 max-w-full">{mode === 'review' ? 'Share your experience' : 'Describe what happened'}<textarea value={text} onChange={event => setText(event.target.value)} minLength={mode === 'review' ? 10 : 20} maxLength={mode === 'review' ? 2000 : 4000} required rows={4} className="mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary min-h-11 min-w-0 max-w-full" /></label>
      <button disabled={pending} className="rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse disabled:opacity-50 min-h-11 max-w-full whitespace-normal break-words">{pending ? 'Saving…' : mode === 'review' ? 'Submit review' : 'Open report'}</button>
      {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
    </form>
  </section>
}
