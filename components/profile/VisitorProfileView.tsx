import { VisitorProfileHeader } from "@/components/profile/VisitorProfileHeader";
import { TrustStatsBar } from "@/components/profile/TrustStatsBar";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { ListingsGrid } from "@/components/profile/ListingsGrid";
import { ReviewsSummary } from "@/components/profile/ReviewsSummary";
import { TrustLedgerSummary } from "@/components/profile/TrustLedgerSummary";
import { MOCK_REVIEWS_COUNT_FALLBACK } from "@/lib/mock-profile-data";
import { getListingsForProfile, getTrustSummary, type ProfileRecord } from "@/lib/profile-data";

interface VisitorProfileViewProps {
  profile: ProfileRecord;
}

export function VisitorProfileView({ profile }: VisitorProfileViewProps) {
  const stats = getTrustSummary(profile);
  const listings = getListingsForProfile();

  return (
    <div className="flex flex-col gap-6">
      <VisitorProfileHeader profile={profile} stats={stats} />
      <TrustStatsBar stats={stats} />
      <ProfileTabs
        reviewsCount={MOCK_REVIEWS_COUNT_FALLBACK}
        listingsContent={<ListingsGrid listings={listings} />}
        reviewsContent={<ReviewsSummary reviewsCount={MOCK_REVIEWS_COUNT_FALLBACK} trustScore={stats.trustScore} />}
        ledgerContent={<TrustLedgerSummary stats={stats} />}
      />
    </div>
  );
}
