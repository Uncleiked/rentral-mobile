'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search, CheckCircle2, Plus, FilePenLine } from 'lucide-react'
import { ListingsGrid } from '@/components/profile/ListingsGrid'
import type { ListingSummary } from '@/lib/profile-data'
import { filterOwnerListings, OWNER_LISTING_FILTERS, ownerListingFilter, ownerListingGroup, ownerListingStatus } from '@/lib/listings/owner-inventory'

type Props = { listings: ListingSummary[]; initialFilter?: string; submittedId?: string; savedId?: string }

export function OwnerListingsWorkspace({ listings, initialFilter, submittedId, savedId }: Props) {
  const [filter, setFilter] = useState(() => ownerListingFilter(initialFilter))
  const [search, setSearch] = useState('')
  const visible = useMemo(() => filterOwnerListings(listings, filter, search), [listings, filter, search])
  const submitted = listings.find(listing => listing.id === submittedId && listing.status !== 'draft')
  const saved = listings.find(listing => listing.id === savedId && listing.status === 'draft')
  return <section className="min-w-0 space-y-5" aria-label="Manage your listings">
    {(submitted || saved) && <div role="status" className="flex min-w-0 items-start gap-3 rounded-2xl border border-border-subtle bg-surface-card p-4 text-sm">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-hover" aria-hidden="true" />
      <div className="min-w-0"><p className="font-semibold">{submitted ? 'Your listing has been submitted and saved.' : 'Your draft is saved.'}</p><p className="mt-1 text-text-secondary">{submitted ? `Current status: ${ownerListingStatus(submitted)}. Open the listing for publication checks and next steps.` : 'Find it in Drafts and continue editing whenever you are ready. Drafts are private.'}</p></div>
    </div>}
    <nav aria-label="Listing status filters" className="flex max-w-full flex-wrap gap-2">
      {OWNER_LISTING_FILTERS.map(item => {
        const count = item.value === 'all' ? listings.length : listings.filter(listing => ownerListingGroup(listing) === item.value).length
        return <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}
          className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary ${filter === item.value ? 'border-accent-primary bg-accent-muted text-text-primary' : 'border-border-subtle bg-surface-card text-text-secondary hover:text-text-primary'}`}>
          {item.label}<span className="rounded-full bg-glass-light px-2 py-0.5 text-[10px] tabular-nums">{count}</span>
        </button>
      })}
    </nav>
    <label className="relative block min-w-0"><span className="sr-only">Search your listings</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-muted" aria-hidden="true" />
      <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title, asset type or listing ID" className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border-subtle bg-surface-card py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-2 focus:outline-accent-primary" />
    </label>
    <p className="text-xs leading-5 text-text-muted" role="status">{visible.length} of {listings.length} listings{filter === 'submitted' ? '. Submitted listings stay here while review, payment or media processing is completed.' : '. Drafts and unpublished listings are visible only to you.'}</p>
    {visible.length ? <ListingsGrid listings={visible} owner /> : <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-subtle px-5 py-12 text-center">
      <FilePenLine className="h-7 w-7 text-text-muted" aria-hidden="true" /><h2 className="text-base font-semibold">{listings.length ? 'No matching listings' : 'Your first listing starts here'}</h2>
      <p className="max-w-md text-sm leading-6 text-text-secondary">{listings.length ? 'Try another status or a shorter search. Submitted listings move out of Drafts and remain in All listings.' : 'Save an incomplete listing as a draft, add your media and documents later, then submit when ready.'}</p>
      {listings.length ? <button type="button" onClick={() => { setFilter('all'); setSearch('') }} className="min-h-11 rounded-xl border border-border-subtle px-4 py-2 text-sm font-semibold">Clear filters</button> : <Link href="/marketplace/listing/create" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent-primary px-4 py-2 text-sm font-semibold text-text-inverse"><Plus className="h-4 w-4" aria-hidden="true" />Create listing</Link>}
    </div>}
  </section>
}
