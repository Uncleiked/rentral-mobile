import { AvatarUploadButton } from "@/components/profile/AvatarUploadButton";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { OwnerProfileActions } from "@/components/profile/OwnerProfileActions";
import type { OwnProfileDetails } from "@/lib/profile-data";
import type { MockTrustProfile } from "@/lib/mock-profile-data";

interface OwnerProfileHeaderProps {
  profile: OwnProfileDetails;
  stats: MockTrustProfile;
}

export function OwnerProfileHeader({ profile, stats }: OwnerProfileHeaderProps) {
  const memberSinceYear = profile.memberSince.getFullYear();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-6">
      <AvatarUploadButton profile={profile} />

      <div className="flex-1 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-text-primary">{profile.displayName}</h1>
          {profile.kycVerified && <VerifiedBadge size="md" />}
          <span className="text-sm text-text-muted">@{profile.username}</span>
        </div>

        {profile.bio ? (
          <p className="text-sm text-text-secondary leading-relaxed max-w-lg">{profile.bio}</p>
        ) : (
          <p className="text-sm text-text-muted italic">Add a bio so people know who they&apos;re renting from.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent-muted border border-glass-border-success px-3 py-1 text-xs font-semibold text-accent-hover">
            {stats.rentalsCompleted} rentals completed
          </span>
          <span className="rounded-full bg-accent-muted border border-glass-border-success px-3 py-1 text-xs font-semibold text-accent-hover">
            {stats.onTimePayments} on-time payments
          </span>
          <span className="rounded-full bg-glass-light border border-glass-border-light px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Member since {memberSinceYear}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-extrabold text-accent-hover">★ {stats.trustScore}</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Trust score · {stats.topPercentLabel}
        </span>
        <div className="mt-1">
          <OwnerProfileActions profile={profile} />
        </div>
      </div>
    </div>
  );
}
