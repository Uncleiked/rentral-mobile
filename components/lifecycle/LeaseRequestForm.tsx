'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'

type LeaseChoice = { id: string; label: string }
const successEnvelope = z.object({ success: z.literal(true), data: z.object({ id: z.uuid() }).strict() }).strict()
const errorEnvelope = z.object({ success: z.literal(false), error: z.string().max(1000), code: z.string().max(100) }).strict()
const fileTypes: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }

export function LeaseRequestForm({ userId, bookings, kind }: { userId: string; bookings: LeaseChoice[]; kind: 'renewals' | 'terminations' }) {
  const router = useRouter(), fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null), [evidencePath, setEvidencePath] = useState<string | null>(null)
  const [message, setMessage] = useState(''), [unconfirmed, setUnconfirmed] = useState(false), [submitted, setSubmitted] = useState(false)
  const [pending, startTransition] = useTransition()
  return <form className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-6" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    if (pending || unconfirmed || submitted || !file) return
    startTransition(async () => {
      let posting = false
      try {
        const value = form.get('requestedEnd'), date = typeof value === 'string' ? new Date(value) : new Date('invalid')
        if (!Number.isFinite(date.getTime())) { setMessage('Choose a valid lease end date and time.'); return }
        let path = evidencePath
        if (!path) {
          path = `${userId}/${crypto.randomUUID()}/lease-evidence.${fileTypes[file.type]}`
          const upload = await fetch('/api/v1/uploads/compliance-docs', { method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': file.type, 'X-Upload-Path': path }, body: file, signal: AbortSignal.timeout(60000) })
          const body: unknown = await upload.json()
          const uploaded = z.object({ success: z.literal(true), data: z.object({ path: z.literal(path) }) }).safeParse(body)
          if (!upload.ok || !uploaded.success) {
            if (upload.status >= 500 || upload.ok) { setUnconfirmed(true); setMessage('The document upload could not be confirmed. Your selected file was retained. Refresh your requests before trying again.'); return }
            const failure = errorEnvelope.safeParse(body); setMessage(failure.success ? failure.data.error : 'This document could not be uploaded. Choose a PDF, JPEG or PNG up to 10 MB.'); return
          }
          setEvidencePath(path)
        }
        const data = kind === 'renewals' ? { bookingId: form.get('bookingId'), reference: form.get('reference'), recipientRoute: form.get('recipientRoute'), requestedEndsAt: date.toISOString(), evidencePath: path }
          : { bookingId: form.get('bookingId'), reason: form.get('reason'), requestedEndAt: date.toISOString(), evidencePath: path }
        posting = true
        const response = await fetch(`/api/v1/${kind}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(20000) })
        const body: unknown = await response.json(), success = successEnvelope.safeParse(body)
        if (response.ok && success.success) { setSubmitted(true); setMessage('Request recorded. Both participants and an independent reviewer must confirm it. Payment records remain separate.'); router.refresh(); return }
        const failure = errorEnvelope.safeParse(body)
        if (response.status >= 500 || !failure.success) { setUnconfirmed(true); setMessage('Submission could not be confirmed. Your document and form were retained. Refresh the request history before trying again.'); return }
        setMessage(failure.data.error)
      } catch {
        setUnconfirmed(true)
        setMessage(posting ? 'Submission could not be confirmed. Refresh your request history before trying again. Your document was retained.' : 'The upload could not be confirmed. Your selected document was retained. Check your connection and refresh before trying again.')
      }
    })
  }}>
    <h2 className="text-lg font-semibold">{kind === 'renewals' ? 'Request a lease extension' : 'Request an agreed early lease end'}</h2>
    <label className="block text-sm text-text-secondary">Residential lease<select required name="bookingId" disabled={pending || unconfirmed || submitted} className="mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3">{bookings.map(booking => <option key={booking.id} value={booking.id}>{booking.label}</option>)}</select></label>
    <label className="block text-sm text-text-secondary">Proposed end date and time<input type="datetime-local" name="requestedEnd" required disabled={pending || unconfirmed || submitted} className="mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3" /></label>
    {kind === 'renewals' ? <><label className="block text-sm text-text-secondary">Payment recipient<select required name="recipientRoute" disabled={pending || unconfirmed || submitted} className="mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3"><option value="original_agent">Original agent</option><option value="direct_landlord">Landlord directly</option></select></label><label className="block text-sm text-text-secondary">External transaction reference<input required name="reference" minLength={6} maxLength={150} disabled={pending || unconfirmed || submitted} autoComplete="off" className="mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3" /></label><p className="text-xs leading-relaxed text-text-muted">To complete an old incomplete renewal, use its original reference. Reviewing this reference does not verify a provider payment.</p></> : <label className="block text-sm text-text-secondary">Reason<textarea required name="reason" minLength={20} maxLength={4000} rows={4} disabled={pending || unconfirmed || submitted} className="mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3" /></label>}
    <label className="block text-sm text-text-secondary">Supporting receipt or agreement<input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png" required disabled={pending || unconfirmed || submitted} className="mt-2 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm" onChange={event => {
      const chosen = event.target.files?.[0]
      if (!chosen) return
      if (!fileTypes[chosen.type] || chosen.size <= 0 || chosen.size > 10 * 1024 * 1024) { setMessage('Choose a non-empty PDF, JPEG or PNG up to 10 MB.'); setFile(null); if (fileInput.current) fileInput.current.value = ''; return }
      setFile(chosen); setEvidencePath(null); setMessage('')
    }} /></label>
    <p className="text-xs leading-relaxed text-text-muted">Only lease participants and authorized reviewers can open supporting evidence. Existing dates stay unchanged until the required decisions take effect. No refund or payout is implied.</p>
    <button disabled={pending || unconfirmed || submitted || !bookings.length || !file} className="min-h-11 rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50">{pending ? 'Submitting…' : 'Submit request'}</button>
    {(unconfirmed || submitted) && <button type="button" onClick={() => router.refresh()} className="ml-3 min-h-11 rounded-xl border border-border-subtle px-4 py-3 text-sm text-text-secondary">Refresh request history</button>}
    {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </form>
}
