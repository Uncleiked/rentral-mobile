import { notFound } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { requireInsightsId } from '@/lib/operations/access'
import { platformEnabled } from '@/lib/platform'
import { getMarketInsights } from '@/lib/analytics/insights'

export default async function InsightsDashboard() {
  if (!await requireInsightsId()) notFound()
  const cohorts = platformEnabled() ? await getMarketInsights() : []
  return <MarketplaceShell><div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12"><p className="text-xs uppercase tracking-widest text-accent-hover">Rentral Insights</p><h1 className="mt-3 text-3xl font-semibold">Understand the next move.</h1><p className="mb-8 mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">Consented search demand for the current month. Groups with fewer than ten distinct contributors are withheld. Search interest is an observation; it does not guarantee occupancy or returns.</p>{!cohorts.length ? <div className="rounded-2xl border border-border-subtle bg-surface-card p-10 text-center"><BarChart3 className="mx-auto mb-4 size-10 text-accent-primary" /><h2 className="text-xl font-semibold">Good insights take evidence.</h2><p className="mt-3 text-sm text-text-muted">No groups meet the reporting threshold yet. There are no fabricated trends or forecasts.</p></div> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{cohorts.map(cohort => <article key={`${cohort.category}:${cohort.intent}:${cohort.neighborhood}:${cohort.budget_band}`} className="rounded-2xl border border-border-subtle bg-surface-card p-6"><p className="text-xs uppercase tracking-widest text-accent-hover">{cohort.category} · {cohort.intent}</p><h2 className="mt-4 text-xl font-semibold capitalize">{cohort.neighborhood.replaceAll('-', ' ')}</h2><p className="mt-2 text-sm text-text-muted">Budget: {cohort.budget_band.replaceAll('-', ' ')}</p><p className="mt-6 text-3xl font-semibold">{cohort.people}<span className="ml-2 text-xs font-normal text-text-muted">contributors</span></p><p className="mt-2 text-xs text-text-muted">{cohort.searches} deduplicated preference events</p></article>)}</div>}</div></MarketplaceShell>
}
