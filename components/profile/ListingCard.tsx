import Image from 'next/image'
import Link from 'next/link'
import { ImageIcon, PencilLine, ArrowUpRight } from 'lucide-react'
import type { ListingSummary } from '@/lib/profile-data'
import { ownerListingHref, ownerListingStatus } from '@/lib/listings/owner-inventory'
import { MediaProcessingStatus } from '@/components/listing/MediaProcessingStatus'
import { ListingVideo } from '@/components/listing/ListingVideo'

interface ListingCardProps { listing: ListingSummary; owner?: boolean }

export function ListingCard({ listing, owner = false }: ListingCardProps) {
  const isDraft = listing.status === 'draft'
  const href = owner ? ownerListingHref(listing) : `/marketplace/listing/${listing.id}`
  const canEdit = !isDraft && !listing.archivedAt && listing.status === 'active'
  const actionHref = canEdit ? `/marketplace/listing/${listing.id}/edit` : href
  const actionLabel = isDraft && !listing.archivedAt ? 'Continue editing' : canEdit ? 'Edit listing' : 'View status and next steps'
  const poster = listing.posterUrl ?? listing.galleryPhotoUrls?.[0]
  const label = owner ? ownerListingStatus(listing) : listing.mediaSource === 'approved_gallery' ? 'Gallery media' : listing.media?.status === 'ready' ? 'Video ready' : 'Walkthrough'
  return <article className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border-subtle bg-surface-card text-text-primary">
    <div className="relative aspect-[4/3] w-full">
      {poster ? <Image src={poster} alt={listing.title} fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 360px) 50vw, 100vw" className="object-cover" /> : listing.videoUrl || listing.useMux ? <ListingVideo listingId={listing.id} useMux={listing.useMux} src={listing.videoUrl} muted playsInline className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-glass-light text-text-muted"><ImageIcon className="h-6 w-6" aria-hidden="true" /><span className="text-xs">Media can be added later</span></div>}
      <span className="absolute left-2 top-2 max-w-[calc(100%-16px)] rounded-full border border-glass-border-light bg-glass-dark px-2.5 py-1 text-[10px] font-semibold text-text-primary backdrop-blur-sm">{label}</span>
      <Link href={href} aria-label={isDraft && owner ? `Continue editing ${listing.title}` : `View ${listing.title}`} className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent-primary" />
    </div>
    <div className="flex min-w-0 flex-col gap-2 p-3 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-baseline gap-1"><span className="break-words text-sm font-extrabold text-accent-hover">&#8358;{listing.price}</span><span className="text-[10px] uppercase text-text-muted">/ {listing.priceDenomination}</span></div>
      <Link href={href} className="inline-flex min-h-11 max-w-full items-center text-sm font-semibold leading-5 text-text-primary hover:text-accent-hover"><span className="line-clamp-2 wrap-anywhere">{listing.title}</span></Link>
      <div className="flex flex-wrap gap-1.5">{listing.badges.filter(badge => !owner || !['Draft', 'Pending Verification', 'Active'].includes(badge)).map(badge => <span key={badge} className="max-w-full rounded-full border border-glass-border-light bg-glass-light px-2 py-1 text-[10px] text-text-secondary wrap-anywhere">{badge}</span>)}</div>
      {owner && <><p className="mt-1 text-[10px] text-text-muted wrap-anywhere">Listing ID: {listing.id}</p><Link href={actionHref} className="mt-1 inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-xl border border-glass-border-medium bg-glass-light px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary">{isDraft || canEdit ? <PencilLine className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}<span className="break-words">{actionLabel}</span></Link></>}
      {owner && listing.media && <MediaProcessingStatus listingId={listing.id} media={listing.media} />}
    </div>
  </article>
}
