import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUserId } from '@/lib/action-helpers'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { FinancialWorkspace } from '@/components/admin/FinancialWorkspace'
export default async function MemberFinancialPage() {
  const actorId = await requireUserId()
  if (!actorId) redirect('/sign-in')
  return <MarketplaceShell><div className="mx-auto w-full max-w-5xl space-y-7 px-4 py-8 sm:px-6 sm:py-12"><Link href="/marketplace/purchases" className="inline-flex min-h-11 items-center text-sm text-accent-hover">Commercial purchases</Link><FinancialWorkspace key={`${actorId}:member`} actorId={actorId} scope="member" /></div></MarketplaceShell>
}
