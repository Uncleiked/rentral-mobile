import { redirect } from "next/navigation";
import clsx from "clsx";
import { MarketplaceSidebar } from "@/components/feed/MarketplaceSidebar";
import { MarketplaceBottomNav } from "@/components/feed/MarketplaceBottomNav";
import { OwnerProfileView } from "@/components/profile/OwnerProfileView";
import { getOwnProfileDetails } from "@/lib/profile-data";

export default async function OwnProfilePage() {
  const profile = await getOwnProfileDetails();

  if (!profile) {
    redirect("/sign-in");
  }

  return (
    <main className={clsx("bg-background-app", "min-h-[100dvh]", "w-full", "flex", "text-text-primary")}>
      <MarketplaceSidebar />

      <div className={clsx("flex-1", "flex", "justify-center", "md:ml-64", "lg:ml-[244px]", "pb-16", "md:pb-0")}>
        <div className="w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
          <OwnerProfileView profile={profile} />
        </div>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        <MarketplaceBottomNav />
      </div>
    </main>
  );
}
