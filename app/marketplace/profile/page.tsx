import { redirect } from 'next/navigation'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { OwnerProfileView } from '@/components/profile/OwnerProfileView'
import { getOwnProfileDetails } from '@/lib/profile-data'

export default async function OwnProfilePage() {
  const profile = await getOwnProfileDetails()
  if (!profile) redirect('/sign-in')
  return <MarketplaceShell className="max-w-5xl"><OwnerProfileView profile={profile} /></MarketplaceShell>
}
