import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

export function MarketplaceSuggestions() {
  return <aside className="rounded-2xl border border-border-subtle bg-surface-card p-6"><ShieldCheck className="mb-4 h-5 w-5 text-accent-hover" /><h2 className="text-sm font-semibold">Make room for a better rental.</h2><p className="mt-3 text-xs leading-relaxed text-text-muted">Watch the walkthrough, meet your host, and keep your conversations and payment records together.</p><Link href="/help" className="mt-4 inline-block text-xs font-semibold text-accent-hover">Your guide to Rentral</Link></aside>
}
