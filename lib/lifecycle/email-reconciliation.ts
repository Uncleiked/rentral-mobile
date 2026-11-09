import { z } from 'zod'
import prisma from '@/lib/db'
import { assertLifecycleReady } from '@/lib/database/readiness'
import { withTransaction } from '@/lib/database/transactions'
import { assertStaffPermission, hasStaffPermission } from '@/lib/auth/roles'
import { LifecycleError } from './policy'
import { readEmailProviderJson } from './email'

const receiptSchema = z.object({ id: z.uuid(), to: z.array(z.string().email()).min(1).max(50), subject: z.string().max(2000),
  last_event: z.enum(['bounced', 'canceled', 'clicked', 'complained', 'delivered', 'delivery_delayed', 'failed', 'opened', 'queued', 'scheduled', 'sent', 'suppressed']),
})

/** Provider readback is safe to repeat. A missing receipt never triggers a resend.
 * https://resend.com/docs/api-reference/emails/retrieve-email */
export async function reconcileNotificationEmail(actorId: string, id: string, input: unknown): Promise<{ status: 'delivery_confirmed' | 'provider_failed' | 'provider_accepted'; observedAt: string }> {
  await assertLifecycleReady()
  const reason = z.string().trim().min(30).max(2000).parse(input)
  if (!await hasStaffPermission(actorId, 'operations:manage')) throw new Error('Staff access required.')
  const notification = await prisma.notification.findUnique({ where: { id }, select: { id: true, title: true, email_status: true, provider_message_id: true,
    email_delivered_at: true, user: { select: { email: true } } } })
  const providerId = z.uuid().safeParse(notification?.provider_message_id)
  if (!notification || !providerId.success) throw new LifecycleError('No provider receipt is recorded. Review the provider dashboard; this action will not resend the email.')
  if (notification.email_status === 'sending') throw new LifecycleError('This email attempt is still in progress. Wait for its outcome before reconciliation.')
  const key = process.env.RESEND_API_KEY
  if (!key) throw new LifecycleError('Email-provider lookup is unavailable. The existing delivery state was preserved.')
  await withTransaction(async tx => {
    await assertStaffPermission(tx, actorId, 'operations:manage')
    await tx.adminAudit.create({ data: { actor_id: actorId, action: 'email_lookup_attempt', target_type: 'notification', target_id: id, reason } })
  })
  let receipt: z.infer<typeof receiptSchema>
  try {
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerId.data)}`, {
      cache: 'no-store', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error('EMAIL_UNCONFIRMED')
    receipt = receiptSchema.parse(await readEmailProviderJson(response))
    if (receipt.id !== notification.provider_message_id || receipt.subject !== notification.title || !receipt.to.some(email => email.toLowerCase() === notification.user.email.toLowerCase())) throw new Error('EMAIL_BINDING_MISMATCH')
  } catch { throw new LifecycleError('The provider receipt could not be verified. Existing delivery state was preserved; the email was not resent.') }
  const failed = ['bounced', 'canceled', 'complained', 'failed', 'suppressed'].includes(receipt.last_event)
  const delivered = receipt.last_event === 'delivered' || Boolean(notification.email_delivered_at)
  const observed = new Date()
  await withTransaction(async tx => {
    await assertStaffPermission(tx, actorId, 'operations:manage')
    const changed = await tx.notification.updateMany({ where: { id, email_status: notification.email_status, provider_message_id: notification.provider_message_id }, data: {
      email_status: failed ? 'failed' : 'sent', email_error_code: failed ? `PROVIDER_${receipt.last_event.toUpperCase()}` : null,
      ...(receipt.last_event === 'delivered' && !notification.email_delivered_at ? { email_delivered_at: observed } : {}),
    } })
    if (changed.count !== 1) throw new LifecycleError('The email state changed during lookup. Refresh before reconciling again.')
    await tx.adminAudit.create({ data: { actor_id: actorId, action: 'email_receipt_reconciled', target_type: 'notification', target_id: id, reason,
      metadata: { providerEvent: receipt.last_event, sentAgain: false } } })
  })
  return { status: failed ? 'provider_failed' : delivered ? 'delivery_confirmed' : 'provider_accepted', observedAt: observed.toISOString() }
}
