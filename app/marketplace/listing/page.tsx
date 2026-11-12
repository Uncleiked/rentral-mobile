import Link from 'next/link'
import { Plus, ArrowUpRight, Camera } from 'lucide-react'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { OwnerListingsWorkspace } from '@/components/listing/OwnerListingsWorkspace'
import { getListingsForProfile, getOwnProfile } from '@/lib/profile-data'

export default async function MyListingsPage({ searchParams }: { searchParams: Promise<{ status?: string; submitted?: string; saved?: string }> }) {
  const params = await searchParams
  const profile = await getOwnProfile()
  const listings = profile ? await getListingsForProfile(profile.id, { includeDrafts: true }) : []
  return <MarketplaceShell className="max-w-6xl"><div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end min-w-0 flex-wrap"><div><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-hover">Good things deserve to be shared</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl break-words">Your listings.</h1><p className="mt-3 text-sm text-text-muted">From first draft to your next booking. Manage it all here.</p></div><Link href="/marketplace/listing/create" className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-accent-primary px-5 py-3 text-xs font-semibold text-text-inverse transition-all hover:bg-accent-hover active:scale-95 min-h-11 max-w-full break-words"><Plus className="h-4 w-4" />Create Listing</Link></div><div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-5 min-w-0"><span className="text-xs text-text-muted">{listings.length} listing{listings.length === 1 ? '' : 's'} · Drafts stay private</span><Link href="/marketplace/vault" className="inline-flex items-center gap-2 text-xs font-semibold text-text-secondary hover:text-accent-hover min-h-11 max-w-full break-words"><Camera className="h-4 w-4" />Your media vault<ArrowUpRight className="h-3.5 w-3.5" /></Link></div><OwnerListingsWorkspace listings={listings} initialFilter={params.status} submittedId={params.submitted} savedId={params.saved} /></MarketplaceShell>
}
