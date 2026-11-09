import Link from 'next/link'
import { ArrowRight, MapPin } from 'lucide-react'
import { connection } from 'next/server'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { MarketplaceHeader } from '@/components/feed/MarketplaceHeader'
import { MarketplaceFeedCard } from '@/components/feed/MarketplaceFeedCard'
import { ListingGridCard } from '@/components/feed/ListingGridCard'
import { DiscoveryEmptyState } from '@/components/feed/DiscoveryEmptyState'
import { DiscoveryTelemetry } from '@/components/analytics/DiscoveryTelemetry'
import { coarseNeighborhood } from '@/lib/analytics/policy'
import { requireUserId } from '@/lib/action-helpers'
import { getDiscoveryListings } from '@/lib/discovery'
import { parseDiscoveryFilters, discoveryHref, discoveryHasFilters, type DiscoverySearchParams } from '@/lib/discovery-policy'
import { sponsoredPlacements } from '@/lib/commerce/placements'
import { SponsoredSection } from '@/components/commerce/SponsoredSection'

type Props = { searchParams: Promise<DiscoverySearchParams> }

export default async function MarketplacePage({ searchParams }: Props) {
  await connection()
  const filters = parseDiscoveryFilters(await searchParams)
  const userId = await requireUserId()
  const { listings, nextCursor } = await getDiscoveryListings(filters, userId)
  const sponsored = await sponsoredPlacements(filters, userId).catch(() => [])
  const filtered = discoveryHasFilters(filters)
  return <MarketplaceShell>
    <MarketplaceHeader filters={filters} />
    <SponsoredSection rows={sponsored} />
    {filters.category !== 'all' && <DiscoveryTelemetry category={filters.category} intent={filters.intent || 'rent'}
      neighborhood={coarseNeighborhood(filters.q)} bedrooms={filters.bedrooms ? Number(filters.bedrooms) : undefined}
      budgetBand={!filters.maxPrice ? 'unspecified' : Number(filters.maxPrice) < 1000000 ? 'under-1m' : Number(filters.maxPrice) <= 3000000 ? '1m-3m' : Number(filters.maxPrice) <= 5000000 ? '3m-5m' : '5m-plus'} />}
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">{filters.q ? `Discover ${filters.q}` : 'Find a little more Lagos'}</h2><p className="flex items-center gap-1.5 text-[11px] text-text-muted"><MapPin className="h-3.5 w-3.5" />Neighborhood locations protect host privacy</p></div>
    {listings.length === 0 ? <DiscoveryEmptyState filtered={filtered} /> : filters.view === 'grid' ? <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">{listings.map(listing => <ListingGridCard key={listing.id} listing={listing} />)}</div> : <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">{listings.map(listing => <MarketplaceFeedCard key={listing.id} listing={listing} />)}</div>}
    {nextCursor && <div className="mt-10 flex justify-center"><Link href={discoveryHref(filters, { cursor: nextCursor })} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-6 py-3 text-sm font-medium hover:bg-glass-light">Explore more<ArrowRight className="h-4 w-4" /></Link></div>}
    <section className="mt-12 border-t border-border-subtle pt-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-sm font-semibold">Find your corner of the city</h2><p className="mt-1 text-xs text-text-muted">Start with a neighborhood. See where it takes you.</p></div><div className="flex flex-wrap gap-2">{['Lekki', 'Ikoyi', 'Victoria Island', 'Yaba'].map(area => <Link key={area} href={discoveryHref(filters, { q: area, cursor: null })} className="rounded-full border border-border-subtle px-4 py-2 text-xs text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-hover">{area}</Link>)}</div></div></section>
  </MarketplaceShell>
}
