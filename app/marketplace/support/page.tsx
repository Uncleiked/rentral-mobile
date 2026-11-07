import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Flag, LifeBuoy } from 'lucide-react'
import { requireUserId } from '@/lib/action-helpers'
import prisma from '@/lib/db'
import { platformEnabled } from '@/lib/platform'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'

export default async function SupportPage() {
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')
  const reports = platformEnabled() ? await prisma.dispute.findMany({ where: { opened_by: userId }, take: 50, orderBy: { createdAt: 'desc' },
    select: { id: true, booking_id: true, reason: true, status: true, resolution: true } }) : []
  return <MarketplaceShell><div className="mx-auto max-w-3xl space-y-7 py-5"><div><p className="text-xs uppercase tracking-widest text-accent-hover">We’re here to help</p><h1 className="mt-3 text-3xl font-semibold">Support & reports</h1><p className="mt-3 text-sm leading-relaxed text-text-muted">Open a booking to report an issue. Each report stays linked to that booking and is reviewed with an audit trail.</p></div><div className="grid gap-4 sm:grid-cols-2"><Link href="/marketplace/bookings" className="rounded-2xl border border-border-subtle bg-surface-card p-6"><Flag className="mb-4 size-6 text-accent-primary" /><h2 className="font-semibold">A booking problem</h2><p className="mt-2 text-sm text-text-muted">Find your booking and describe what happened.</p></Link><Link href="/help" className="rounded-2xl border border-border-subtle bg-surface-card p-6"><LifeBuoy className="mb-4 size-6 text-accent-primary" /><h2 className="font-semibold">How Rentral works</h2><p className="mt-2 text-sm text-text-muted">Get guidance on listings, verification and check-in.</p></Link></div><section><h2 className="mb-4 text-lg font-semibold">Your reports</h2>{!reports.length && <p className="rounded-2xl border border-border-subtle p-6 text-sm text-text-muted">You have no open reports.</p>}<div className="space-y-4">{reports.map(item => <article key={item.id} className="rounded-2xl border border-border-subtle bg-surface-card p-5"><div className="flex justify-between gap-3"><Link href={`/marketplace/bookings/${item.booking_id}`} className="text-sm font-semibold">Booking {item.booking_id.slice(0, 8)}</Link><span className="text-xs text-accent-hover">{item.status}</span></div><p className="mt-4 whitespace-pre-wrap text-sm text-text-secondary">{item.reason}</p>{item.resolution && <p className="mt-4 border-t border-border-subtle pt-4 text-sm text-text-muted">Review decision: {item.resolution}</p>}</article>)}</div></section></div></MarketplaceShell>
}
