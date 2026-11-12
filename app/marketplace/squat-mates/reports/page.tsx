import { redirect } from 'next/navigation'
import { requireUserId } from '@/lib/action-helpers'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { MatchingPrivacy } from '@/components/matching/MatchingPrivacy'
export default async function MatchingReportsPage() {
  if (!await requireUserId()) redirect('/sign-in')
  return <MarketplaceShell><div className="mx-auto w-full max-w-3xl min-w-0"><MatchingPrivacy kind="reports" /></div></MarketplaceShell>
}
