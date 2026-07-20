import Image from "next/image";
import type { ListingSummary } from "@/lib/profile-data";

interface ListingCardProps {
  listing: ListingSummary;
}

export function ListingCard({ listing }: ListingCardProps) {
  return (
    <div className="rounded-xl overflow-hidden bg-surface-card border border-border-subtle">
      <div className="relative aspect-[4/3] w-full">
        <Image src={listing.posterUrl} alt={listing.title} fill className="object-cover" />
        <span className="absolute top-2 left-2 rounded-full bg-glass-dark backdrop-blur-sm border border-glass-border-light px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-primary">
          ✓ 120s Walkthrough
        </span>
      </div>

      <div className="p-3 flex flex-col gap-1">
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-extrabold text-accent-hover">₦{listing.price}</span>
          <span className="text-[10px] font-medium uppercase text-text-muted">/ {listing.priceDenomination}</span>
        </div>
        <p className="text-sm font-semibold text-text-primary line-clamp-1">{listing.title}</p>
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
      </div>
    </div>
  );
}
