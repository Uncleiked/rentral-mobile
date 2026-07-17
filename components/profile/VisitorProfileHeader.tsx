import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { ShareMenu } from "@/components/profile/ShareMenu";
import type { ProfileRecord } from "@/lib/profile-data";
import type { MockTrustProfile } from "@/lib/mock-profile-data";

interface VisitorProfileHeaderProps {
  profile: ProfileRecord;
  stats: MockTrustProfile;
}

export function VisitorProfileHeader({ profile, stats }: VisitorProfileHeaderProps) {
  const isOrganization = profile.accountType === "organization";

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-6">
      <ProfileAvatar username={profile.username} avatarUrl={profile.avatarUrl} accountType={profile.accountType} />

      <div className="flex-1 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-text-primary">{profile.username}</h1>
          {profile.kycVerified && <VerifiedBadge size="md" />}
          {isOrganization && (
            <span className="rounded-full border border-glass-border-light bg-glass-light px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Licensed Agent
            </span>
          )}

          <div className="flex items-center gap-2 sm:ml-auto">
            <button
              type="button"
              className="px-5 py-2 rounded-lg text-sm font-bold bg-accent-primary text-text-inverse hover:bg-accent-hover active:scale-95 transition-all shadow-lg"
            >
              Follow
            </button>
            <button
              type="button"
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-glass-light border border-glass-border-medium text-text-primary hover:bg-glass-light-hover active:scale-95 transition-all"
            >
              Message
            </button>
            <ShareMenu username={profile.username} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-text-secondary">
          <span>
            <strong className="text-text-primary">{stats.listingsCount}</strong> listings
          </span>
          <span>
            <strong className="text-text-primary">{stats.handshakesCount}</strong> verified handshakes
          </span>
          <span>
            <strong className="text-text-primary">{stats.followersCount.toLocaleString()}</strong> followers
          </span>
        </div>

        {profile.bio && <p className="text-sm text-text-secondary leading-relaxed max-w-lg">{profile.bio}</p>}

        <p className="text-sm text-text-primary font-semibold">{profile.displayName}</p>
      </div>
    </div>
  );
}
