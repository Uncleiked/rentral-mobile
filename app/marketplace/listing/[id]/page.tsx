import Image from 'next/image'
import Link from 'next/link'
import { DirectPublicationPanel } from '@/components/listing/DirectPublicationPanel'
import { ownedDirectPublication } from '@/lib/listings/publishing'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, BadgeCheck, MapPin, ShieldCheck, Video } from 'lucide-react'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { ListingVideo } from '@/components/listing/ListingVideo'
import { ListingGallery } from '@/components/listing/ListingGallery'
import { SaveListingButton } from '@/components/feed/SaveListingButton'
import { ShareListingButton } from '@/components/feed/ShareListingButton'
import { requireUserId } from '@/lib/action-helpers'
import { getListingDetails, getProfileReviews } from '@/lib/discovery'
import { ListingFeeButton } from '@/components/bookings/ListingFeeButton'
import { paymentsEnabled } from '@/lib/payments/config'
import { ownedPublicationFee } from '@/lib/api/listing-payments'
import { ListingBookingActions } from '@/components/bookings/ListingBookingActions'

type Props = { params: Promise<{ id: string }> }
const fieldLabels: Record<string, string> = {
  bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', sizeSqm: 'Floor area (m²)', transmission: 'Transmission',
  mileageKm: 'Mileage (km)', seats: 'Seats', fuelType: 'Fuel type', vesselType: 'Vessel type',
  capacityPersons: 'Guest capacity', kitchens: 'Kitchens', state: 'State', rentalIntent: 'Listing type',
  propertyType: 'Property type', floors: 'Floors', preferences: 'Preferences', hostCapacity: 'Listed by',
}

