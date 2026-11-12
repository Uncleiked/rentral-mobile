import Link from 'next/link'
import { ArrowUpRight, CarFront, House, LayoutGrid, Play, Search, Ship, SlidersHorizontal, Sparkles } from 'lucide-react'
import { discoveryHref, type DiscoveryFilters } from '@/lib/discovery-policy'
import { cn } from '@/lib/utils'

type Props = { filters: DiscoveryFilters }
const categories = [
  { value: 'all', label: 'All experiences', icon: Sparkles },
  { value: 'house', label: 'Homes', icon: House },
  { value: 'car', label: 'Cars', icon: CarFront },
  { value: 'boat', label: 'Boats', icon: Ship },
] satisfies { value: DiscoveryFilters['category']; label: string; icon: typeof House }[]

export function MarketplaceHeader({ filters }: Props) {
  return <section className="mb-8 min-w-0">
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0"><p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent-hover"><span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />Lagos, at your pace</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What&apos;s your next move?</h1><p className="mt-3 text-sm text-text-muted">Find your place. Choose your ride. Get out on the water.</p></div>
      <Link href="/marketplace/listing/create" className="inline-flex min-h-11 items-center gap-2 self-start text-xs font-semibold text-text-secondary hover:text-accent-hover sm:self-auto">Have something to share?<ArrowUpRight className="h-4 w-4" /></Link>
    </div>
    <form action="/marketplace" method="get" className="relative rounded-2xl border border-border-subtle bg-surface-card p-2 sm:rounded-full sm:p-2.5">
      {filters.category !== 'all' && <input type="hidden" name="category" value={filters.category} />}
      {filters.view === 'feed' && <input type="hidden" name="view" value="feed" />}
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-1.5 sm:px-5"><Search className="h-5 w-5 shrink-0 text-text-muted" /><label className="min-w-0 flex-1"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-text-primary">Where are you looking?</span><input key={filters.q} name="q" defaultValue={filters.q} maxLength={100} placeholder="Try Lekki, Ikoyi, Yaba…" className="w-full min-w-0 bg-transparent text-sm text-text-secondary placeholder:text-text-muted focus:outline-none" /></label></div>
        <details className="group shrink-0">
          <summary aria-label="Filter listings" className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-border-subtle px-3 text-xs font-medium text-text-secondary hover:bg-glass-light sm:px-5"><SlidersHorizontal className="h-4 w-4" /><span className="hidden min-[360px]:inline">Filters</span>{(filters.minPrice || filters.maxPrice || filters.intent || filters.bedrooms || filters.state) && <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />}</summary>
          <div className="absolute right-0 top-full z-40 mt-3 max-h-[70dvh] w-[min(340px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-border-subtle bg-surface-card p-5 shadow-2xl">
            <p className="mb-4 text-sm font-semibold">A little more specific</p>
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs text-text-muted">Your plans<select key={filters.intent} name="intent" defaultValue={filters.intent} className="mt-2 w-full rounded-xl border border-border-subtle bg-background-app px-3 py-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none"><option value="">Any plan</option><option value="rent">Rent</option><option value="shortlet">Shortlet</option><option value="buy">Buy</option><option value="squat">Co-living / squat</option></select></label>
              <label className="text-xs text-text-muted">State<input key={filters.state} name="state" defaultValue={filters.state} maxLength={50} placeholder="e.g. Lagos" className="mt-2 w-full rounded-xl border border-border-subtle bg-background-app px-3 py-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none" /></label>
            </div>
            <p className="mb-3 text-xs font-semibold text-text-secondary">Budget, in naira</p>
            <p className="mb-4 text-xs leading-relaxed text-text-muted">Homes are priced per year. Cars and boats are priced per day.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs text-text-muted">Minimum<input key={filters.minPrice} name="minPrice" type="number" min="0" max="9999999999" step="0.01" defaultValue={filters.minPrice} placeholder="Any" className="mt-2 w-full rounded-xl border border-border-subtle bg-background-app px-3 py-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none" /></label><label className="text-xs text-text-muted">Maximum<input key={filters.maxPrice} name="maxPrice" type="number" min="0" max="9999999999" step="0.01" defaultValue={filters.maxPrice} placeholder="Any" className="mt-2 w-full rounded-xl border border-border-subtle bg-background-app px-3 py-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none" /></label></div>
            {(filters.category === 'all' || filters.category === 'house') && <fieldset className="mt-5 border-t border-border-subtle pt-4"><legend className="px-1 text-xs font-semibold text-text-secondary">Homes</legend><div className="mt-2 grid grid-cols-3 gap-2">{[{ key: 'bedrooms', label: 'Bedrooms', value: filters.bedrooms }, { key: 'bathrooms', label: 'Bathrooms', value: filters.bathrooms }, { key: 'kitchens', label: 'Kitchens', value: filters.kitchens }].map(field => <label key={field.key} className="text-[10px] text-text-muted">{field.label}<select key={field.value} name={field.key} defaultValue={field.value} className="mt-2 w-full rounded-xl border border-border-subtle bg-background-app px-2 py-3 text-xs text-text-primary focus:border-accent-primary focus:outline-none"><option value="">Any</option>{[0, 1, 2, 3, 4, 5, 6].map(value => <option key={value} value={String(value)}>{value === 0 && field.key === 'bedrooms' ? 'Studio' : value}</option>)}</select></label>)}</div></fieldset>}
            {(filters.category === 'all' || filters.category === 'car') && <fieldset className="mt-5 border-t border-border-subtle pt-4"><legend className="px-1 text-xs font-semibold text-text-secondary">Cars</legend><div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs text-text-muted">Transmission<select key={filters.transmission} name="transmission" defaultValue={filters.transmission} className="mt-2 w-full rounded-xl border border-border-subtle bg-background-app px-2 py-3 text-xs text-text-primary focus:border-accent-primary focus:outline-none"><option value="">Any</option><option value="automatic">Automatic</option><option value="manual">Manual</option></select></label><label className="text-xs text-text-muted">Seats<input key={filters.seats} name="seats" type="number" min="1" max="100" defaultValue={filters.seats} placeholder="Any" className="mt-2 w-full rounded-xl border border-border-subtle bg-background-app px-3 py-3 text-xs text-text-primary focus:border-accent-primary focus:outline-none" /></label></div></fieldset>}
            {(filters.category === 'all' || filters.category === 'boat') && <fieldset className="mt-5 border-t border-border-subtle pt-4"><legend className="px-1 text-xs font-semibold text-text-secondary">Boats</legend><div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs text-text-muted">Guest capacity<input key={filters.capacityPersons} name="capacityPersons" type="number" min="1" max="200" defaultValue={filters.capacityPersons} placeholder="Any" className="mt-2 w-full rounded-xl border border-border-subtle bg-background-app px-3 py-3 text-xs text-text-primary focus:border-accent-primary focus:outline-none" /></label><label className="text-xs text-text-muted">Captain<select key={filters.captain} name="captain" defaultValue={filters.captain} className="mt-2 w-full rounded-xl border border-border-subtle bg-background-app px-2 py-3 text-xs text-text-primary focus:border-accent-primary focus:outline-none"><option value="">Either</option><option value="yes">Included</option><option value="no">Not included</option></select></label></div></fieldset>}
            <button type="submit" className="mt-4 min-h-11 w-full rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold text-text-inverse hover:bg-accent-hover">Apply filters</button>
            <Link href="/marketplace" className="mt-3 flex min-h-11 items-center justify-center text-center text-xs text-text-muted hover:text-text-primary">Reset all filters</Link>
          </div>
        </details>
        <button type="submit" aria-label="Search listings" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-primary text-text-inverse transition-all hover:bg-accent-hover active:scale-95"><ArrowUpRight className="h-5 w-5" /></button>
      </div>
    </form>
    <div className="mt-6 flex items-center justify-between gap-2 border-b border-border-subtle">
      <nav aria-label="Asset categories" className="flex min-w-0 gap-1 overflow-x-auto sm:gap-5">
        {categories.map(category => <Link key={category.value} href={discoveryHref(filters, { category: category.value, cursor: null, bedrooms: '', bathrooms: '', kitchens: '', transmission: '', seats: '', capacityPersons: '', captain: '' })} aria-current={filters.category === category.value ? 'page' : undefined} className={cn('flex shrink-0 items-center gap-2 border-b-2 px-2 py-4 text-xs font-semibold transition-colors sm:px-3', filters.category === category.value ? 'border-accent-primary text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary')}><category.icon className="h-[18px] w-[18px]" /><span className={category.value === 'all' ? 'hidden sm:inline' : ''}>{category.label}</span>{category.value === 'all' && <span className="sm:hidden">All</span>}</Link>)}
      </nav>
      <nav aria-label="Listing view" className="mb-1 flex shrink-0 items-center gap-1 rounded-full border border-border-subtle p-1">
        <Link href={discoveryHref(filters, { view: 'grid' })} aria-label="Grid view" aria-current={filters.view === 'grid' ? 'page' : undefined} className={cn('inline-flex size-11 items-center justify-center rounded-full', filters.view === 'grid' ? 'bg-glass-light text-text-primary' : 'text-text-muted')}><LayoutGrid className="h-4 w-4" /></Link>
        <Link href={discoveryHref(filters, { view: 'feed' })} aria-label="Walkthrough feed view" aria-current={filters.view === 'feed' ? 'page' : undefined} className={cn('inline-flex size-11 items-center justify-center rounded-full', filters.view === 'feed' ? 'bg-glass-light text-text-primary' : 'text-text-muted')}><Play className="h-4 w-4" /></Link>
      </nav>
    </div>
  </section>
}
