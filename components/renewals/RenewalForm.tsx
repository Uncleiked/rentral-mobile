'use client'

import { useState, useTransition } from 'react'
import { submitRenewalAction } from '@/app/actions/trustActions'

export function RenewalForm({ bookings }: { bookings: { id: string; label: string }[] }) {
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  return <form className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-6" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    startTransition(async () => { try {
      const result = await submitRenewalAction({ bookingId: form.get('bookingId'), reference: form.get('reference'), recipientRoute: form.get('recipientRoute') })
      setMessage(result.success ? 'Renewal submitted for evidence review. It is not yet a verified payment.' : result.error)
    } catch { setMessage('Could not connect. Please try again.') } })
  }}>
    <label className="block text-sm text-text-secondary">Your residential lease<select required name="bookingId" className="mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3">{bookings.map(booking => <option key={booking.id} value={booking.id}>{booking.label}</option>)}</select></label>
    <fieldset className="space-y-3"><legend className="mb-3 text-sm text-text-secondary">Who received your payment this year?</legend><label className="flex items-center gap-3 text-sm"><input required type="radio" name="recipientRoute" value="original_agent" />The original agent</label><label className="flex items-center gap-3 text-sm"><input required type="radio" name="recipientRoute" value="direct_landlord" />The landlord directly</label></fieldset>
    <label className="block text-sm text-text-secondary">Bank transaction reference<input name="reference" minLength={6} maxLength={150} required autoComplete="off" className="mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3" /></label>
    <p className="text-xs leading-relaxed text-text-muted">A reference helps locate evidence. External bank transfers require a supported verification provider or a documented human review. They do not change your verified history automatically.</p>
    <button disabled={pending || !bookings.length} className="rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse disabled:opacity-50">{pending ? 'Submitting…' : 'Submit for review'}</button>
    {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </form>
}
