import Link from "next/link";
import clsx from "clsx";
import { PlusSquare } from "lucide-react";
import { MarketplaceSidebar } from "@/components/feed/MarketplaceSidebar";
import { MarketplaceBottomNav } from "@/components/feed/MarketplaceBottomNav";
import { ListingsGrid } from "@/components/profile/ListingsGrid";
import { getListingsForProfile } from "@/lib/profile-data";

export default function MyListingsPage() {
  const listings = getListingsForProfile();

  return (
    <main className={clsx("bg-background-app", "min-h-[100dvh]", "w-full", "flex", "text-text-primary")}>
      <MarketplaceSidebar />

      <div className={clsx("flex-1", "flex", "justify-center", "md:ml-64", "lg:ml-[244px]", "pb-16", "md:pb-0")}>
        <div className="w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-xl font-bold text-text-primary tracking-wide">Your Listings</h1>
              <p className="text-sm text-text-secondary mt-1">
                Manage the houses, cars, and boats you&apos;ve listed on Rentral.
              </p>
            </div>
            <Link
              href="/marketplace/listing/create"
              className="glass-btn hidden sm:inline-flex items-center gap-2 rounded-xl bg-accent-primary px-5 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98"
            >
              <PlusSquare className="h-4 w-4" />
              Create Listing
            </Link>
          </div>

          <ListingsGrid listings={listings} />

          <Link
            href="/marketplace/listing/create"
            className="glass-btn sm:hidden mt-6 flex items-center justify-center gap-2 rounded-xl bg-accent-primary px-5 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all active:scale-98"
          >
            <PlusSquare className="h-4 w-4" />
            Create Listing
          </Link>
        </div>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        <MarketplaceBottomNav />
      </div>
    </main>
  );
}
