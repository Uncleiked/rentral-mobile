import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, Heart, Layers3, MessageCircle, ArrowUpRight, ReceiptText } from 'lucide-react'
import { requireUserId } from '@/lib/action-helpers'
import prisma from '@/lib/db'
import { platformEnabled } from '@/lib/platform'
import { formatKobo } from '@/lib/bookings/policy'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { MemberActivityCards } from '@/components/account/MemberActivityCards'
import { memberDashboard } from '@/lib/accounts/metrics'
import { hasStaffPermission } from '@/lib/auth/roles'

export default async function DashboardPage() {
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')
  const [staffWorkspace, dashboard, payments] = await Promise.all([
    hasStaffPermission(userId, 'staff:workspace'),
    platformEnabled() ? memberDashboard(userId) : null,
    platformEnabled() ? prisma.paymentIntent.findMany({ where: { user_id: userId }, take: 30, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, reference: true, kind: true, status: true, amount_kobo: true, booking_id: true, provider_environment: true, createdAt: true } }) : [],
  ])
  const counts = dashboard?.counts ?? { assets: 0, activeBookings: 0, saved: 0, conversations: 0 }
  const cards = [{ label: 'Your assets', count: counts.assets, icon: Layers3, href: '/marketplace/listing' },
    { label: 'Active bookings', count: counts.activeBookings, icon: CalendarDays, href: '/marketplace/bookings' },
    { label: 'Saved finds', count: counts.saved, icon: Heart, href: '/marketplace/saved' },
    { label: 'Conversations', count: counts.conversations, icon: MessageCircle, href: '/marketplace/messages' }]
  const links = [['/marketplace/vault', 'Media vault'], ['/marketplace/renewals', 'Lease renewals'], ['/marketplace/terminations', 'Early lease end'],
    ['/marketplace/squat-mates', 'Squat-Mates'], ['/marketplace/insights', 'Insights'], ['/marketplace/purchases', 'Purchases'],
    ['/marketplace/campaigns', 'Sponsored campaigns'], ['/marketplace/financial', 'Refund and payment history'],
    ['/marketplace/support', 'Support'], ['/privacy', 'Privacy choices'], ...(staffWorkspace ? [['/marketplace/admin', 'Staff workspace']] : [])]
  return <MarketplaceShell><div className="space-y-9 py-4">
    <div><p className="text-xs uppercase tracking-widest text-accent-hover">Your Rentral</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl break-words">Every move, in one place.</h1><p className="mt-3 text-sm text-text-muted">Your listings, plans and recorded activity.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(card => <Link key={card.href} href={card.href} className="rounded-2xl border border-border-subtle bg-surface-card p-6 transition-colors hover:border-accent-primary min-w-0 max-w-full wrap-anywhere text-text-primary min-h-11 break-words block"><div className="flex justify-between min-w-0 flex-wrap gap-3"><card.icon className="size-5 text-accent-primary" /><ArrowUpRight className="size-4 text-text-muted" /></div><p className="mt-7 text-3xl font-semibold">{card.count}</p><p className="mt-2 text-xs text-text-muted">{card.label}</p></Link>)}</div>
    {dashboard ? <MemberActivityCards activity={dashboard.activity} /> : <p className="text-sm text-text-muted">Marketplace activity is currently unavailable.</p>}
    <section><div className="mb-5 flex items-center justify-between gap-4 min-w-0 flex-wrap"><h2 className="text-xl font-semibold break-words">Your latest payment records</h2><ReceiptText className="size-5 text-text-muted" /></div>
      <p className="mb-5 max-w-2xl text-xs leading-relaxed text-text-muted">The latest 30 records include pending checkouts and provider-confirmed receipts. A receipt is separate from booking confirmation and settlement.</p>
      {!payments.length ? <p className="rounded-2xl border border-border-subtle bg-surface-card p-8 text-sm text-text-muted min-w-0 max-w-full wrap-anywhere">No payment records yet. Checkouts will appear here.</p> : <div className="space-y-3">{payments.map(payment => <article key={payment.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-card p-5 min-w-0 max-w-full wrap-anywhere text-text-primary"><div><p className="text-sm font-semibold">{payment.kind.replaceAll('_', ' ')}</p><p className="mt-2 break-all text-xs text-text-muted">{payment.reference}</p><p className="mt-1 text-xs text-text-muted">{payment.createdAt.toLocaleDateString('en-NG')} · Paystack {payment.provider_environment ?? 'unrecorded'} mode</p></div><div className="text-right"><p className="font-semibold">{formatKobo(payment.amount_kobo)}</p><p className="mt-1 text-xs text-accent-hover">{payment.status.replaceAll('_', ' ')}</p>{payment.booking_id ? <Link href={`/marketplace/bookings/${payment.booking_id}`} className="mt-2 inline-block text-xs text-text-muted min-h-11 max-w-full break-words">Open booking →</Link> : null}</div></article>)}</div>}
    </section>
    <nav aria-label="Account tools" className="flex flex-wrap gap-3">{links.map(([href, label]) => <Link key={href} href={href} className="rounded-full border border-border-subtle px-5 py-3 text-xs text-text-secondary hover:bg-glass-light min-h-11 max-w-full break-words inline-flex items-center">{label}</Link>)}</nav>
  </div></MarketplaceShell>
}
