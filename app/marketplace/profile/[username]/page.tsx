import { notFound, redirect } from "next/navigation";
import clsx from "clsx";
import { MarketplaceSidebar } from "@/components/feed/MarketplaceSidebar";
import { MarketplaceBottomNav } from "@/components/feed/MarketplaceBottomNav";
import { VisitorProfileView } from "@/components/profile/VisitorProfileView";
import { getOwnProfile, getProfileByUsername } from "@/lib/profile-data";

interface VisitorProfilePageProps {
  params: Promise<{ username: string }>;
}

export default async function VisitorProfilePage({ params }: VisitorProfilePageProps) {
  const { username } = await params;
  const ownProfile = await getOwnProfile();

  if (ownProfile?.username === username) {
    redirect("/marketplace/profile");
  }

  const profile = await getProfileByUsername(username);

  if (!profile) {
    notFound();
  }

  return (
    <main className={clsx("bg-background-app", "min-h-[100dvh]", "w-full", "flex", "text-text-primary")}>
      <MarketplaceSidebar />

      <div className={clsx("flex-1", "flex", "justify-center", "md:ml-64", "lg:ml-[244px]", "pb-16", "md:pb-0")}>
        <div className="w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
          <VisitorProfileView profile={profile} />
        </div>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        <MarketplaceBottomNav />
      </div>
    </main>
  );
}
