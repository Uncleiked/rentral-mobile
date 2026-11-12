import Link from 'next/link'
import { ArrowUpRight, CalendarDays, MessageCircle } from 'lucide-react'

type Props = { listingId: string; intent: string; holdUntil?: string | null }

export function ListingBookingActions({ listingId, intent, holdUntil }: Props) {
  return <div className="mt-6 space-y-3">
    {holdUntil ? <div role="status" className="rounded-2xl border border-glass-border-warning bg-glass-warning p-4 text-sm leading-relaxed text-text-secondary">On hold until {new Date(holdUntil).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' })} WAT. New inspection and rental requests are paused. Already holding this asset? <Link href={`/marketplace/bookings/new?listing=${listingId}&kind=rental`} className="font-medium underline underline-offset-4 min-h-11 max-w-full break-words inline-flex items-center">Continue with your rental</Link>.</div> : <>
      <Link href={`/marketplace/bookings/new?listing=${listingId}&kind=inspection`} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent-primary px-5 py-3.5 text-sm font-semibold text-text-inverse hover:bg-accent-hover min-h-11 max-w-full break-words"><CalendarDays className="size-4" />Request an inspection</Link>
      {intent !== 'buy' && <><Link href={`/marketplace/bookings/new?listing=${listingId}&kind=rental`} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-glass-border-medium px-5 py-3.5 text-sm font-medium hover:bg-glass-light min-h-11 max-w-full break-words">Request a rental<ArrowUpRight className="size-4" /></Link><Link href={`/marketplace/bookings/new?listing=${listingId}&kind=hold`} className="flex min-h-12 items-center justify-center rounded-full border border-border-subtle px-5 py-3 text-xs font-medium text-text-muted hover:bg-glass-light min-h-11 max-w-full break-words">Explore a 1–7 day hold</Link></>}
    </>}
    <Link href={`/marketplace/messages?listing=${listingId}`} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-glass-border-medium px-5 py-3.5 text-sm font-medium hover:bg-glass-light min-h-11 max-w-full break-words"><MessageCircle className="size-4" />Message the host</Link>
  </div>
}
