import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight, Heart } from 'lucide-react'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { ListingGridCard } from '@/components/feed/ListingGridCard'
import { requireUserId } from '@/lib/action-helpers'
import { getSavedListings } from '@/lib/discovery'
import { platformEnabled } from '@/lib/platform'

export default async function SavedListingsPage() {
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')
  const available = platformEnabled()
  const listings = await getSavedListings(userId)
  return <MarketplaceShell><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-hover">Keep the possibilities</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your saved finds.</h1><p className="mt-3 text-sm text-text-muted">A little collection of places, rides, and plans worth coming back to.</p>{listings.length > 0 ? <div className="mt-9 grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">{listings.map(listing => <ListingGridCard key={listing.id} listing={listing} />)}</div> : <div className="mt-9 flex flex-col items-center rounded-3xl border border-border-subtle bg-surface-card px-6 py-20 text-center"><div className="mb-5 rounded-full bg-glass-light p-4"><Heart className="h-6 w-6 text-text-muted" /></div><h2 className="text-xl font-semibold">{available ? 'Something will catch your eye.' : 'Your collection is getting ready.'}</h2><p className="mt-3 max-w-sm text-sm leading-relaxed text-text-muted">{available ? 'Tap the heart on a listing to keep it here. Only listings that are still available appear in your collection.' : 'Saving will be available once the marketplace update is ready. You can continue exploring published listings.'}</p><Link href="/marketplace" className="mt-7 inline-flex items-center gap-2 rounded-full bg-accent-primary px-5 py-3 text-xs font-semibold text-text-inverse hover:bg-accent-hover">Find your next thing<ArrowUpRight className="h-4 w-4" /></Link></div>}</MarketplaceShell>
}
