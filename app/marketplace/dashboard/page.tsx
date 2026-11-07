import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, Heart, Layers3, MessageCircle, ArrowUpRight, ReceiptText } from 'lucide-react'
import { requireUserId } from '@/lib/action-helpers'
import prisma from '@/lib/db'
import { platformEnabled } from '@/lib/platform'
import { formatKobo } from '@/lib/bookings/policy'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { isAdminId } from '@/lib/operations/access'

export default async function DashboardPage() {
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')
  const assets = await prisma.listing.count({ where: { lister_id: userId } })
  const [bookings, saved, conversations, payments] = platformEnabled() ? await Promise.all([
    prisma.booking.count({ where: { OR: [{ seeker_id: userId }, { lister_id: userId }], status: { in: ['requested', 'awaiting_payment', 'confirmed'] } } }),
    prisma.savedListing.count({ where: { user_id: userId } }),
    prisma.conversation.count({ where: { OR: [{ seeker_id: userId }, { lister_id: userId }] } }),
    prisma.paymentIntent.findMany({ where: { user_id: userId }, take: 30, orderBy: { createdAt: 'desc' }, select: { id: true, reference: true, kind: true, status: true, amount_kobo: true, booking_id: true, listing_id: true, createdAt: true } }),
  ]) : [0, 0, 0, []]
  const cards = [{ label: 'Your assets', count: assets, icon: Layers3, href: '/marketplace/listing' }, { label: 'Active bookings', count: bookings, icon: CalendarDays, href: '/marketplace/bookings' }, { label: 'Saved finds', count: saved, icon: Heart, href: '/marketplace/saved' }, { label: 'Conversations', count: conversations, icon: MessageCircle, href: '/marketplace/messages' }]
  return <MarketplaceShell><div className="space-y-9 py-4"><div><p className="text-xs uppercase tracking-widest text-accent-hover">Your Rentral</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Every move, in one place.</h1><p className="mt-3 text-sm text-text-muted">Your listings, plans and provider-confirmed payment history.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(card => <Link key={card.href} href={card.href} className="rounded-2xl border border-border-subtle bg-surface-card p-6 transition-colors hover:border-accent-primary"><div className="flex justify-between"><card.icon className="size-5 text-accent-primary" /><ArrowUpRight className="size-4 text-text-muted" /></div><p className="mt-7 text-3xl font-semibold">{card.count}</p><p className="mt-2 text-xs text-text-muted">{card.label}</p></Link>)}</div><section><div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">Your payment history</h2><ReceiptText className="size-5 text-text-muted" /></div><p className="mb-5 max-w-2xl text-xs leading-relaxed text-text-muted">Payment receipt is separate from booking confirmation, custody and settlement. These records are not an in-app wallet or a credit-bureau score.</p>{!payments.length ? <p className="rounded-2xl border border-border-subtle bg-surface-card p-8 text-sm text-text-muted">No payment records yet. Successful and pending checkouts will appear here.</p> : <div className="space-y-3">{payments.map(payment => <article key={payment.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-card p-5"><div><p className="text-sm font-semibold">{payment.kind.replaceAll('_', ' ')}</p><p className="mt-2 break-all text-[10px] text-text-muted">{payment.reference}</p><p className="mt-1 text-xs text-text-muted">{payment.createdAt.toLocaleDateString('en-NG')}</p></div><div className="text-right"><p className="font-semibold">{formatKobo(payment.amount_kobo)}</p><p className="mt-1 text-xs text-accent-hover">{payment.status.replaceAll('_', ' ')}</p>{payment.booking_id && <Link href={`/marketplace/bookings/${payment.booking_id}`} className="mt-2 inline-block text-xs text-text-muted">Open booking →</Link>}</div></article>)}</div>}</section><nav aria-label="Account tools" className="flex flex-wrap gap-3">{[['/marketplace/vault', 'Media vault'], ['/marketplace/renewals', 'Lease renewals'], ['/marketplace/support', 'Support'], ['/privacy', 'Privacy choices'], ...(isAdminId(userId) ? [['/marketplace/admin', 'Staff workspace']] : [])].map(([href, label]) => <Link key={href} href={href} className="rounded-full border border-border-subtle px-5 py-3 text-xs text-text-secondary hover:bg-glass-light">{label}</Link>)}</nav></div></MarketplaceShell>
}
