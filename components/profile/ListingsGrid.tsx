import { Home } from "lucide-react";
import { ListingCard } from "@/components/profile/ListingCard";
import type { ListingSummary } from "@/lib/profile-data";

interface ListingsGridProps {
  listings: ListingSummary[];
  owner?: boolean;
}

export function ListingsGrid({ listings, owner = false }: ListingsGridProps) {
  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="rounded-full bg-glass-light p-4">
          <Home className="h-6 w-6 text-text-muted" />
        </div>
        <p className="text-sm font-semibold text-text-primary">No listings yet</p>
        <p className="text-sm text-text-muted max-w-xs">
          Listings will appear here once this profile posts its first verified asset.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} owner={owner} />
      ))}
    </div>
  );
}
