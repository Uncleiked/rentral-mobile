'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MapPin, ShieldCheck } from 'lucide-react'
import { updateBookingAction, checkInBookingAction, issueHandshakeCodeAction } from '@/app/actions/bookingActions'
import { startBookingPaymentAction, reconcilePaymentAction } from '@/app/actions/paymentActions'
import type { BookingView } from '@/lib/bookings/service'
import { ManualInspectionReview } from './ManualInspectionReview'
import { formatKobo, type BookingOperation } from '@/lib/bookings/policy'

type Props = { booking: BookingView; userId: string; paymentEnabled: boolean }
const buttonClass = 'min-h-11 rounded-xl border border-border-subtle px-5 py-3 text-sm font-semibold transition-colors hover:bg-glass-light disabled:cursor-not-allowed disabled:opacity-50'

export function BookingControls({ booking, userId, paymentEnabled }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [code, setCode] = useState('')
  const [shownCode, setShownCode] = useState('')
  const seeker = userId === booking.seeker_id
  const payment = booking.payments[0]
  const awaiting = booking.status === 'awaiting_payment' && Boolean(booking.expires_at && new Date(booking.expires_at) > new Date())
  const hasCredit = BigInt(booking.hold_credit_kobo) > BigInt(0)

  function update(operation: BookingOperation): void {
    startTransition(async () => {
      setMessage('')
      try { const result = await updateBookingAction(booking.id, operation); if (!result.success) setMessage(result.error); else router.refresh() }
      catch { setMessage('Unable to connect. Please try again.') }
    })
  }

  function checkIn(): void {
    setMessage('Checking your location…')
    if (!navigator.geolocation) { setMessage('Your browser does not support location. Try a supported browser.'); return }
    navigator.geolocation.getCurrentPosition(position => {
      startTransition(async () => {
        try {
          const result = await checkInBookingAction(booking.id, { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString(), ...(seeker ? {} : { code }) })
          if (!result.success) setMessage(result.error); else { setMessage('Your presence was recorded. Both participants must check in within 15 minutes.'); router.refresh() }
        } catch { setMessage('Unable to check in. Your booking has not been changed.') }
      })
    }, () => setMessage('Location was not available. Allow precise location, move outdoors, and retry.'), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 })
  }

  return <div className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-7">
    <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-accent-primary" /><h2 className="font-semibold">Your next step</h2></div>
    {seeker && booking.kind === 'hold' && booking.status === 'confirmed' && booking.settlement_status === 'unsettled' && booking.expires_at && new Date(booking.expires_at) > new Date() && <div className="space-y-3"><p className="text-sm leading-relaxed text-text-muted">Ready to rent? Apply your paid hold once toward a rental for the same dates. The host must accept before the hold expires.</p><Link href={`/marketplace/bookings/new?listing=${booking.listing_id}&kind=rental&hold=${booking.id}`} className={`${buttonClass} inline-flex items-center bg-accent-primary text-text-inverse`}>Use hold toward rental</Link></div>}
    {booking.status === 'converted' && booking.allocated_hold_credit && <p className="text-sm leading-relaxed text-text-muted">This hold has been allocated once to <Link href={`/marketplace/bookings/${booking.allocated_hold_credit.rental_booking_id}`} className="text-accent-primary underline underline-offset-4">your rental booking</Link>. It cannot fund another rental. Settlement remains separate.</p>}
    {hasCredit && <p className="text-sm leading-relaxed text-text-muted">Paid hold credit: {formatKobo(booking.hold_credit_kobo)}. Your checkout collects only the remaining balance. Cancellation or expiry requires review of the already paid hold.</p>}
    {booking.status === 'requested' && <><p className="text-sm leading-relaxed text-text-muted">{seeker ? 'Your request is with the host. You will only be asked to pay after they accept.' : 'Review the dates and total. Accepting reserves rental availability for a 30-minute payment window.'}</p>{!seeker && <button disabled={pending} onClick={() => update('accept')} className={`${buttonClass} bg-accent-primary text-text-inverse`}>Accept request</button>}</>}
    {awaiting && seeker && <><p className="text-sm leading-relaxed text-text-muted">The host accepted. Pay before {new Date(booking.expires_at ?? '').toLocaleString('en-NG')} to confirm your booking.</p><button disabled={pending || !paymentEnabled} className={`${buttonClass} w-full bg-accent-primary text-text-inverse`} onClick={() => startTransition(async () => {
      try { const result = await startBookingPaymentAction(booking.id); if (result.success) window.location.assign(result.data); else setMessage(result.error) }
      catch { setMessage('Unable to open checkout. Check payment status before paying again.') }
    })}>{pending ? 'Preparing checkout…' : 'Continue to secure checkout'}</button>{!paymentEnabled && <p className="text-xs text-text-muted">Online payments are being prepared. Your booking remains unpaid.</p>}</>}
    {payment && seeker && <button disabled={pending || !paymentEnabled} className={buttonClass} onClick={() => startTransition(async () => {
      try { const result = await reconcilePaymentAction(payment.reference); if (result.success) { setMessage(`Payment status: ${result.data.replaceAll('_', ' ')}.`); router.refresh() } else setMessage(result.error) }
      catch { setMessage('Unable to verify payment status. Do not pay again.') }
    })}>Check payment status</button>}
    {booking.status === 'confirmed' && booking.kind === 'inspection' && booking.listing.media_source !== 'approved_gallery' && <div className="space-y-4"><p className="text-sm leading-relaxed text-text-muted">Check in together within 20 metres of the asset. Your location is used to evaluate proximity and is never shared with the other participant.</p>{seeker ? <><button disabled={pending} className={buttonClass} onClick={() => startTransition(async () => { try { const result = await issueHandshakeCodeAction(booking.id); if (result.success) setShownCode(result.data); else setMessage(result.error) } catch { setMessage('Unable to generate a code. Please retry.') } })}>Show my check-in code</button>{shownCode && <p className="text-3xl font-semibold tracking-[0.3em]" aria-label={`Check-in code ${shownCode}`}>{shownCode}</p>}</> : <label className="block text-sm font-medium">Renter&apos;s six-digit code<input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-background-app px-4" /></label>}<button disabled={pending || (!seeker && code.length !== 6)} onClick={checkIn} className={`${buttonClass} inline-flex items-center gap-2`}><MapPin className="size-4" />Check in at the asset</button></div>}
    {booking.kind === 'inspection' && booking.listing.media_source === 'approved_gallery' && <ManualInspectionReview key={`${userId}:${booking.id}`} actorId={userId} bookingId={booking.id} />}
    {booking.status === 'completed' && <p className="text-sm leading-relaxed text-text-muted">{booking.kind === 'inspection' ? (booking.listing.media_source === 'approved_gallery' ? 'The inspection was approved through manual evidence review.' : 'The inspection check-in is complete.') : 'This rental is complete.'} Settlement status: {booking.settlement_status.replaceAll('_', ' ')}. A completed visit does not confirm a provider payout.</p>}
    {booking.status === 'confirmed' && !seeker && booking.kind === 'rental' && new Date(booking.ends_at) <= new Date() && <button disabled={pending} onClick={() => update('complete')} className={buttonClass}>Mark rental complete</button>}
    {['requested', 'awaiting_payment'].includes(booking.status) && <button disabled={pending} onClick={() => update('cancel')} className={`${buttonClass} text-text-muted`}>Cancel request</button>}
    {['confirmed', 'completed', 'disputed'].includes(booking.status) && <p className="text-xs leading-relaxed text-text-muted">Need help with this booking? <Link href="/help" className="underline underline-offset-4">Contact support</Link> for cancellation or payment reconciliation.</p>}
    {message && <p role="status" className="text-sm leading-relaxed text-trust-flagged">{message}</p>}
  </div>
}
