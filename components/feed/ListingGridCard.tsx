import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, BadgeCheck, Play } from 'lucide-react'
import { SaveListingButton } from '@/components/feed/SaveListingButton'
import type { DiscoveryListing } from '@/lib/discovery'

type Props = { listing: DiscoveryListing }

export function ListingGridCard({ listing }: Props) {
  return <article className="group min-w-0">
    <div className="relative isolate mb-3 aspect-[1.08] overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
      <Link href={`/marketplace/listing/${listing.id}`} aria-label={`View ${listing.title} in ${listing.location}`} className="absolute inset-0 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent-primary">
        {listing.posterUrl ? <Image src={listing.posterUrl} alt={listing.title} fill unoptimized sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-105" /> : <div className="flex flex-col items-center gap-3 text-text-muted"><Play className="h-8 w-8" strokeWidth={1.2} /><span className="text-xs">View walkthrough</span></div>}
        <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full border border-glass-border-light bg-glass-dark px-3 py-1.5 text-[10px] font-medium text-text-primary backdrop-blur-md"><Play className="h-3 w-3" />{listing.intent === 'buy' ? 'For sale' : listing.intent === 'squat' ? 'Co-living' : listing.intent === 'shortlet' ? 'Shortlet' : 'For rent'}</span>
      </Link>
      <div className="absolute right-3 top-3"><SaveListingButton listingId={listing.id} saved={listing.saved} available={listing.savingAvailable} compact /></div>
      {listing.holdUntil && <span className="absolute left-3 top-3 rounded-full border border-glass-border-warning bg-glass-dark px-3 py-1.5 text-[10px] font-medium text-text-primary backdrop-blur-md">Currently on hold</span>}
    </div>
    <div className="flex items-start justify-between gap-3"><Link href={`/marketplace/listing/${listing.id}`} className="min-w-0"><h2 className="truncate text-sm font-semibold text-text-primary">{listing.location}</h2><p className="mt-1 truncate text-xs text-text-muted">{listing.title}</p></Link><ArrowUpRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" /></div>
    <p className="mt-2 flex flex-wrap items-baseline gap-1.5 text-xs"><span className="text-base font-semibold text-text-primary">₦{listing.price}</span>{listing.intent !== 'buy' && <span className="text-text-muted">/ {listing.priceDenomination}</span>}</p>
    <Link href={`/marketplace/profile/${encodeURIComponent(listing.username)}`} className="mt-2 flex w-fit items-center gap-1.5 text-[11px] text-text-muted hover:text-text-secondary">@{listing.username}{listing.isVerified && <BadgeCheck aria-label="Identity verified" className="h-3.5 w-3.5 text-accent-hover" />}</Link>
  </article>
}
