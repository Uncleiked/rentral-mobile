import { ListingCard } from "@/components/profile/ListingCard";
import type { MockListing } from "@/lib/mock-profile-data";

interface ListingsGridProps {
  listings: MockListing[];
}

export function ListingsGrid({ listings }: ListingsGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
