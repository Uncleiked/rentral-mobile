import { redirect } from 'next/navigation'
import { requireUserId } from '@/lib/action-helpers'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { CampaignWorkspace } from '@/components/commerce/CampaignWorkspace'
export default async function CampaignsPage() {
  if (!await requireUserId()) redirect('/sign-in')
  return <MarketplaceShell><div className="mx-auto w-full max-w-4xl space-y-7 min-w-0"><header><p className="text-xs uppercase tracking-widest text-accent-hover">Labeled paid placement</p><h1 className="mt-3 text-3xl font-semibold break-words">Your sponsored campaigns</h1><p className="mt-3 text-sm text-text-muted">Prepare a draft, obtain independent review, then decide whether to purchase its fixed service window.</p></header><CampaignWorkspace /></div></MarketplaceShell>
}
