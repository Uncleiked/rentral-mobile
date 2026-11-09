import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/db'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { accountIsActive } from '@/lib/accounts/availability'
import { runLeasedJob, recordWorkerFailure } from './worker'

export async function readEmailProviderJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('EMAIL_UNCONFIRMED')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 65536) { await reader.cancel(); throw new Error('EMAIL_UNCONFIRMED') }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Resend's keys expire after 24h; unknown sends stay uncertain instead of being replayed.
 * https://resend.com/docs/api-reference/emails/send-email */
export async function sendLifecycleEmails(): Promise<number> {
  if (process.env.NOTIFICATION_EMAIL_ENABLED !== 'true') return 0
  const cutoff = z.string().max(80).datetime({ offset: true }).safeParse(process.env.NOTIFICATION_EMAIL_SINCE)
  if (!cutoff.success) throw new Error('EMAIL_CUTOFF_REQUIRED')
  const key = process.env.RESEND_API_KEY, from = process.env.RENTRAL_EMAIL_FROM
  if (!key || !from) return 0
  return await runLeasedJob('notification-email', async ({ heartbeat }) => {
    await prisma.notification.updateMany({ where: { email_status: 'pending', createdAt: { lt: new Date(cutoff.data) } },
      data: { email_status: 'skipped', email_error_code: 'BEFORE_EMAIL_ACTIVATION' } })
    await prisma.notification.updateMany({ where: { email_status: 'sending', OR: [
      { email_claimed_at: { lte: new Date(Date.now() - 120000) } }, { email_claimed_at: null }, { email_claimed_at: { isSet: false } },
    ] }, data: { email_status: 'uncertain', email_claim_token: null, email_error_code: 'WORKER_INTERRUPTED' } })
    const pending = await prisma.notification.findMany({ where: { email_status: 'pending', createdAt: { gte: new Date(cutoff.data) } }, take: 10,
      select: { id: true, user_id: true, title: true, body: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    let accepted = 0
    for (const notification of pending) {
      await heartbeat()
      const token = randomUUID()
      const recipient = await withTransaction(async tx => {
        if (!await lockRecord(tx, 'user', notification.user_id)) return null
        const user = await tx.user.findUnique({ where: { id: notification.user_id }, select: { email: true, closed_at: true } })
        if (!user || !accountIsActive(user)) {
          await tx.notification.updateMany({ where: { id: notification.id, email_status: 'pending' }, data: { email_status: 'skipped', email_error_code: 'ACCOUNT_CLOSED' } })
          return null
        }
        const claim = await tx.notification.updateMany({ where: { id: notification.id, user_id: notification.user_id, email_status: 'pending' },
          data: { email_status: 'sending', email_claim_token: token, email_claimed_at: new Date(), email_attempts: { increment: 1 }, email_error_code: null } })
        return claim.count === 1 ? user.email : null
      })
      if (!recipient) continue
      try {
        const response = await fetch('https://api.resend.com/emails', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `rentral-notification-${notification.id}` },
          body: JSON.stringify({ from, to: [recipient], subject: notification.title,
            text: `${notification.body}\n\nOpen Rentral to view this update. Rentral never asks for passwords by email.` }) })
        if (!response.ok) {
          if ([400, 401, 403, 404, 422].includes(response.status)) {
            await prisma.notification.updateMany({ where: { id: notification.id, email_status: 'sending', email_claim_token: token },
              data: { email_status: 'failed', email_claim_token: null, email_error_code: 'PROVIDER_REJECTED' } })
            await recordWorkerFailure('notification-email', 'notification', notification.id, 'PROVIDER_REJECTED')
            continue
          }
          throw new Error('EMAIL_UNCONFIRMED')
        }
        const receipt = z.object({ id: z.uuid() }).parse(await readEmailProviderJson(response))
        const saved = await prisma.notification.updateMany({ where: { id: notification.id, email_status: 'sending', email_claim_token: token },
          data: { email_status: 'sent', provider_message_id: receipt.id, email_claim_token: null, email_error_code: null } })
        if (saved.count === 1) accepted += 1
      } catch {
        await prisma.notification.updateMany({ where: { id: notification.id, email_status: 'sending', email_claim_token: token },
          data: { email_status: 'uncertain', email_claim_token: null, email_error_code: 'DELIVERY_UNCONFIRMED' } })
        await recordWorkerFailure('notification-email', 'notification', notification.id, 'DELIVERY_UNCONFIRMED')
      }
    }
    // Accepted by the provider is not proof of delivery; delivered_at stays unset.
    return { result: accepted, cursor: {} }
  }) ?? 0
}
