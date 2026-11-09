import { AvatarUploadButton } from '@/components/profile/AvatarUploadButton'
import { VerifiedBadge } from '@/components/profile/VerifiedBadge'
import { OwnerProfileActions } from '@/components/profile/OwnerProfileActions'
import type { OwnProfileDetails } from '@/lib/profile-data'

type Props = { profile: OwnProfileDetails }

export function OwnerProfileHeader({ profile }: Props) {
  return <div className="flex flex-col gap-6 border-b border-border-subtle pb-8 sm:flex-row sm:items-center">
    <AvatarUploadButton profile={profile} />
    <div className="min-w-0 flex-1"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-hover">Your corner of Rentral</p><div className="flex min-w-0 flex-wrap items-center gap-2"><h1 className="min-w-0 max-w-full wrap-anywhere text-2xl font-semibold tracking-tight">{profile.displayName}</h1>{profile.kycVerified && <VerifiedBadge size="md" />}</div><p className="mt-1.5 wrap-anywhere text-sm text-text-muted">@{profile.username}</p><p className="mt-3 max-w-lg wrap-anywhere text-sm leading-relaxed text-text-secondary">{profile.bio || 'Add a little about yourself. A good introduction goes a long way.'}</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-border-subtle px-3 py-1.5 text-[10px] text-text-muted">Member since {profile.memberSince.getUTCFullYear()}</span><span className="rounded-full border border-border-subtle px-3 py-1.5 text-[10px] text-text-muted">{profile.accountType === 'organization' ? 'Organization account' : 'Personal account'}</span></div></div>
    <div className="self-start sm:self-center"><OwnerProfileActions profile={profile} /></div>
  </div>
}
