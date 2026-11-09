import { redirect } from 'next/navigation'
import { requireUserId } from '@/lib/action-helpers'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { MatchingPrivacy } from '@/components/matching/MatchingPrivacy'
export default async function MatchingReportsPage() {
  if (!await requireUserId()) redirect('/sign-in')
  return <MarketplaceShell><div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12"><MatchingPrivacy kind="reports" /></div></MarketplaceShell>
}
