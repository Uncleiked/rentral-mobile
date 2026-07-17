import { Suspense } from "react";
import { OwnerProfileHeader } from "@/components/profile/OwnerProfileHeader";
import { EscrowWalletCard } from "@/components/profile/EscrowWalletCard";
import { ActiveLeaseCard } from "@/components/profile/ActiveLeaseCard";
import { CreditTrustCard } from "@/components/profile/CreditTrustCard";
import { InspectionsHandshakesCard } from "@/components/profile/InspectionsHandshakesCard";
import { SavedSearchesCard } from "@/components/profile/SavedSearchesCard";
import { SecurityCard } from "@/components/profile/SecurityCard";
import { EmailChangeToast } from "@/components/profile/EmailChangeToast";
import { getMockTrustProfile } from "@/lib/mock-profile-data";
import type { OwnProfileDetails } from "@/lib/profile-data";

interface OwnerProfileViewProps {
  profile: OwnProfileDetails;
}

export function OwnerProfileView({ profile }: OwnerProfileViewProps) {
  const stats = getMockTrustProfile(profile.username);

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        <EmailChangeToast />
      </Suspense>
      <OwnerProfileHeader profile={profile} stats={stats} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <EscrowWalletCard />
        <ActiveLeaseCard />
        <CreditTrustCard />
        <InspectionsHandshakesCard />
        <SavedSearchesCard />
        <SecurityCard />
      </div>
    </div>
  );
}
