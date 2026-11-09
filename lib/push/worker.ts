import type { Prisma, PushDelivery } from '@prisma/client'
import prisma from '@/lib/db'
import { pushPrepared } from '@/lib/database/readiness'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { accountIsActive, activeAccountWhere } from '@/lib/accounts/availability'
import { dateWorkerCursor, type WorkerContext } from '@/lib/lifecycle/worker'
import { pushConfiguration } from './config'
import { openPushToken, pushTokenHash } from './crypto'
import { createExpoPushClient, ExpoPushError } from './provider'
import { pushSourceCutoff } from './policy'

type Failure = (targetType: string, id: string, code: string) => Promise<void>
const noopFailure: Failure = async () => undefined
const unread = { OR: [{ read_at: null }, { read_at: { isSet: false } }] }
const MINUTE = 60000
type Claim = { id: string; deviceId: string; userId: string; tokenHash: string; token: string; claimedAt: Date; attempt: number }

async function queueNotification(id: string, cutoff: Date): Promise<number> {
  return withTransaction(async tx => {
    const initial = await tx.notification.findUnique({ where: { id }, select: { user_id: true } })
    if (!initial || !await lockRecord(tx, 'user', initial.user_id)) return 0
    const notification = await tx.notification.findFirst({ where: { id, createdAt: { gte: cutoff }, ...unread, user: { is: activeAccountWhere } }, select: { id: true, user_id: true, createdAt: true } })
    if (!notification) return 0
    const devices = await tx.pushDevice.findMany({ where: { user_id: notification.user_id, status: 'active', opted_in_at: { lte: notification.createdAt } }, orderBy: { id: 'asc' }, take: 8 })
    const existing = devices.length ? await tx.pushDelivery.findMany({ where: { notification_id: id, device_id: { in: devices.map(device => device.id) } }, select: { device_id: true } }) : []
    const fresh = devices.filter(device => !existing.some(delivery => delivery.device_id === device.id))
    if (!fresh.length) return 0
    await tx.pushDelivery.createMany({ data: fresh.map(device => ({ notification_id: id, device_id: device.id, user_id: notification.user_id, token_hash: device.token_hash,
      ticket_id: null, error_code: null, claimed_at: null, accepted_at: null, receipt_checked_at: null, next_check_at: null })) })
    return fresh.length
  })
}
async function claimDelivery(id: string, cutoff: Date): Promise<Claim | null> {
  return withTransaction(async tx => {
    const initial = await tx.pushDelivery.findUnique({ where: { id } })
    if (!initial || initial.status !== 'pending' || !await lockRecord(tx, 'user', initial.user_id)) return null
    await lockRecord(tx, 'pushDevice', initial.device_id); await lockRecord(tx, 'pushDelivery', id)
    const delivery = await tx.pushDelivery.findUnique({ where: { id } }), device = await tx.pushDevice.findUnique({ where: { id: initial.device_id } })
    const account = await tx.user.findUnique({ where: { id: initial.user_id }, select: { closed_at: true } })
    const session = device?.auth_session_id ? await tx.authSession.findFirst({ where: { id: device.auth_session_id, user_id: initial.user_id, expires_at: { gt: new Date() }, OR: [{ revoked_at: null }, { revoked_at: { isSet: false } }] }, select: { id: true } }) : null
    const notification = await tx.notification.findFirst({ where: { id: initial.notification_id, user_id: initial.user_id, createdAt: { gte: cutoff }, ...unread }, select: { createdAt: true } })
    if (!delivery || delivery.status !== 'pending') return null
    if (!accountIsActive(account) || !session || !notification || !device || device.status !== 'active' || device.user_id !== delivery.user_id || !delivery.token_hash
      || device.token_hash !== delivery.token_hash || device.opted_in_at > notification.createdAt) {
      await tx.pushDelivery.update({ where: { id }, data: { status: 'skipped', error_code: 'BINDING_OR_NOTIFICATION_CHANGED', next_check_at: null } }); return null
    }
    let token: string
    try { token = openPushToken(device.id, device); if (pushTokenHash(token) !== device.token_hash) throw new Error('PUSH_TOKEN_UNAVAILABLE') }
    catch {
      await tx.pushDelivery.update({ where: { id }, data: { status: 'failed', error_code: 'PUSH_TOKEN_UNAVAILABLE' } })
      await tx.pushDevice.update({ where: { id: device.id }, data: { status: 'unregistered', token_ciphertext: null, token_iv: null, token_tag: null } })
      return null
    }
    const claimedAt = new Date(), attempt = delivery.attempts + 1
    await tx.pushDelivery.update({ where: { id }, data: { status: 'submitting', attempts: attempt, claimed_at: claimedAt, error_code: null } })
    return { id, deviceId: device.id, userId: delivery.user_id, tokenHash: device.token_hash, token, claimedAt, attempt }
  })
}
async function disableCurrentDevice(tx: Prisma.TransactionClient, value: { device_id: string; user_id: string; token_hash: string | null; claimed_at: Date | null }) {
  if (!value.token_hash || !value.claimed_at) return
  await tx.pushDevice.updateMany({ where: { id: value.device_id, user_id: value.user_id, token_hash: value.token_hash, opted_in_at: { lte: value.claimed_at } },
    data: { status: 'unregistered', token_ciphertext: null, token_iv: null, token_tag: null } })
}
export async function pushDispatchBatch(context: WorkerContext, failure: Failure = noopFailure, limit = 3) {
  const config = pushConfiguration()
  if (!config || !await pushPrepared()) return { result: { queued: 0, submitted: 0, uncertain: 0 }, cursor: {} }
  const position = dateWorkerCursor.parse(context.cursor ?? {}), now = new Date(), cutoff = pushSourceCutoff(config.cutoff, now)
  const rows = await prisma.notification.findMany({ where: { createdAt: { gte: cutoff, lte: now }, user: { is: activeAccountWhere }, AND: [unread,
    ...(position.id && position.date ? [{ OR: [{ createdAt: { gt: new Date(position.date) } }, { createdAt: new Date(position.date), id: { gt: position.id } }] }] : [])] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 10, select: { id: true, createdAt: true } })
  let queued = 0, submitted = 0, uncertain = 0
  for (const notification of rows) { await context.heartbeat(); try { queued += await queueNotification(notification.id, cutoff) } catch { await failure('notification', notification.id, 'PUSH_QUEUE_FAILED') } }
  const abandoned = await prisma.pushDelivery.updateMany({ where: { status: 'submitting', OR: [{ claimed_at: { lte: new Date(now.getTime() - 2 * MINUTE) } }, { claimed_at: null }, { claimed_at: { isSet: false } }] },
    data: { status: 'uncertain', error_code: 'WORKER_INTERRUPTED', next_check_at: null } })
  uncertain += abandoned.count
  if (abandoned.count) await failure('push_batch', 'push-dispatch', 'WORKER_INTERRUPTED')
  const pending = await prisma.pushDelivery.findMany({ where: { status: 'pending' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: Math.min(5, Math.max(1, limit)), select: { id: true } })
  const client = createExpoPushClient(config.accessToken)
  for (const row of pending) {
    await context.heartbeat()
    const claim = await claimDelivery(row.id, cutoff)
    if (!claim) continue
    let outcome: Awaited<ReturnType<typeof client.send>> | { status: 'uncertain'; code: string }
    try { outcome = await client.send(claim.token) }
    catch (error) { outcome = error instanceof ExpoPushError && !error.uncertain ? { status: 'failed', code: error.code, unregistered: false } : { status: 'uncertain', code: error instanceof ExpoPushError ? error.code : 'PUSH_SUBMISSION_UNCONFIRMED' } }
    await withTransaction(async tx => {
      await lockRecord(tx, 'user', claim.userId); await lockRecord(tx, 'pushDevice', claim.deviceId); await lockRecord(tx, 'pushDelivery', claim.id)
      const where = { id: claim.id, claimed_at: claim.claimedAt, attempts: claim.attempt, status: { in: ['submitting', 'uncertain'] } }
      if (outcome.status === 'ticketed') await tx.pushDelivery.updateMany({ where, data: { status: 'ticketed', ticket_id: outcome.ticketId, accepted_at: new Date(), next_check_at: new Date(Date.now() + 15 * MINUTE), error_code: null } })
      else {
        await tx.pushDelivery.updateMany({ where, data: { status: outcome.status, error_code: outcome.code, next_check_at: null } })
        if (outcome.status === 'failed' && outcome.unregistered) await disableCurrentDevice(tx, { device_id: claim.deviceId, user_id: claim.userId, token_hash: claim.tokenHash, claimed_at: claim.claimedAt })
      }
    })
    if (outcome.status === 'ticketed') submitted += 1
    else { if (outcome.status === 'uncertain') uncertain += 1; await failure('push_delivery', claim.id, outcome.code) }
    await context.heartbeat()
  }
  const last = rows.at(-1)
  return { result: { queued, submitted, uncertain }, cursor: rows.length === 10 && last ? { id: last.id, date: last.createdAt.toISOString() } : {} }
}
export async function pushReceiptBatch(context: WorkerContext, failure: Failure = noopFailure) {
  if (!await pushPrepared()) return { result: { confirmed: 0, failed: 0, uncertain: 0, pruned: 0 }, cursor: {} }
  // The24h source window prevents deleted90-day dedup rows from being recreated.
  // Notification history and device anti-rebinding hashes remain untouched.
  const pruned = (await prisma.pushDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } } })).count
  const config = pushConfiguration()
  if (!config) return { result: { confirmed: 0, failed: 0, uncertain: 0, pruned }, cursor: {} }
  const now = new Date(), rows = await prisma.pushDelivery.findMany({ where: { status: { in: ['ticketed', 'uncertain'] }, ticket_id: { not: null }, next_check_at: { lte: now } }, orderBy: [{ next_check_at: 'asc' }, { id: 'asc' }], take: 20 })
  let confirmed = 0, failed = 0, uncertain = 0
  const current: PushDelivery[] = []
  for (const row of rows) {
    if ((row.accepted_at ?? row.createdAt).getTime() <= now.getTime() - 24 * 60 * MINUTE) {
      await prisma.pushDelivery.updateMany({ where: { id: row.id, ticket_id: row.ticket_id, status: { in: ['ticketed', 'uncertain'] } }, data: { status: 'uncertain', error_code: 'PUSH_RECEIPT_EXPIRED', next_check_at: null, receipt_checked_at: now } })
      await failure('push_delivery', row.id, 'PUSH_RECEIPT_EXPIRED'); uncertain += 1
    } else current.push(row)
  }
  if (!current.length) return { result: { confirmed, failed, uncertain, pruned }, cursor: {} }
  await context.heartbeat()
  let receipts: Awaited<ReturnType<ReturnType<typeof createExpoPushClient>['receipts']>>
  try { receipts = await createExpoPushClient(config.accessToken).receipts(current.flatMap(row => row.ticket_id ? [row.ticket_id] : [])) }
  catch {
    await prisma.pushDelivery.updateMany({ where: { id: { in: current.map(row => row.id) }, status: { in: ['ticketed', 'uncertain'] } }, data: { next_check_at: new Date(Date.now() + 5 * MINUTE), error_code: 'PUSH_RECEIPT_LOOKUP_UNCONFIRMED' } })
    await failure('push_batch', 'push-receipts', 'PUSH_RECEIPT_LOOKUP_UNCONFIRMED')
    return { result: { confirmed, failed, uncertain, pruned }, cursor: {} }
  }
  for (const row of current) {
    await context.heartbeat()
    const receipt = row.ticket_id ? receipts.get(row.ticket_id) : undefined
    if (!receipt) { await prisma.pushDelivery.updateMany({ where: { id: row.id, ticket_id: row.ticket_id, status: { in: ['ticketed', 'uncertain'] } }, data: { next_check_at: new Date(Date.now() + 5 * MINUTE), receipt_checked_at: new Date() } }); continue }
    await withTransaction(async tx => {
      await lockRecord(tx, 'user', row.user_id); await lockRecord(tx, 'pushDevice', row.device_id); await lockRecord(tx, 'pushDelivery', row.id)
      await tx.pushDelivery.updateMany({ where: { id: row.id, ticket_id: row.ticket_id, status: { in: ['ticketed', 'uncertain'] } }, data: { status: receipt.status, error_code: receipt.code, receipt_checked_at: new Date(), next_check_at: null } })
      if (receipt.unregistered) await disableCurrentDevice(tx, row)
    })
    if (receipt.status === 'confirmed') confirmed += 1
    else { failed += 1; await failure('push_delivery', row.id, receipt.code ?? 'PUSH_PROVIDER_REJECTED') }
  }
  return { result: { confirmed, failed, uncertain, pruned }, cursor: {} }
}
