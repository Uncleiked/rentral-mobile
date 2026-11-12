import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { ArrowLeft } from 'lucide-react'
import prisma from '@/lib/db'
import { requireUserId } from '@/lib/action-helpers'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { BookingRequestForm } from '@/components/bookings/BookingRequestForm'
import { BOOKING_KINDS } from '@/lib/bookings/policy'
import { platformEnabled } from '@/lib/platform'
import { getListingDetails } from '@/lib/discovery'
import { getOwnActiveHold } from '@/lib/bookings/service'

type Props = { searchParams: Promise<{ listing?: string; kind?: string; hold?: string }> }
export const metadata = { title: 'Plan your rental · Rentral' }

export default async function NewBookingPage({ searchParams }: Props) {
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')
  const params = await searchParams
  const listingId = z.string().uuid().safeParse(params.listing)
  if (!listingId.success) redirect('/marketplace')
  const listing = await prisma.listing.findFirst({ where: { id: listingId.data, listing_status: 'active' }, select: { id: true, lister_id: true, category: true, text_address: true, base_rent_amount: true, asset_metadata: true } })
  if (!listing || !listing.base_rent_amount) notFound()
  if (listing.lister_id === userId) redirect(`/marketplace/listing/${listing.id}`)
  const details = await getListingDetails(listing.id, userId)
  const ownHold = await getOwnActiveHold(listing.id, userId)
  if (params.hold && ownHold?.id !== params.hold) notFound()
  if (details?.holdUntil && !ownHold) return <MarketplaceShell><div className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-6 min-w-0 wrap-anywhere text-text-primary"><h1 className="text-2xl font-semibold break-words">This asset is currently on hold.</h1><p className="text-sm leading-relaxed text-text-muted">New inspections and rentals are paused until {new Date(details.holdUntil).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} WAT. You can keep watching the walkthrough or message the host.</p><Link href={`/marketplace/listing/${listing.id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent-primary max-w-full break-words"><ArrowLeft className="size-4" />Back to listing</Link></div></MarketplaceShell>
  const kind = ownHold ? 'rental' : BOOKING_KINDS.find(value => value === params.kind) ?? 'inspection'
  const hold = ownHold?.expires_at ? { id: ownHold.id, amountKobo: ownHold.amount_kobo, startsAt: ownHold.starts_at, endsAt: ownHold.ends_at, expiresAt: ownHold.expires_at } : undefined
  return <MarketplaceShell><div className="mx-auto max-w-2xl min-w-0 w-full"><Link href={`/marketplace/listing/${listing.id}`} className="mb-7 inline-flex min-h-11 items-center gap-2 text-sm text-text-muted max-w-full break-words"><ArrowLeft className="size-4" />Back to listing</Link><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-primary">Make it happen</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl break-words">A little closer to yours.</h1><p className="mb-8 mt-4 text-sm leading-relaxed text-text-muted">{listing.text_address}</p><BookingRequestForm listingId={listing.id} category={listing.category} priceNaira={listing.base_rent_amount.toString()} metadata={listing.asset_metadata} initialKind={kind} enabled={platformEnabled()} hold={hold} /></div></MarketplaceShell>
}