export default async function ListingDetailsPage({ params }: Props) {
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')
  const { id } = await params
  const listing = await getListingDetails(id, userId)
  if (!listing) notFound()
  const publicationFee = listing.isOwner && listing.status === 'pending_verification' ? await ownedPublicationFee(userId, listing.id) : null
  const directPublication = listing.isOwner ? await ownedDirectPublication(userId, listing.id) : null
  const reviews = await getProfileReviews(listing.listerId)
  const amenities = typeof listing.metadata.amenities === 'string' ? listing.metadata.amenities.split(',').map(value => value.trim()).filter(Boolean).slice(0, 30) : []
  const fees = Object.entries({ agencyFee: 'Agency', legalFee: 'Legal', cautionFee: 'Caution deposit', serviceCharge: 'Service charge' }).flatMap(([key, label]) => {
    const value = listing.metadata[key]
    return typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0 ? [{ label, amount: Number(value).toLocaleString('en-NG') }] : []
  })
  return <MarketplaceShell className="max-w-6xl">
    <Link href="/marketplace" className="mb-7 inline-flex items-center gap-2 text-xs text-text-muted transition-colors hover:text-text-primary min-h-11 max-w-full break-words"><ArrowLeft className="h-4 w-4" />Back to discovery</Link>
    <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end min-w-0 flex-wrap"><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-hover">{listing.category === 'house' ? 'Your next place' : listing.category === 'car' ? 'Your next ride' : 'Your next escape'}</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl break-words">{listing.title}</h1><p className="mt-3 flex items-center gap-1.5 text-xs text-text-muted"><MapPin className="h-3.5 w-3.5" />{listing.location}<span className="mx-1">·</span>Approximate location</p></div><div className="flex items-start gap-2"><SaveListingButton listingId={listing.id} saved={listing.saved} available={listing.savingAvailable} /><ShareListingButton listingId={listing.id} title={listing.title} /></div></div>
    {listing.isOwner && listing.status !== 'active' && <p role="status" className="mb-6 rounded-2xl border border-glass-border-warning bg-glass-warning px-5 py-4 text-sm text-text-secondary">{listing.status === 'draft' ? 'This is your private draft. Finish the listing wizard to submit it.' : 'This listing is awaiting publication checks. It is visible only to you.'}</p>}
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border-subtle bg-surface-card min-w-0 max-w-full wrap-anywhere text-text-primary"><ListingVideo listingId={listing.id} useMux={listing.useMux} src={listing.videoUrl} poster={listing.posterUrl} controls playsInline className="h-full w-full object-contain" /></div>
        {listing.mediaSource === 'approved_gallery' && <p className="mt-3 text-xs leading-5 text-text-muted">Admin-approved gallery media. The recording location has not been verified; inspections use manual review.</p>}
        {listing.galleryPhotoUrls && (listing.galleryPhotoUrls.length > 1 || listing.useMux || Boolean(listing.videoUrl)) && <ListingGallery photos={listing.galleryPhotoUrls} title={listing.title} />}
        <div className="my-6 flex flex-wrap gap-2"><span className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-3 py-2 text-[11px] text-text-secondary"><Video className="h-3.5 w-3.5 text-accent-hover" />{listing.mediaSource === 'approved_gallery' ? 'Gallery media' : 'Recorded walkthrough'}</span>{listing.isVerified && <span className="inline-flex items-center gap-2 rounded-full border border-glass-border-success bg-accent-muted px-3 py-2 text-[11px] text-accent-hover"><BadgeCheck className="h-3.5 w-3.5" />Host identity verified</span>}{listing.metadata.hasCaptain === true && <span className="rounded-full border border-border-subtle px-3 py-2 text-[11px] text-text-secondary">Captain included</span>}</div>
        {listing.publicationMode === 'trusted_publisher' && <p className="mb-6 rounded-2xl border border-border-subtle bg-surface-card p-4 text-xs leading-6 text-text-muted">Published by an administrator-approved publisher. Independent approval of the authority document was not required for publication. Review the terms and inspect the asset before paying.</p>}
        <section className="border-t border-border-subtle py-7"><h2 className="mb-5 text-lg font-semibold break-words">The details that matter</h2><dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">{Object.entries(fieldLabels).flatMap(([key, label]) => {
          const value = listing.metadata[key]
          return typeof value === 'string' || typeof value === 'number' ? <div key={key}><dt className="text-[11px] text-text-muted">{label}</dt><dd className="mt-1.5 break-words text-sm font-medium capitalize">{value === '' ? 'Not specified' : value}</dd></div> : []
        })}</dl>{amenities.length > 0 && <div className="mt-7"><h3 className="mb-3 text-sm font-medium">Amenities</h3><div className="flex flex-wrap gap-2">{amenities.map((amenity, index) => <span key={`${amenity}-${index}`} className="rounded-full border border-border-subtle px-3 py-2 text-xs text-text-secondary">{amenity}</span>)}</div></div>}</section>
        <section className="border-t border-border-subtle py-7"><h2 className="mb-5 text-lg font-semibold break-words">Meet your host</h2><div className="flex items-start gap-4"><Link href={`/marketplace/profile/${encodeURIComponent(listing.username)}`} className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-surface-card text-lg font-medium min-w-0 max-w-full wrap-anywhere text-text-primary min-h-11 break-words">{listing.avatarUrl ? <Image src={listing.avatarUrl} alt="" fill sizes="56px" className="object-cover" /> : listing.username.charAt(0).toUpperCase()}</Link><div><Link href={`/marketplace/profile/${encodeURIComponent(listing.username)}`} className="inline-flex items-center gap-1.5 text-sm font-semibold min-h-11 max-w-full break-words">@{listing.username}{listing.isVerified && <BadgeCheck className="h-4 w-4 text-accent-hover" />}</Link><p className="mt-1 text-xs text-text-muted">{listing.hostAccountType} · Member since {new Date(listing.hostSince).getUTCFullYear()}</p>{listing.hostBio && <p className="mt-3 text-sm leading-relaxed text-text-secondary">{listing.hostBio}</p>}</div></div></section>
        <section className="border-t border-border-subtle py-7"><h2 className="mb-4 text-lg font-semibold break-words">Host reviews</h2>{reviews.length ? <div className="space-y-4">{reviews.map(review => <article key={review.id} className="rounded-2xl border border-border-subtle bg-surface-card p-5 min-w-0 max-w-full wrap-anywhere text-text-primary"><div className="flex flex-wrap justify-between gap-2 min-w-0"><p className="text-xs font-semibold">@{review.author}</p><p className="text-xs text-accent-hover">{review.rating} / 5</p></div><p className="mt-3 text-sm leading-relaxed text-text-secondary">{review.comment}</p><p className="mt-3 text-[10px] text-text-muted">Completed booking · {new Date(review.date).toLocaleDateString('en-NG', { month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' })}</p></article>)}</div> : <p className="text-sm leading-relaxed text-text-muted">No completed-booking reviews yet. Ask questions, watch the walkthrough, and inspect the asset before you commit.</p>}</section>
      </div>
      <aside className="rounded-3xl border border-border-subtle bg-surface-card p-6 lg:sticky lg:top-24 min-w-0 max-w-full wrap-anywhere text-text-primary">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">{listing.intent === 'buy' ? 'For sale · inspection enquiries' : 'Make your next move'}</p><p className="mt-4 flex flex-wrap items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight">₦{listing.price}</span>{listing.intent !== 'buy' && <span className="text-xs text-text-muted">/ {listing.priceDenomination}</span>}</p>{fees.length > 0 && <div className="mt-5 border-t border-border-subtle pt-4"><p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Additional charges declared by host</p><dl className="space-y-2">{fees.map(fee => <div key={fee.label} className="flex flex-wrap justify-between gap-2 text-xs min-w-0"><dt className="text-text-muted">{fee.label}</dt><dd className="text-text-secondary">₦{fee.amount}</dd></div>)}</dl></div>}<p className="mt-3 text-xs leading-relaxed text-text-muted">Final dates, fees, and terms are shown before you commit. A request does not confirm a booking.</p>
        {listing.isOwner ? <><Link href={listing.status === 'draft' ? `/marketplace/listing/create?draft=${listing.id}` : `/marketplace/listing/${listing.id}/edit`} className="mt-6 flex items-center justify-center gap-2 rounded-full bg-accent-primary px-5 py-3.5 text-sm font-semibold text-text-inverse hover:bg-accent-hover min-h-11 max-w-full break-words">{listing.status === 'draft' ? 'Continue your draft' : 'Manage this listing'}<ArrowUpRight className="h-4 w-4" /></Link>{listing.status === 'pending_verification' && <div className="mt-4"><ListingFeeButton listingId={listing.id} enabled={paymentsEnabled()} waived={Boolean(publicationFee?.waived)} /></div>}{directPublication && <DirectPublicationPanel actorId={userId} state={directPublication} />}</> : <ListingBookingActions listingId={listing.id} intent={listing.intent} holdUntil={listing.holdUntil} />}
        <div className="mt-6 border-t border-border-subtle pt-5"><ShieldCheck className="mb-3 h-5 w-5 text-accent-hover" /><h3 className="text-xs font-semibold">Keep your rental on Rentral</h3><p className="mt-2 text-xs leading-relaxed text-text-muted">Keep conversations and payment records here. Identity checks and recorded media support your decision; they cannot guarantee ownership or condition.</p><Link href="/help" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent-hover min-h-11 max-w-full break-words">Read our rental guide<ArrowUpRight className="h-3 w-3" /></Link></div>
      </aside>
    </div>
  </MarketplaceShell>
}
