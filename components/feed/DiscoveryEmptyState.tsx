import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, SearchX } from 'lucide-react'

type Props = { filtered?: boolean }

export function DiscoveryEmptyState({ filtered = false }: Props) {
  return <div className="min-w-0 overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
    <div className="grid md:grid-cols-2"><div className="flex flex-col items-start justify-center px-6 py-12 sm:px-10"><div className="mb-6 rounded-full border border-glass-border-light bg-glass-light p-3"><SearchX className="h-5 w-5 text-text-muted" /></div><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-hover">Room for something great</p><h2 className="max-w-sm text-3xl font-medium leading-tight tracking-tight">{filtered ? 'A little more room to explore.' : 'Your next find is on its way.'}</h2><p className="mt-4 max-w-sm text-sm leading-relaxed text-text-muted">{filtered ? 'No published listings match these filters yet. Try a different neighborhood or a wider budget.' : 'New homes, cars, and boats appear here once their publication checks are complete. Have an asset to share? Be among the first to list it.'}</p><div className="mt-7 flex flex-wrap gap-3"><Link href={filtered ? '/marketplace' : '/marketplace/listing/create'} className="flex min-h-11 items-center gap-2 rounded-full bg-accent-primary px-5 py-3 text-xs font-semibold text-text-inverse hover:bg-accent-hover">{filtered ? 'Clear filters' : 'List your first asset'}<ArrowUpRight className="h-4 w-4" /></Link><Link href="/help" className="inline-flex min-h-11 items-center rounded-full border border-border-subtle px-5 py-3 text-xs font-medium hover:bg-glass-light">How Rentral works</Link></div></div><div className="relative hidden min-h-[390px] overflow-hidden md:block"><Image src="/home/hero-home.jpg" alt="An airy living space with warm natural light" fill sizes="50vw" className="object-cover" /><p className="absolute bottom-4 left-4 rounded-full bg-glass-dark px-3 py-1.5 text-[10px] text-text-primary backdrop-blur-md">Inspiration for your next chapter · illustrative image</p></div></div>
  </div>
}
