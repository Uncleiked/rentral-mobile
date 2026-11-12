import { VisitorProfileHeader } from '@/components/profile/VisitorProfileHeader'
import { ProfileTabs } from '@/components/profile/ProfileTabs'
import { ListingsGrid } from '@/components/profile/ListingsGrid'
import { getListingsForProfile, type ProfileRecord } from '@/lib/profile-data'
import { getProfileReviews } from '@/lib/discovery'
import { SafetyNoticeBanner } from '@/components/trust/SafetyNoticeBanner'

type Props = { profile: ProfileRecord }

export async function VisitorProfileView({ profile }: Props) {
  const [listings, reviews] = await Promise.all([getListingsForProfile(profile.id), getProfileReviews(profile.id)])
  return <div className="space-y-8">
    <VisitorProfileHeader profile={profile} listingsCount={listings.length} listingId={listings[0]?.id} />
    <SafetyNoticeBanner subjectId={profile.id} />
    <ProfileTabs reviewsCount={reviews.length} listingsContent={<ListingsGrid listings={listings} />}
      reviewsContent={<div className="space-y-4">{reviews.length ? reviews.map(review => <article key={review.id} className="rounded-2xl border border-border-subtle bg-surface-card p-5 min-w-0 max-w-full wrap-anywhere text-text-primary"><div className="flex flex-wrap items-center justify-between gap-2 min-w-0"><span className="text-xs font-semibold">@{review.author}</span><span className="text-xs text-accent-hover">{review.rating} / 5</span></div><p className="mt-3 text-sm leading-relaxed text-text-secondary">{review.comment}</p><p className="mt-3 text-[10px] text-text-muted">From a completed booking</p></article>) : <div className="py-12 text-center"><p className="text-sm font-medium">No reviews yet</p><p className="mt-2 text-xs text-text-muted">Reviews appear after a completed booking.</p></div>}</div>}
      ledgerContent={<div className="rounded-2xl border border-border-subtle bg-surface-card p-6 min-w-0 max-w-full wrap-anywhere text-text-primary"><h2 className="text-sm font-semibold break-words">Know what a badge means</h2><p className="mt-3 text-sm leading-relaxed text-text-muted">{profile.kycVerified ? 'This member completed identity verification.' : 'Identity verification is not currently confirmed for this member.'} Identity verification supports safer introductions. It does not prove ownership of an asset, guarantee its condition, or replace an inspection.</p></div>} />
  </div>
}
