import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, BadgeCheck, MessageCircle } from 'lucide-react'
import { ListingVideo } from '@/components/listing/ListingVideo'
import { SaveListingButton } from '@/components/feed/SaveListingButton'
import { ShareListingButton } from '@/components/feed/ShareListingButton'
import type { DiscoveryListing } from '@/lib/discovery'

type Props = { listing: DiscoveryListing }

export function MarketplaceFeedCard({ listing }: Props) {
  return <article className="mx-auto w-full max-w-md min-w-0 overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
    <div className="flex items-center justify-between gap-3 px-4 py-3"><Link href={`/marketplace/profile/${encodeURIComponent(listing.username)}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5"><span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-glass-border-light bg-glass-light text-xs font-semibold">{listing.avatarUrl ? <Image src={listing.avatarUrl} alt="" fill sizes="36px" className="object-cover" /> : listing.username.charAt(0).toUpperCase()}</span><span className="truncate text-xs font-semibold">{listing.username}</span>{listing.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-accent-hover" aria-label="Identity verified" />}</Link><span className="max-w-[40%] min-w-0 truncate text-right text-xs text-text-muted">{listing.location}</span></div>
    <div className="relative aspect-[9/12] bg-background-app"><ListingVideo listingId={listing.id} useMux={listing.useMux} src={listing.videoUrl} poster={listing.posterUrl} className="h-full w-full object-cover" controls playsInline /></div>
    <div className="relative p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><SaveListingButton listingId={listing.id} saved={listing.saved} available={listing.savingAvailable} compact feedbackPosition="container" /><Link href={`/marketplace/messages?listing=${listing.id}`} aria-label={`Message host about ${listing.title}`} className="flex h-11 w-11 items-center justify-center rounded-full border border-border-subtle transition-colors hover:bg-glass-light"><MessageCircle className="h-[19px] w-[19px]" /></Link><ShareListingButton listingId={listing.id} title={listing.title} compact feedbackPosition="container" /></div><Link href={`/marketplace/listing/${listing.id}`} className="flex min-h-11 items-center gap-1.5 rounded-full bg-accent-primary px-4 py-3 text-xs font-semibold text-text-inverse transition-colors hover:bg-accent-hover">Explore<ArrowUpRight className="h-3.5 w-3.5" /></Link></div><h2 className="break-words text-sm font-semibold">{listing.title}</h2><p className="mt-1 flex min-w-0 flex-wrap items-baseline gap-1.5"><span className="max-w-full break-words text-lg font-semibold text-accent-hover">₦{listing.price}</span>{listing.intent !== 'buy' && <span className="text-xs text-text-muted">/ {listing.priceDenomination}</span>}</p><div className="mt-3 flex flex-wrap gap-2">{listing.badges.map(badge => <span key={badge} className="rounded-full border border-border-subtle px-2.5 py-1 text-[10px] font-medium text-text-secondary">{badge}</span>)}</div></div>
  </article>
}
