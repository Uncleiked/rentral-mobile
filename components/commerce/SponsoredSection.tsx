'use client'
import { useEffect, useRef } from 'react'
import { z } from 'zod'
import { ListingGridCard } from '@/components/feed/ListingGridCard'
import type { SponsoredPlacement } from '@/lib/commerce/placements'
import { useCommercialRequest } from '@/components/account/ApiActorScope'

function SponsoredOption({ row }: { row: SponsoredPlacement }) {
  const commercialRequest = useCommercialRequest()
  const container = useRef<HTMLDivElement>(null)
  const observe = (event: 'impression' | 'click') => { void commercialRequest(`sponsored/${row.campaignId}/events`, z.object({ recorded: z.boolean() }), 'POST', { event }).catch(() => undefined) }
  useEffect(() => {
    const node = container.current
    if (!node || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(entries => { if (document.visibilityState === 'visible' && entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void commercialRequest(`sponsored/${row.campaignId}/events`, z.object({ recorded: z.boolean() }), 'POST', { event: 'impression' }).catch(() => undefined) } }, { threshold: 0.5 })
    observer.observe(node); return () => observer.disconnect()
  }, [row.campaignId, commercialRequest])
  return <div ref={container} className="space-y-3" onClickCapture={event => { const anchor = event.target instanceof Element ? event.target.closest('a') : null; if (anchor?.getAttribute('href') === `/marketplace/listing/${row.listing.id}`) observe('click') }}><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-border-subtle bg-accent-muted px-3 py-1 text-xs font-semibold text-accent-hover">Sponsored{row.billingEnvironment === 'test' ? ' · Test mode' : ''}</span><p className="text-sm text-text-secondary">{row.headline}</p></div><ListingGridCard listing={row.listing} /></div>
}
export function SponsoredSection({ rows }: { rows: SponsoredPlacement[] }) {
  if (!rows.length) return null
  return <section aria-label="Sponsored options" className="mb-9 space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-5"><div><h2 className="font-semibold">Sponsored options</h2><p className="mt-2 text-xs text-text-muted">Paid placements matching your current filters.</p></div><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{rows.map(row => <SponsoredOption key={row.campaignId} row={row} />)}</div></section>
}
