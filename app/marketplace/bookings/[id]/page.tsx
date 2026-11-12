import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { requireUserId } from '@/lib/action-helpers'
import { getBookingForParticipant } from '@/lib/bookings/service'
import { formatKobo, bookingQuoteSchema } from '@/lib/bookings/policy'
import { paymentsEnabled } from '@/lib/payments/config'
import { platformEnabled } from '@/lib/platform'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { BookingControls } from '@/components/bookings/BookingControls'
import { BookingFeedback } from '@/components/trust/BookingFeedback'

type Props = { params: Promise<{ id: string }> }
export const metadata = { title: 'Booking details · Rentral' }

export default async function BookingDetailPage({ params }: Props) {
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success || !platformEnabled()) notFound()
  const booking = await getBookingForParticipant(id, userId)
  if (!booking) notFound()
  const quote = bookingQuoteSchema.safeParse(booking.pricing_snapshot)
  const credit = BigInt(booking.hold_credit_kobo)
  const creditSummary = credit > BigInt(0) ? <div className="mb-6 rounded-2xl border border-border-subtle bg-surface-card p-5 text-sm sm:p-7 min-w-0 max-w-full wrap-anywhere text-text-primary"><dl className="space-y-3"><div className="flex justify-between gap-4 min-w-0 flex-wrap"><dt className="text-text-muted">Paid hold credit</dt><dd>{formatKobo(credit)}</dd></div><div className="flex justify-between gap-4 min-w-0 flex-wrap"><dt className="text-text-muted">Additional payment</dt><dd className="font-semibold">{formatKobo(BigInt(booking.amount_kobo) - credit)}</dd></div></dl><p className="mt-3 text-xs text-text-muted">The total below is the complete rental package. Checkout collects only the additional payment.</p></div> : null
  return <MarketplaceShell><div className="mx-auto max-w-4xl min-w-0 w-full"><Link href="/marketplace/bookings" className="mb-7 inline-flex min-h-11 items-center gap-2 text-sm text-text-muted max-w-full break-words"><ArrowLeft className="size-4" />Your bookings</Link><div className="mb-8 flex flex-wrap items-start justify-between gap-4 min-w-0"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-primary">{booking.kind}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight break-words">Your booking, at a glance.</h1><p className="mt-3 text-sm text-text-muted">{booking.listing.text_address}</p></div><span className="rounded-full border border-border-subtle bg-surface-card px-4 py-2 text-xs font-medium capitalize min-w-0 max-w-full wrap-anywhere text-text-primary">{booking.status.replaceAll('_', ' ')}</span></div>{creditSummary}<div className="grid items-start gap-6 md:grid-cols-2"><div className="space-y-6 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-7 min-w-0 max-w-full wrap-anywhere text-text-primary"><h2 className="font-semibold break-words">Booking details</h2><dl className="space-y-5 text-sm"><div><dt className="text-text-muted">Starts</dt><dd className="mt-1 font-medium">{new Date(booking.starts_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' })} WAT</dd></div><div><dt className="text-text-muted">Ends</dt><dd className="mt-1 font-medium">{new Date(booking.ends_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' })} WAT</dd></div><div className="flex items-center justify-between border-t border-border-subtle pt-5 min-w-0 flex-wrap gap-3"><dt className="text-text-muted">Total · NGN</dt><dd className="text-xl font-semibold">{formatKobo(booking.amount_kobo)}</dd></div>{quote.success && quote.data.fees.map(fee => <div key={fee.label} className="flex items-center justify-between gap-4 min-w-0 flex-wrap"><dt className="text-text-muted">{fee.label}</dt><dd>{formatKobo(fee.amountKobo)}</dd></div>)}<div><dt className="text-text-muted">Payment</dt><dd className="mt-1 capitalize">{booking.payments[0]?.status.replaceAll('_', ' ') ?? 'Not paid'}</dd></div><div><dt className="text-text-muted">Settlement</dt><dd className="mt-1 capitalize">{booking.settlement_status.replaceAll('_', ' ')}</dd></div></dl><Link href={`/marketplace/listing/${booking.listing_id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent-primary max-w-full break-words">View listing<ArrowUpRight className="size-4" /></Link><p className="break-all text-xs text-text-muted">Reference {booking.id}</p></div><BookingControls booking={booking} userId={userId} paymentEnabled={paymentsEnabled()} /></div>{["confirmed", "completed", "disputed"].includes(booking.status) && <div className="mt-6"><BookingFeedback bookingId={booking.id} completed={booking.status === "completed"} /></div>}</div></MarketplaceShell>
}
