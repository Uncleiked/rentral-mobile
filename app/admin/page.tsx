import { notFound } from 'next/navigation'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { requireStaffId } from '@/lib/operations/access'
import { AdminWorkspace } from '@/components/admin/AdminWorkspace'

export default async function AdminPage() {
  const actorId = await requireStaffId('staff:workspace')
  if (!actorId) notFound()
  return <MarketplaceShell><AdminWorkspace key={actorId} actorId={actorId} /></MarketplaceShell>
}
