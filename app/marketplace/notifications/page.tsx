import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell } from 'lucide-react'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { NotificationItem } from '@/components/notifications/NotificationItem'
import { requireUserId } from '@/lib/action-helpers'
import prisma from '@/lib/db'
import { platformEnabled } from '@/lib/platform'

export default async function NotificationsPage() {
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')
  const notifications = platformEnabled() ? await prisma.notification.findMany({ where: { user_id: userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
    select: { id: true, title: true, body: true, href: true, read_at: true, createdAt: true } }) : []
  return <MarketplaceShell><div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12"><p className="text-xs uppercase tracking-widest text-accent-hover">In the loop</p><h1 className="mb-8 mt-2 text-3xl font-semibold">Notifications</h1><div className="space-y-3">{notifications.map(item => <NotificationItem key={item.id} id={item.id} title={item.title} body={item.body} href={item.href} read={Boolean(item.read_at)} date={item.createdAt.toISOString()} />)}</div>{!notifications.length && <div className="rounded-2xl border border-border-subtle bg-surface-card p-10 text-center"><Bell className="mx-auto mb-4 size-10 text-accent-primary" /><h2 className="text-xl font-semibold">You’re all caught up.</h2><p className="mt-3 text-sm text-text-muted">Booking updates, messages, and renewal reminders will appear here.</p><Link href="/marketplace" className="mt-6 inline-block text-sm font-semibold text-accent-hover">Explore Rentral →</Link></div>}</div></MarketplaceShell>
}
