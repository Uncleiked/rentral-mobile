import clsx from "clsx";
import Link from "next/link";
import { connection } from "next/server";
import { PlusSquare } from "lucide-react";
import { MarketplaceHeader } from "@/components/feed/MarketplaceHeader";
import { MarketplaceFeedCard } from "@/components/feed/MarketplaceFeedCard";
import { MarketplaceSidebar } from "@/components/feed/MarketplaceSidebar";
import { MarketplaceSuggestions } from "@/components/feed/MarketplaceSuggestions";
import { MarketplaceBottomNav } from "@/components/feed/MarketplaceBottomNav";
import { getMarketplaceFeed } from "@/lib/listing-data";

export default async function MarketplacePage() {
  await connection();
  const listings = await getMarketplaceFeed();

  return (
    <main className={clsx('bg-background-app', 'min-h-[100dvh]', 'w-full', 'flex', 'text-text-primary')}>
      {/* Left Sidebar (Desktop/Tablet) */}
      <MarketplaceSidebar />

      {/* Center Main Content */}
      <div className={clsx('flex-1', 'flex', 'justify-center', 'md:ml-64', 'lg:ml-[244px]')}>
        <div className={clsx('w-full', 'max-w-[470px]', 'flex', 'flex-col', 'pb-16', 'md:pb-0')}>
          <MarketplaceHeader />

          {listings.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-20 text-center">
              <p className="text-sm font-semibold text-text-primary">No listings yet</p>
              <p className="max-w-xs text-sm text-text-muted">
                Listings appear here after verification and publication are complete.
              </p>
              <Link
                href="/marketplace/listing/create"
                className="glass-btn inline-flex items-center gap-2 rounded-xl bg-accent-primary px-5 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98"
              >
                <PlusSquare className="h-4 w-4" />
                Create Listing
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-6 mt-2">
              {listings.map((listing) => (
                <MarketplaceFeedCard key={listing.id} {...listing} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Suggestions Sidebar (Desktop only) */}
      <MarketplaceSuggestions />

      {/* Bottom Navigation (Mobile only) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        <MarketplaceBottomNav />
      </div>
    </main>
  );
}
