import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { requireUserId } from '@/lib/action-helpers'
import { commercialInsights } from '@/lib/commerce/insights'
import { insightsAccess } from '@/lib/commerce/views'
import { InsightsReport } from '@/components/commerce/InsightsReport'

export default async function InsightsDashboard() {
  const actor = await requireUserId()
  if (!actor) redirect('/sign-in')
  const access = await insightsAccess(actor), report = access.allowed ? await commercialInsights(actor).catch(() => null) : null
  return <MarketplaceShell><div className="mx-auto w-full max-w-6xl space-y-7 px-4 py-8 sm:px-6 sm:py-12"><header><p className="text-xs uppercase tracking-widest text-accent-hover">Rentral Insights</p><h1 className="mt-3 text-3xl font-semibold">Understand observed market interest.</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-muted">Coarse consented observations with minimum contributor thresholds. A paid term never reveals identities or bypasses privacy protections.</p></header><nav className="flex flex-wrap gap-3" aria-label="Insights access"><Link href="/marketplace/purchases" className="inline-flex min-h-11 items-center rounded-xl border border-border-subtle px-4 py-3 text-sm text-accent-hover">Access terms and purchases</Link><Link href="/marketplace/campaigns" className="inline-flex min-h-11 items-center rounded-xl border border-border-subtle px-4 py-3 text-sm text-accent-hover">Sponsored campaigns</Link></nav>{report ? <InsightsReport report={report} /> : <section className="rounded-2xl border border-border-subtle bg-surface-card p-7"><h2 className="text-xl font-semibold">{access.allowed ? 'The report is temporarily unavailable.' : 'Choose a fixed Insights term.'}</h2><p className="mt-3 text-sm leading-relaxed text-text-muted">{access.allowed ? 'Your access record is preserved. Refresh this page in a moment.' : 'Current internal reviewers and members with an active verified paid term can open this report. Review the exact price and duration in purchases; no automatic recurring charges are created.'}</p></section>}</div></MarketplaceShell>
}
