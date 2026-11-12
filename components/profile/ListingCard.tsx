import Image from "next/image";
import Link from "next/link";
import { PencilLine } from "lucide-react";
import type { ListingSummary } from "@/lib/profile-data";
import { LISTING_STATUS } from "@/lib/listing-status";
import { MediaProcessingStatus } from '@/components/listing/MediaProcessingStatus';
import { ListingVideo } from '@/components/listing/ListingVideo';

interface ListingCardProps {
  listing: ListingSummary;
  // Rendered only on the owner's "Your Listings" hub — visitor grids never
  // pass this, so edit/draft affordances stay owner-only.
  owner?: boolean;
}

export function ListingCard({ listing, owner = false }: ListingCardProps) {
  const isDraft = listing.status === LISTING_STATUS.DRAFT;
  const ownerAction = isDraft
    ? { href: `/marketplace/listing/create?draft=${listing.id}`, label: "Continue Editing" }
    : { href: `/marketplace/listing/${listing.id}/edit`, label: "Edit Listing" };

  return (
    <div className="rounded-xl overflow-hidden bg-surface-card border border-border-subtle min-w-0 max-w-full wrap-anywhere text-text-primary">
      <div className="relative aspect-[4/3] w-full">
        {listing.posterUrl ? (
          <Image src={listing.posterUrl} alt={listing.title} fill unoptimized sizes="(min-width: 640px) 33vw, 50vw" className="object-cover" />
        ) : listing.videoUrl || listing.useMux ? (
          <ListingVideo
            listingId={listing.id}
            useMux={listing.useMux}
            src={listing.videoUrl}
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-glass-light" />
        )}
        <span className="absolute top-2 left-2 rounded-full bg-glass-dark backdrop-blur-sm border border-glass-border-light px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-primary">
          {isDraft ? 'Draft' : listing.media?.status === 'ready' ? 'Video ready' : 'Walkthrough'}
        </span>
        <Link href={isDraft ? ownerAction.href : `/marketplace/listing/${listing.id}`} aria-label={`View ${listing.title}`} className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent-primary min-h-11 max-w-full break-words inline-flex items-center" />
      </div>

      <div className="p-3 flex flex-col gap-1">
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-extrabold text-accent-hover">₦{listing.price}</span>
          <span className="text-[10px] font-medium uppercase text-text-muted">/ {listing.priceDenomination}</span>
        </div>
        <Link href={isDraft ? ownerAction.href : `/marketplace/listing/${listing.id}`} className="text-sm font-semibold text-text-primary line-clamp-1 hover:text-accent-hover min-h-11 max-w-full break-words inline-flex items-center">{listing.title}</Link>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {listing.badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full bg-glass-light border border-glass-border-light px-2 py-0.5 text-[10px] font-medium text-text-primary"
            >
              {badge}
            </span>
          ))}
        </div>

        {owner && (
          <Link
            href={ownerAction.href}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-glass-border-medium bg-glass-light px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98 min-h-11 max-w-full break-words"
          >
            <PencilLine className="h-3.5 w-3.5" />
            {ownerAction.label}
          </Link>
        )}
        {owner && listing.media && <MediaProcessingStatus listingId={listing.id} media={listing.media} />}
      </div>
    </div>
  );
}
