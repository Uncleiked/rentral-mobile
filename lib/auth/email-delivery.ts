import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { assertAuthSecurityReady } from '@/lib/database/readiness'
import { authEmailConfiguration } from './email-config'
import { openAuthEmail, sealAuthEmail, type AuthEmailPayload } from './email-crypto'
import { AuthMailError, sendAuthEmail } from './email-provider'

const MAX_ATTEMPTS = 8, LEASE_MS = 60000
export type AuthEmailKind = 'password_reset' | 'email_change_old' | 'email_change_new' | 'security_notice'

/** Called inside the same transaction as the one-use capability. No external effect occurs here. */
export async function queueAuthEmail(tx: Prisma.TransactionClient, input: { userId: string; kind: AuthEmailKind; dedupeKey: string; expiresAt: Date; payload: AuthEmailPayload }): Promise<string> {
  const id = randomUUID(), sealed = sealAuthEmail(id, input.kind, input.payload)
  const row = await tx.authEmailDelivery.create({ data: { id, user_id: input.userId, kind: input.kind, dedupe_key: input.dedupeKey, encrypted_payload: sealed.encryptedPayload,
    key_id: sealed.keyId, expires_at: input.expiresAt, status: 'pending', attempts: 0, next_attempt_at: new Date(), lease_token: null, lease_expires_at: null,
    last_error_code: null, provider_message_id: null, sent_at: null } })
  return row.id
}

/** Invalidating a code also removes queued plaintext-equivalent ciphertext. Metadata stays available. */
export async function cancelAuthEmails(tx: Prisma.TransactionClient, userId: string, kinds: AuthEmailKind[]): Promise<void> {
  await tx.authEmailDelivery.updateMany({ where: { user_id: userId, kind: { in: kinds }, status: { in: ['pending', 'sending', 'uncertain', 'dead_letter'] } }, data: {
    status: 'expired', encrypted_payload: null, lease_token: null, lease_expires_at: null, last_error_code: 'CAPABILITY_INVALIDATED', next_attempt_at: null,
  } })
}

export async function processAuthEmailDelivery(id: string): Promise<boolean> {
  if (authEmailConfiguration().delivery !== 'email') return false
  await assertAuthSecurityReady()
  const now = new Date(), token = randomUUID()
  const claimed = await prisma.authEmailDelivery.updateMany({ where: { id, expires_at: { gt: now }, encrypted_payload: { not: null }, attempts: { lt: MAX_ATTEMPTS }, AND: [
    { OR: [{ status: { in: ['pending', 'uncertain'] } }, { status: 'sending', lease_expires_at: { lte: now } }] },
    { OR: [{ next_attempt_at: null }, { next_attempt_at: { isSet: false } }, { next_attempt_at: { lte: now } }] },
  ] }, data: { status: 'sending', attempts: { increment: 1 }, lease_token: token, lease_expires_at: new Date(Date.now() + LEASE_MS) } })
  if (!claimed.count) return false
  const row = await prisma.authEmailDelivery.findUniqueOrThrow({ where: { id } })
  try {
    // Resend's idempotency retention is 24h. Challenge delivery expires sooner; never exceed either window.
    if (row.expires_at <= new Date() || Date.now() - row.createdAt.getTime() >= 23 * 3600000) {
      await prisma.authEmailDelivery.updateMany({ where: { id, lease_token: token, status: 'sending' }, data: { status: 'expired', encrypted_payload: null,
        lease_token: null, lease_expires_at: null, next_attempt_at: null, last_error_code: 'CAPABILITY_EXPIRED' } })
      return false
    }
    const payload = openAuthEmail(row.id, row.kind, row.encrypted_payload!)
    const providerId = await sendAuthEmail(row.id, payload)
    await prisma.authEmailDelivery.updateMany({ where: { id, lease_token: token, status: 'sending' }, data: { status: 'sent', provider_message_id: providerId, sent_at: new Date(),
      encrypted_payload: null, lease_token: null, lease_expires_at: null, next_attempt_at: null, last_error_code: null } })
    return true
  } catch (error) {
    const code = error instanceof AuthMailError ? error.code : 'PAYLOAD_UNAVAILABLE'
    const terminal = row.attempts >= MAX_ATTEMPTS || code === 'REJECTED' || code === 'PAYLOAD_UNAVAILABLE'
    const pause = Math.max(error instanceof AuthMailError ? error.retryAfterSeconds * 1000 : 30000, Math.min(300000, 5000 * 2 ** Math.min(row.attempts, 6)))
    await prisma.authEmailDelivery.updateMany({ where: { id, lease_token: token, status: 'sending' }, data: { status: terminal ? 'dead_letter' : 'uncertain',
      lease_token: null, lease_expires_at: null, next_attempt_at: terminal ? null : new Date(Math.min(row.expires_at.getTime(), Date.now() + pause)), last_error_code: code } })
    return false
  }
}

export async function runAuthEmailDeliveryBatch(limit = 5): Promise<{ sent: number; expired: number }> {
  await assertAuthSecurityReady()
  const bounded = z.number().int().min(1).max(20).parse(limit), now = new Date()
  const expired = await prisma.authEmailDelivery.updateMany({ where: { expires_at: { lte: now }, encrypted_payload: { not: null } }, data: {
    status: 'expired', encrypted_payload: null, lease_token: null, lease_expires_at: null, next_attempt_at: null, last_error_code: 'CAPABILITY_EXPIRED' } })
  await prisma.authEmailDelivery.updateMany({ where: { attempts: { gte: MAX_ATTEMPTS }, OR: [{ status: { in: ['pending', 'uncertain'] } }, { status: 'sending', lease_expires_at: { lte: now } }] },
    data: { status: 'dead_letter', last_error_code: 'RETRY_LIMIT', lease_token: null, lease_expires_at: null, next_attempt_at: null } })
  if (process.env.AUTH_EMAIL_ENABLED !== 'true') return { sent: 0, expired: expired.count }
  if (authEmailConfiguration().delivery !== 'email') return { sent: 0, expired: expired.count }
  const due = await prisma.authEmailDelivery.findMany({ where: { expires_at: { gt: now }, encrypted_payload: { not: null }, attempts: { lt: MAX_ATTEMPTS }, AND: [
    { OR: [{ status: { in: ['pending', 'uncertain'] } }, { status: 'sending', lease_expires_at: { lte: now } }] },
    { OR: [{ next_attempt_at: null }, { next_attempt_at: { isSet: false } }, { next_attempt_at: { lte: now } }] },
  ] }, orderBy: [{ next_attempt_at: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: bounded, select: { id: true } })
  let sent = 0
  for (const row of due) if (await processAuthEmailDelivery(row.id)) sent += 1
  return { sent, expired: expired.count }
}
