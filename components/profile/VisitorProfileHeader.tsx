import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { ProfileAvatar } from '@/components/profile/ProfileAvatar'
import { VerifiedBadge } from '@/components/profile/VerifiedBadge'
import { ShareMenu } from '@/components/profile/ShareMenu'
import type { ProfileRecord } from '@/lib/profile-data'

type Props = { profile: ProfileRecord; listingsCount: number; listingId?: string }

export function VisitorProfileHeader({ profile, listingsCount, listingId }: Props) {
  return <div className="flex flex-col gap-6 border-b border-border-subtle pb-8 sm:flex-row sm:items-start">
    <ProfileAvatar username={profile.username} avatarUrl={profile.avatarUrl} accountType={profile.accountType} />
    <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><h1 className="min-w-0 max-w-full wrap-anywhere text-2xl font-semibold tracking-tight break-words">@{profile.username}</h1>{profile.kycVerified && <VerifiedBadge size="md" />}{profile.accountType === 'organization' && <span className="rounded-full border border-border-subtle px-3 py-1 text-[10px] text-text-muted">Organization</span>}</div><p className="mt-2 wrap-anywhere text-sm text-text-secondary">{profile.displayName}</p>{profile.bio && <p className="mt-3 max-w-lg wrap-anywhere text-sm leading-relaxed text-text-muted">{profile.bio}</p>}<p className="mt-4 text-xs text-text-muted"><strong className="font-semibold text-text-primary">{listingsCount}</strong> published listing{listingsCount === 1 ? '' : 's'} · Member since {profile.memberSince.getUTCFullYear()}</p></div>
    <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto">{listingId && <Link href={`/marketplace/messages?listing=${listingId}`} className="inline-flex items-center gap-2 rounded-full bg-accent-primary px-4 py-3 text-xs font-semibold text-text-inverse transition-all hover:bg-accent-hover active:scale-95 min-h-11 max-w-full break-words"><MessageCircle className="h-4 w-4" />Message host</Link>}<ShareMenu username={profile.username} /></div>
  </div>
}
