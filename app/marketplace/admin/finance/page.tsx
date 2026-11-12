import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { FinancialWorkspace } from '@/components/admin/FinancialWorkspace'
import { requireStaffId } from '@/lib/operations/access'

export default async function FinancialOperationsPage() {
  const actorId = await requireStaffId('finance:review')
  if (!actorId) notFound()
  return <MarketplaceShell><div className="mx-auto max-w-6xl space-y-6 min-w-0 w-full"><Link href="/marketplace/admin" className="text-sm text-accent-hover min-h-11 max-w-full break-words inline-flex items-center">← Staff workspace</Link><FinancialWorkspace actorId={actorId} /></div></MarketplaceShell>
}
