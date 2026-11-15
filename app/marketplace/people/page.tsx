import { redirect } from 'next/navigation'
import { requireUserId } from '@/lib/action-helpers'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { PeopleSearch } from '@/components/social/PeopleSearch'
export default async function PeoplePage(){const actorId=await requireUserId();if(!actorId)redirect('/sign-in');return <MarketplaceShell className="max-w-6xl"><PeopleSearch actorId={actorId}/></MarketplaceShell>}
