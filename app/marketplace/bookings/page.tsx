import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, ArrowUpRight } from 'lucide-react'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { requireUserId } from '@/lib/action-helpers'
import { getBookingsForUser } from '@/lib/bookings/service'
import { formatKobo } from '@/lib/bookings/policy'
import { platformEnabled } from '@/lib/platform'

export const metadata = { title: 'Your bookings · Rentral' }

export default async function BookingsPage() {
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')
  const bookings = await getBookingsForUser(userId)
  return <MarketplaceShell>
    <div className="mx-auto max-w-5xl min-w-0 w-full">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 min-w-0"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-primary">Your plans, in one place</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl break-words">Your bookings</h1><p className="mt-3 text-sm text-text-muted">Keep track of inspections, rentals, and requests from your guests.</p></div><Link href="/marketplace" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-subtle px-5 py-3 text-sm font-medium max-w-full break-words">Explore rentals<ArrowUpRight className="size-4" /></Link></div>
      {bookings.length ? <div className="grid gap-4 md:grid-cols-2">{bookings.map(booking => <Link key={booking.id} href={`/marketplace/bookings/${booking.id}`} className="group rounded-2xl border border-border-subtle bg-surface-card p-5 transition-colors hover:border-accent-primary sm:p-6 min-w-0 max-w-full wrap-anywhere text-text-primary min-h-11 break-words block">
        <div className="flex items-center justify-between gap-3 min-w-0 flex-wrap"><span className="rounded-full bg-accent-muted px-3 py-1 text-xs font-medium capitalize text-accent-primary">{booking.kind}</span><span className="text-xs capitalize text-text-muted">{booking.status.replaceAll('_', ' ')}</span></div>
        <h2 className="mt-5 text-lg font-semibold break-words">{booking.listing.text_address ?? `${booking.listing.category} booking`}</h2>
        <p className="mt-2 text-sm text-text-muted">{new Date(booking.starts_at).toLocaleDateString('en-NG', { dateStyle: 'medium', timeZone: 'Africa/Lagos' })} – {new Date(booking.ends_at).toLocaleDateString('en-NG', { dateStyle: 'medium', timeZone: 'Africa/Lagos' })}</p>
        <div className="mt-6 flex items-center justify-between border-t border-border-subtle pt-4 min-w-0 flex-wrap gap-3"><div><p className="text-lg font-semibold">{formatKobo(booking.amount_kobo)}</p><p className="mt-1 text-xs text-text-muted">{booking.seeker_id === userId ? `Hosted by @${booking.lister.username}` : `Requested by @${booking.seeker.username}`}</p></div><ArrowUpRight className="size-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
      </Link>)}</div> : <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle px-6 py-12 text-center"><CalendarDays className="size-10 text-accent-primary" /><h2 className="mt-5 text-xl font-semibold break-words">Good plans start here.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-text-muted">{platformEnabled() ? 'When you request an inspection or a rental, it will appear here. Hosting? Your incoming requests live here too.' : 'Bookings are being prepared. Browse houses, cars, and boats while we get everything ready.'}</p><Link href="/marketplace" className="mt-6 rounded-xl bg-accent-primary px-6 py-3 text-sm font-semibold text-text-inverse min-h-11 max-w-full break-words inline-flex items-center">Find your next rental</Link></div>}
    </div>
  </MarketplaceShell>
}
