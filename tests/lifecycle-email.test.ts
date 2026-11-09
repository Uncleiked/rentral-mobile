import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ lease: vi.fn(), heartbeat: vi.fn(), failures: vi.fn(), update: vi.fn(), user: vi.fn(), lock: vi.fn(), notifications: vi.fn(), fetch: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { notification: { findMany: mocks.notifications, updateMany: mocks.update } } }))
vi.mock('@/lib/lifecycle/worker', () => ({ runLeasedJob: mocks.lease, recordWorkerFailure: mocks.failures }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.lock, withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({ user: { findUnique: mocks.user }, notification: { updateMany: mocks.update } }) }))
import { sendLifecycleEmails } from '@/lib/lifecycle/email'
const id = 'c7af3d50-a016-475d-8e51-23fd04989436', providerId = '2ca8c61b-ffac-4200-bcba-a7387d0324ac'
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('fetch', mocks.fetch)
  vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'true'); vi.stubEnv('NOTIFICATION_EMAIL_SINCE', '2030-01-01T00:00:00Z')
  vi.stubEnv('RESEND_API_KEY', 'owned-fixture-resend-key'); vi.stubEnv('RENTRAL_EMAIL_FROM', 'Rentral <noreply@fixture.invalid>')
  mocks.lease.mockImplementation(async (_job: string, work: (input: unknown) => Promise<{ result: number }>) => (await work({ heartbeat: mocks.heartbeat })).result)
  mocks.lock.mockResolvedValue(true); mocks.user.mockResolvedValue({ email: 'member@fixture.invalid', closed_at: null })
  mocks.update.mockResolvedValue({ count: 1 }); mocks.notifications.mockResolvedValue([{ id, user_id: 'member', title: 'Lease update', body: 'Review your dates.' }])
  mocks.fetch.mockResolvedValue(Response.json({ id: providerId }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('skips newly claimed notifications after account closure without contacting the email provider', async () => {
  mocks.user.mockResolvedValue({ email: 'member@fixture.invalid', closed_at: new Date() })
  expect(await sendLifecycleEmails()).toBe(0)
  expect(mocks.fetch).not.toHaveBeenCalled()
  expect(mocks.update).toHaveBeenCalledWith({ where: { id, email_status: 'pending' }, data: { email_status: 'skipped', email_error_code: 'ACCOUNT_CLOSED' } })
  expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), 'user', 'member')
})

it('requires explicit notification activation, a valid cutoff and sender configuration before any sends', async () => {
  vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'false')
  expect(await sendLifecycleEmails()).toBe(0); expect(mocks.lease).not.toHaveBeenCalled()
  vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'true'); vi.stubEnv('NOTIFICATION_EMAIL_SINCE', 'invalid')
  await expect(sendLifecycleEmails()).rejects.toThrow('EMAIL_CUTOFF_REQUIRED')
  expect(mocks.fetch).not.toHaveBeenCalled()
})

it('skips historical backlogs and claims only activated pending notifications using stable idempotency', async () => {
  expect(await sendLifecycleEmails()).toBe(1)
  expect(mocks.update.mock.calls[0][0]).toEqual({ where: { email_status: 'pending', createdAt: { lt: new Date('2030-01-01T00:00:00Z') } }, data: { email_status: 'skipped', email_error_code: 'BEFORE_EMAIL_ACTIVATION' } })
  expect(mocks.notifications).toHaveBeenCalledWith(expect.objectContaining({ where: { email_status: 'pending', createdAt: { gte: new Date('2030-01-01T00:00:00Z') } } }))
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('https://api.resend.com/emails', expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': `rentral-notification-${id}` }) }))
  const accepted = mocks.update.mock.calls.at(-1)?.[0].data
  expect(accepted).toMatchObject({ email_status: 'sent', provider_message_id: providerId })
  expect(accepted).not.toHaveProperty('email_delivered_at')
})

it.each(['network', 'malformed', 'http500'])('does not retry an unknown delivery (%s), retaining an operator failure', async failure => {
  if (failure === 'network') mocks.fetch.mockRejectedValue(new Error('Network lost after acceptance'))
  if (failure === 'malformed') mocks.fetch.mockResolvedValue(Response.json({ success: true }))
  if (failure === 'http500') mocks.fetch.mockResolvedValue(Response.json({}, { status: 500 }))
  expect(await sendLifecycleEmails()).toBe(0)
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
  expect(mocks.update).toHaveBeenLastCalledWith({ where: expect.objectContaining({ id, email_status: 'sending', email_claim_token: expect.any(String) }),
    data: { email_status: 'uncertain', email_claim_token: null, email_error_code: 'DELIVERY_UNCONFIRMED' } })
  expect(mocks.failures).toHaveBeenCalledWith('notification-email', 'notification', id, 'DELIVERY_UNCONFIRMED')
})

it('treats a definitive provider rejection separately and recovers crashed sending claims as uncertain', async () => {
  mocks.fetch.mockResolvedValue(Response.json({}, { status: 422 }))
  expect(await sendLifecycleEmails()).toBe(0)
  expect(mocks.update).toHaveBeenCalledWith({ where: expect.objectContaining({ email_status: 'sending', OR: expect.arrayContaining([{ email_claimed_at: { isSet: false } }]) }),
    data: { email_status: 'uncertain', email_claim_token: null, email_error_code: 'WORKER_INTERRUPTED' } })
  expect(mocks.update).toHaveBeenCalledWith({ where: expect.objectContaining({ id, email_status: 'sending' }), data: { email_status: 'failed', email_claim_token: null, email_error_code: 'PROVIDER_REJECTED' } })
})
