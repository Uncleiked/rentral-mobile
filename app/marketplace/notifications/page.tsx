import { redirect } from 'next/navigation'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { NotificationsWorkspace } from '@/components/notifications/NotificationsWorkspace'
import { requireUserId } from '@/lib/action-helpers'
export default async function NotificationsPage() {
  const actorId = await requireUserId()
  if (!actorId) redirect('/sign-in')
  return <MarketplaceShell><div className="mx-auto w-full min-w-0 max-w-3xl"><NotificationsWorkspace actorId={actorId} /></div></MarketplaceShell>
}
