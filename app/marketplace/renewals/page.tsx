import Link from 'next/link'
import { redirect } from 'next/navigation'
import { RefreshCcw } from 'lucide-react'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { RenewalForm } from '@/components/renewals/RenewalForm'
import { requireUserId } from '@/lib/action-helpers'
import prisma from '@/lib/db'
import { platformEnabled } from '@/lib/platform'

export default async function RenewalsPage() {
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')
  const [bookings, renewals] = platformEnabled() ? await Promise.all([
    prisma.booking.findMany({ where: { seeker_id: userId, kind: 'rental', status: { in: ['confirmed', 'completed'] }, listing: { category: 'house' } }, take: 50,
      select: { id: true, ends_at: true }, orderBy: { ends_at: 'desc' } }),
    prisma.renewal.findMany({ where: { user_id: userId }, take: 50, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, recipient_route: true, createdAt: true } }),
  ]) : [[], []]
  return <MarketplaceShell><div className="mx-auto w-full max-w-3xl space-y-7 py-4"><div><p className="text-xs uppercase tracking-widest text-accent-hover">Keep your history together</p><h1 className="mt-3 text-3xl font-semibold">Lease renewals</h1><p className="mt-3 text-sm leading-relaxed text-text-muted">Record your next rent payment and whether you paid the original agent or the landlord directly.</p></div>{bookings.length ? <RenewalForm bookings={bookings.map(item => ({ id: item.id, label: `Lease ${item.id.slice(0, 8)} · ends ${item.ends_at.toLocaleDateString('en-NG')}` }))} /> : <div className="rounded-2xl border border-border-subtle bg-surface-card p-8 text-center"><RefreshCcw className="mx-auto mb-4 size-9 text-accent-primary" /><h2 className="text-xl font-semibold">Your next chapter starts here.</h2><p className="mt-3 text-sm text-text-muted">Residential leases booked through Rentral will appear when available.</p><Link href="/marketplace/bookings" className="mt-5 inline-block text-sm text-accent-hover">View bookings →</Link></div>}<section className="space-y-3">{renewals.map(item => <article key={item.id} className="rounded-xl border border-border-subtle p-4"><p className="text-sm">{item.recipient_route.replaceAll('_', ' ')}</p><p className="mt-2 text-xs text-text-muted">{item.status.replaceAll('_', ' ')} · {item.createdAt.toLocaleDateString('en-NG')}</p></article>)}</section></div></MarketplaceShell>
}
