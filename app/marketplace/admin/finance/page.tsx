import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { FinancialWorkspace } from '@/components/admin/FinancialWorkspace'
import { requireStaffId } from '@/lib/operations/access'

export default async function FinancialOperationsPage() {
  const actorId = await requireStaffId('finance:review')
  if (!actorId) notFound()
  return <MarketplaceShell><div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6"><Link href="/marketplace/admin" className="text-sm text-accent-hover">← Staff workspace</Link><FinancialWorkspace actorId={actorId} /></div></MarketplaceShell>
}
