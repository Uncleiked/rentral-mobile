'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ShieldCheck, ArrowUpRight } from 'lucide-react'
import { requestBookingAction } from '@/app/actions/bookingActions'
import { BOOKING_KINDS, DAY_MS, quoteBookingBreakdown, nairaToKobo, formatKobo, type BookingKind, type BookingQuote } from '@/lib/bookings/policy'

type Hold = { id: string; amountKobo: string; startsAt: string; endsAt: string; expiresAt: string }
type Props = { listingId: string; category: string; priceNaira: string; metadata?: unknown; initialKind?: BookingKind; enabled: boolean; hold?: Hold }
const inputClass = 'mt-2 min-h-12 w-full min-w-0 max-w-full rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none'

export function BookingRequestForm({ listingId, category, priceNaira, metadata, initialKind = 'inspection', enabled, hold }: Props) {
  const router = useRouter()
  const [kind, setKind] = useState<BookingKind>(initialKind)
  const [holdDays, setHoldDays] = useState(1)
  const localDate = (value: string) => new Date(value).toLocaleString('sv-SE').slice(0, 16).replace(' ', 'T')
  const [startsAt, setStartsAt] = useState(hold ? localDate(hold.startsAt) : '')
  const [endsAt, setEndsAt] = useState(hold ? localDate(hold.endsAt) : '')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const start = new Date(hold?.startsAt ?? startsAt), end = new Date(hold?.endsAt ?? endsAt)
  const validDates = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end > start
  let quote: BookingQuote | null = null
  let quoteError = ''
  if (validDates) {
    try { quote = quoteBookingBreakdown(kind, category, nairaToKobo(priceNaira), start, end, metadata, holdDays) }
    catch { quoteError = 'This listing is unavailable for the selected booking type. Contact the host for its terms.' }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault(); setError('')
    if (!validDates || !quote) { setError(quoteError || 'Choose a start and end time for your request.'); return }
    startTransition(async () => {
      try {
        const result = await requestBookingAction({ listingId, kind, startsAt: start.toISOString(), endsAt: end.toISOString(), holdDays, ...(hold ? { holdBookingId: hold.id } : {}) })
        if (result.success) router.push(`/marketplace/bookings/${result.data.id}`)
        else setError(result.error)
      } catch { setError('Unable to connect. Please try again.') }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-8 min-w-0 max-w-full wrap-anywhere text-text-primary">
      <div className="flex items-center gap-3"><CalendarDays className="size-5 text-accent-primary" /><h2 className="text-xl font-semibold break-words">Plan your next move</h2></div>
      <label className="block text-sm font-medium min-w-0 max-w-full">What would you like to do?
        <select disabled={Boolean(hold)} value={kind} onChange={event => { const next = BOOKING_KINDS.find(value => value === event.target.value); if (next) setKind(next) }} className={inputClass}>
          <option value="inspection">Book an inspection · ₦3,000</option><option value="rental">Request a rental</option><option value="hold">Request a hold · ₦20,000/day</option>
        </select>
      </label>
      {kind === 'hold' && <label className="block text-sm font-medium min-w-0 max-w-full">Hold duration<select className={inputClass} value={holdDays} onChange={event => setHoldDays(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map(days => <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'} · {formatKobo(BigInt(days) * BigInt(2000000))}</option>)}</select><span className="mt-2 block text-xs leading-relaxed text-text-muted">The default policy allocates 70% to the host and 30% to Rentral on expiry. Automatic split payouts remain pending provider acceptance.</span></label>}
      {hold && <p role="status" className="rounded-xl border border-border-subtle bg-background-app p-4 text-sm leading-relaxed text-text-muted">Your paid hold of {formatKobo(hold.amountKobo)} can fund this rental once the host accepts. Complete any remaining payment before {new Date(hold.expiresAt).toLocaleString('en-NG')}. A cancelled or expired conversion needs settlement review.</p>}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium min-w-0 max-w-full">Start date and time<input disabled={Boolean(hold)} type="datetime-local" required value={startsAt} onChange={event => { setStartsAt(event.target.value); if (!endsAt && event.target.value) setEndsAt(new Date(new Date(event.target.value).getTime() + (kind === 'inspection' ? 60 * 60 * 1000 : DAY_MS)).toLocaleString('sv-SE').slice(0, 16).replace(' ', 'T')) }} className={inputClass} /></label>
        <label className="block text-sm font-medium min-w-0 max-w-full">End date and time<input disabled={Boolean(hold)} type="datetime-local" required value={endsAt} onChange={event => setEndsAt(event.target.value)} className={inputClass} /></label>
      </div>
      <div className="rounded-xl bg-background-app p-4 text-sm"><div className="flex items-center justify-between gap-4 min-w-0 flex-wrap"><span className="text-text-muted">Request total</span><strong className="min-w-0 break-words text-lg sm:text-right">{quote ? formatKobo(quote.totalKobo) : 'Choose your dates'}</strong></div>{hold && quote && BigInt(quote.totalKobo) >= BigInt(hold.amountKobo) && <p className="mt-3 text-sm">Remaining after hold credit: <strong>{formatKobo(BigInt(quote.totalKobo) - BigInt(hold.amountKobo))}</strong></p>}<p className="mt-3 text-xs leading-relaxed text-text-muted">{kind === 'inspection' ? 'Meet the host, view the asset, and check in on site. Payment is requested after the host accepts.' : kind === 'hold' ? 'A paid hold protects the entire asset for the selected duration. Request the same rental dates before expiry to apply it once toward your rental. Default split payouts are pending provider acceptance.' : 'Base rate follows the listed period. Annual rates use 365 days; monthly rates use 30 days. Listed fees apply once; caution deposit refund terms require agreement with the host.'}</p></div>
      {quote && quote.fees.length > 0 && <dl className="space-y-2 text-sm text-text-muted"><div className="flex justify-between min-w-0 flex-wrap gap-3"><dt>Rental subtotal</dt><dd className="min-w-0 break-words text-right">{formatKobo(quote.baseKobo)}</dd></div>{quote.fees.map(fee => <div key={fee.label} className="flex justify-between gap-4 min-w-0 flex-wrap"><dt>{fee.label}</dt><dd className="min-w-0 break-words text-right">{formatKobo(fee.amountKobo)}</dd></div>)}</dl>}<div className="flex items-start gap-3 text-sm text-text-muted"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent-primary" /><p>The host reviews your request first. Sending a request never charges you.</p></div>
      {quoteError && <p role="alert" className="text-sm text-trust-flagged">{quoteError}</p>}{error && <p role="alert" className="text-sm text-trust-flagged">{error}</p>}
      {!enabled && <p role="status" className="text-sm text-text-muted">Reservations are being prepared. You can explore the available options here.</p>}
      <button disabled={pending || !enabled || Boolean(quoteError)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-primary px-5 py-3 font-semibold text-text-inverse transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 min-h-11 max-w-full whitespace-normal break-words">{pending ? 'Sending request…' : 'Send request'}<ArrowUpRight className="size-4" /></button>
    </form>
  )
}
