import { notFound, redirect } from 'next/navigation'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { VisitorProfileView } from '@/components/profile/VisitorProfileView'
import { getOwnProfile, getProfileByUsername } from '@/lib/profile-data'

type Props = { params: Promise<{ username: string }> }

export default async function VisitorProfilePage({ params }: Props) {
  const { username } = await params
  const ownProfile = await getOwnProfile()
  if (ownProfile?.username === username) redirect('/marketplace/profile')
  const profile = await getProfileByUsername(username)
  if (!profile) notFound()
  return <MarketplaceShell className="max-w-5xl"><VisitorProfileView profile={profile} /></MarketplaceShell>
}
