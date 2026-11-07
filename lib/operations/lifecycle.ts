import prisma from '@/lib/db'
import { platformEnabled } from '@/lib/platform'
import { expireListingReservations } from '@/lib/bookings/service'

export async function runLifecycleBatch(): Promise<{ expiredListings: number; reminders: number; emails: number; prunedEvents: number }> {
  if (!platformEnabled() || process.env.LIFECYCLE_WORKER_ENABLED !== 'true') throw new Error('WORKER_DISABLED')
  const now = new Date()
  const expiredListings = await prisma.$transaction(async tx => {
    const listings = await tx.$queryRaw<{ id: string }[]>`
      SELECT l.id FROM "Listing" l WHERE EXISTS (SELECT 1 FROM "Booking" b
        WHERE b.listing_id=l.id AND b.expires_at<=${now} AND
        (b.status='awaiting_payment' OR (b.status='confirmed' AND b.kind='hold')))
      ORDER BY l.id LIMIT 20 FOR UPDATE OF l SKIP LOCKED
    `
    for (const listing of listings) {
      await expireListingReservations(tx, listing.id, now)
    }
    return listings.length
  })
  const leases = await prisma.booking.findMany({
    where: { kind: 'rental', status: { in: ['confirmed', 'completed'] }, listing: { category: 'house' },
      starts_at: { lte: new Date(now.getTime() - 300 * 86400000) },
      ends_at: { gt: now, lte: new Date(now.getTime() + 30 * 86400000) } },
    select: { id: true, seeker_id: true, ends_at: true }, take: 50, orderBy: { ends_at: 'asc' },
  })
  const reminders = leases.length ? await prisma.notification.createMany({ skipDuplicates: true, data: leases.map(lease => ({
    user_id: lease.seeker_id, kind: 'renewal', title: 'Your lease is nearing renewal',
    body: 'Record your renewal and who received the payment. References remain pending until supported evidence is reviewed.',
    href: '/marketplace/renewals', dedupe_key: `renewal:${lease.id}:${lease.ends_at.toISOString()}`,
  })) }) : { count: 0 }
  let emails = 0
  const key = process.env.RESEND_API_KEY, from = process.env.RENTRAL_EMAIL_FROM
  if (key && from) {
    const pending = await prisma.notification.findMany({ where: { kind: 'renewal', email_status: 'pending' }, take: 10,
      select: { id: true, title: true, body: true, user: { select: { email: true } } }, orderBy: { createdAt: 'asc' } })
    for (const notification of pending) {
      const claim = await prisma.notification.updateMany({ where: { id: notification.id, email_status: 'pending' }, data: { email_status: 'sending' } })
      if (!claim.count) continue
      try {
        const response = await fetch('https://api.resend.com/emails', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `rentral-renewal-${notification.id}` },
          body: JSON.stringify({ from, to: [notification.user.email], subject: notification.title,
            text: `${notification.body}\n\nOpen Rentral and go to Dashboard → Lease renewals. Rentral never asks for passwords by email.` }) })
        if (!response.ok) throw new Error('EMAIL_UNCONFIRMED')
        await prisma.notification.updateMany({ where: { id: notification.id, email_status: 'sending' }, data: { email_status: 'sent' } })
        emails += 1
      } catch {
        // Unknown delivery outcomes stay for operator reconciliation, not blind retry.
        await prisma.notification.updateMany({ where: { id: notification.id, email_status: 'sending' }, data: { email_status: 'uncertain' } })
      }
    }
  }
  const pruned = await prisma.marketEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * 86400000) } } })
  return { expiredListings, reminders: reminders.count, emails, prunedEvents: pruned.count }
}
