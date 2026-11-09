import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ ready: vi.fn(), lock: vi.fn(), send: vi.fn(), receipts: vi.fn(), notifications: vi.fn(), pending: vi.fn(), delivery: vi.fn(), updateDelivery: vi.fn(), deliveryMany: vi.fn(), prune: vi.fn(), user: vi.fn(), session: vi.fn(), device: vi.fn(), disable: vi.fn(), notification: vi.fn(), failure: vi.fn(), heartbeat: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ pushPrepared: mocks.ready }))
vi.mock('@/lib/push/provider', () => ({ createExpoPushClient: () => ({ send: mocks.send, receipts: mocks.receipts }), ExpoPushError: class extends Error { uncertain = true } }))
vi.mock('@/lib/db', () => ({ default: { notification: { findMany: mocks.notifications }, pushDelivery: { findMany: mocks.pending, updateMany: mocks.deliveryMany, deleteMany: mocks.prune } } }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.lock, withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({
  user: { findUnique: mocks.user }, authSession: { findFirst: mocks.session }, pushDevice: { findUnique: mocks.device, updateMany: mocks.disable, update: vi.fn() }, notification: { findFirst: mocks.notification },
  pushDelivery: { findUnique: mocks.delivery, update: mocks.updateDelivery, updateMany: mocks.deliveryMany },
}) }))
import { pushDispatchBatch, pushReceiptBatch } from '@/lib/push/worker'
import { pushTokenHash, sealPushToken } from '@/lib/push/crypto'
const id = '11111111-1111-4111-8111-111111111111', deviceId = '22222222-2222-4222-8222-222222222222', actor = '33333333-3333-4333-8333-333333333333'
const ticketId = '44444444-4444-4444-8444-444444444444', project = '55555555-5555-4555-8555-555555555555'
const token = 'ExpoPushToken[owned_fixture_token_1234]', now = new Date('2030-01-01T10:00:00Z')
let row: { id: string; device_id: string; user_id: string; token_hash: string; notification_id: string; status: string; attempts: number; claimed_at: Date | null; accepted_at: Date | null; next_check_at: Date | null; ticket_id: string | null; error_code: string | null; createdAt: Date }
let device: { id: string; user_id: string; auth_session_id: string | null; token_hash: string; opted_in_at: Date; status: string; token_ciphertext: string | null; token_iv: string | null; token_tag: string | null }
const context = () => ({ cursor: null, heartbeat: mocks.heartbeat })
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now)
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('PUSH_NOTIFICATIONS_ENABLED', 'true'); vi.stubEnv('PUSH_NOTIFICATIONS_SINCE', '2029-12-01T00:00:00Z')
  vi.stubEnv('EXPO_PUBLIC_EAS_PROJECT_ID', project); vi.stubEnv('EXPO_ACCESS_TOKEN', 'owned_fixture_expo_access_token'); vi.stubEnv('PUSH_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'))
  row = { id, device_id: deviceId, user_id: actor, token_hash: pushTokenHash(token), notification_id: ticketId, status: 'pending', attempts: 0, claimed_at: null, accepted_at: null, next_check_at: null, ticket_id: null, error_code: null, createdAt: now }
  device = { id: deviceId, user_id: actor, auth_session_id: ticketId, token_hash: row.token_hash, opted_in_at: new Date(now.getTime() - 3600000), status: 'active', ...sealPushToken(deviceId, token) }
  mocks.session.mockResolvedValue({ id: ticketId })
  mocks.ready.mockResolvedValue(true); mocks.lock.mockResolvedValue(true); mocks.notifications.mockResolvedValue([])
  mocks.prune.mockResolvedValue({ count: 0 })
  mocks.delivery.mockImplementation(async () => ({ ...row })); mocks.device.mockImplementation(async () => ({ ...device })); mocks.user.mockResolvedValue({ closed_at: null })
  mocks.notification.mockResolvedValue({ createdAt: new Date(now.getTime() - 60000) })
  mocks.updateDelivery.mockImplementation(async ({ data }) => { Object.assign(row, data); return row })
  mocks.deliveryMany.mockImplementation(async ({ where, data }) => {
    if (where.id && typeof where.id === 'string' && where.id !== row.id) return { count: 0 }
    if (typeof where.status === 'string' && row.status !== where.status) return { count: 0 }
    if (where.status?.in && !where.status.in.includes(row.status)) return { count: 0 }
    if (where.OR && (!row.claimed_at || row.claimed_at > new Date(Date.now() - 120000))) return { count: 0 }
    Object.assign(row, data); return { count: 1 }
  })
  mocks.pending.mockImplementation(async ({ where }) => where.status === 'pending' ? row.status === 'pending' ? [{ id }] : [] : ['ticketed', 'uncertain'].includes(row.status) && row.ticket_id && row.next_check_at && row.next_check_at <= new Date() ? [{ ...row }] : [])
  mocks.send.mockResolvedValue({ status: 'ticketed', ticketId }); mocks.receipts.mockResolvedValue(new Map([[ticketId, { status: 'confirmed', code: null, unregistered: false }]]))
  mocks.disable.mockImplementation(async ({ where, data }) => { if (where.user_id !== device.user_id || where.token_hash !== device.token_hash || device.opted_in_at > where.opted_in_at.lte) return { count: 0 }; Object.assign(device, data); return { count: 1 } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
it('does no data/provider work while push is disabled or unprepared', async () => {
  vi.stubEnv('PUSH_NOTIFICATIONS_ENABLED', 'false')
  expect((await pushDispatchBatch(context(), mocks.failure)).result.submitted).toBe(0)
  vi.stubEnv('PUSH_NOTIFICATIONS_ENABLED', 'true'); mocks.ready.mockResolvedValue(false)
  expect((await pushReceiptBatch(context(), mocks.failure)).result.confirmed).toBe(0)
  expect(mocks.notifications).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.receipts).not.toHaveBeenCalled()
})
it('prunes only derived delivery metadata while sending is off and never requeues old notification history afterwards', async () => {
  mocks.prune.mockResolvedValue({ count: 1 }); vi.stubEnv('PUSH_NOTIFICATIONS_ENABLED', 'false')
  expect((await pushReceiptBatch(context(), mocks.failure)).result.pruned).toBe(1)
  expect(mocks.prune).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date(now.getTime() - 90 * 86400000) } } })
  expect(mocks.receipts).not.toHaveBeenCalled()
  vi.stubEnv('PUSH_NOTIFICATIONS_ENABLED', 'true')
  const old = new Date(now.getTime() - 91 * 86400000)
  mocks.notifications.mockImplementation(async ({ where }) => old >= where.createdAt.gte ? [{ id: ticketId, createdAt: old }] : [])
  mocks.pending.mockResolvedValue([])
  const result = await pushDispatchBatch(context(), mocks.failure)
  expect(result.result.queued).toBe(0)
  expect(mocks.notifications).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ createdAt: { gte: new Date(now.getTime() - 86400000), lte: now } }) }))
  expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.failure).not.toHaveBeenCalled()
})
it.each(['closed', 'revoked-session', 'missing-session', 'rotated-token', 'transferred', 'read-notification'])('rechecks current binding/owner/activity before sending (%s)', async change => {
  if (change === 'closed') mocks.user.mockResolvedValue({ closed_at: now })
  if (change === 'revoked-session') mocks.session.mockResolvedValue(null)
  if (change === 'missing-session') device.auth_session_id = null
  if (change === 'rotated-token') device.token_hash = 'new-token-hash'
  if (change === 'transferred') device.user_id = 'another-account'
  if (change === 'read-notification') mocks.notification.mockResolvedValue(null)
  await pushDispatchBatch(context(), mocks.failure)
  expect(mocks.send).not.toHaveBeenCalled(); expect(row.status).toBe('skipped')
})
it('persists a ticket before recovery and treats receipt ok as provider confirmation only', async () => {
  expect((await pushDispatchBatch(context(), mocks.failure)).result.submitted).toBe(1)
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith(token)
  expect(row).toMatchObject({ status: 'ticketed', ticket_id: ticketId, attempts: 1, next_check_at: new Date(now.getTime() + 900000) })
  vi.setSystemTime(new Date(now.getTime() + 960000))
  expect((await pushReceiptBatch(context(), mocks.failure)).result.confirmed).toBe(1)
  expect(row.status).toBe('confirmed'); expect(row.next_check_at).toBeNull()
})
it('never blindly resends an unknown acceptance or stale submitting record', async () => {
  mocks.send.mockRejectedValue(new Error('Acknowledgement lost after remote acceptance.'))
  expect((await pushDispatchBatch(context(), mocks.failure)).result.uncertain).toBe(1)
  expect(row.status).toBe('uncertain')
  await pushDispatchBatch(context(), mocks.failure)
  expect(mocks.send).toHaveBeenCalledOnce()
  row.status = 'submitting'; row.claimed_at = new Date(now.getTime() - 180000)
  await pushDispatchBatch(context(), mocks.failure)
  expect(row.status).toBe('uncertain'); expect(mocks.send).toHaveBeenCalledOnce()
})
it('does not disable a freshly rotated binding after an old DeviceNotRegistered receipt', async () => {
  await pushDispatchBatch(context(), mocks.failure)
  device.token_hash = 'new-binding-token'; device.opted_in_at = new Date(now.getTime() + 1000)
  mocks.receipts.mockResolvedValue(new Map([[ticketId, { status: 'failed', code: 'DEVICE_NOT_REGISTERED', unregistered: true }]]))
  vi.setSystemTime(new Date(now.getTime() + 960000))
  await pushReceiptBatch(context(), mocks.failure)
  expect(row.status).toBe('failed'); expect(device.status).toBe('active')
  expect(mocks.disable).toHaveBeenCalledWith({ where: { id: deviceId, user_id: actor, token_hash: row.token_hash, opted_in_at: { lte: now } }, data: { status: 'unregistered', token_ciphertext: null, token_iv: null, token_tag: null } })
})
it('disables the same registered binding on DeviceNotRegistered and never replays a missing expired receipt', async () => {
  await pushDispatchBatch(context(), mocks.failure)
  mocks.receipts.mockResolvedValue(new Map([[ticketId, { status: 'failed', code: 'DEVICE_NOT_REGISTERED', unregistered: true }]]))
  vi.setSystemTime(new Date(now.getTime() + 960000)); await pushReceiptBatch(context(), mocks.failure)
  expect(device.status).toBe('unregistered'); expect(device.token_ciphertext).toBeNull()
  row.status = 'ticketed'; row.next_check_at = new Date(); row.accepted_at = new Date(now.getTime() - 25 * 3600000)
  expect((await pushReceiptBatch(context(), mocks.failure)).result.uncertain).toBe(1)
  expect(row.error_code).toBe('PUSH_RECEIPT_EXPIRED'); expect(row.next_check_at).toBeNull()
  expect(mocks.receipts).toHaveBeenCalledOnce(); expect(mocks.send).toHaveBeenCalledOnce()
})
