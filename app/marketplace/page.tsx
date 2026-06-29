"use client";

import clsx from "clsx";
import { MarketplaceHeader } from "@/components/feed/MarketplaceHeader";
import { MarketplaceFeedCard } from "@/components/feed/MarketplaceFeedCard";
import { MarketplaceSidebar } from "@/components/feed/MarketplaceSidebar";
import { MarketplaceSuggestions } from "@/components/feed/MarketplaceSuggestions";
import { MarketplaceBottomNav } from "@/components/feed/MarketplaceBottomNav";

const mockListings = [
  {
    id: "1",
    title: "Luxury 3-Bed Villa with Pool",
    price: "4,500,000",
    priceDenomination: "YEAR",
    category: "House" as const,
    videoUrl: "https://videos.pexels.com/video-files/7578548/7578548-uhd_2560_1440_30fps.mp4",
    posterUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
    badges: ["3 Beds", "4 Baths", "Ikoyi"],
    username: "realestate_king",
    avatarUrl: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
    isVerified: true,
    trustScore: "4.92"
  },
  {
    id: "2",
    title: "2023 Range Rover Velar",
    price: "150,000",
    priceDenomination: "DAY",
    category: "Car" as const,
    videoUrl: "https://videos.pexels.com/video-files/2568600/2568600-hd_1920_1080_30fps.mp4",
    posterUrl: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80",
    badges: ["Automatic", "V6 Engine", "Lekki"],
    username: "auto_prestige",
    avatarUrl: "https://i.pravatar.cc/150?u=a042581f4e29026024d",
    isVerified: true,
    trustScore: "4.75"
  },
  {
    id: "3",
    title: "Modern Minimalist Co-living Apartment",
    price: "1,200,000",
    priceDenomination: "YEAR",
    category: "House" as const,
    videoUrl: "https://videos.pexels.com/video-files/4442654/4442654-hd_1920_1080_30fps.mp4",
    posterUrl: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=800&q=80",
    badges: ["1 Bed", "Shared Kitchen", "Yaba"],
    username: "sarah_properties",
    avatarUrl: "https://i.pravatar.cc/150?u=a042581f4e29026703d",
    isVerified: true,
    trustScore: "4.88"
  }
];

export default function MarketplacePage() {
  return (
    <main className={clsx('bg-background-app', 'min-h-[100dvh]', 'w-full', 'flex', 'text-text-primary')}>
      {/* Left Sidebar (Desktop/Tablet) */}
      <MarketplaceSidebar />

      {/* Center Main Content */}
      <div className={clsx('flex-1', 'flex', 'justify-center', 'md:ml-64', 'lg:ml-[244px]')}>
        <div className={clsx('w-full', 'max-w-[470px]', 'flex', 'flex-col', 'pb-16', 'md:pb-0')}>
          <MarketplaceHeader />
          
          <div className="flex flex-col gap-6 mt-2">
            {mockListings.map((listing) => (
              <MarketplaceFeedCard key={listing.id} {...listing} />
            ))}
          </div>
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
