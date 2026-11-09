import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ role: vi.fn(), permission: vi.fn(), notification: vi.fn(), update: vi.fn(), audit: vi.fn(), fetch: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertLifecycleReady: async () => undefined }))
vi.mock('@/lib/auth/roles', () => ({ hasStaffPermission: mocks.role, assertStaffPermission: mocks.permission }))
vi.mock('@/lib/db', () => ({ default: { notification: { findUnique: mocks.notification } } }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({ notification: { updateMany: mocks.update }, adminAudit: { create: mocks.audit } }) }))
import { reconcileNotificationEmail } from '@/lib/lifecycle/email-reconciliation'
const providerId = 'c7af3d50-a016-475d-8e51-23fd04989436'
const reason = 'Checking the existing provider receipt after an operator review.'
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('fetch', mocks.fetch); vi.stubEnv('RESEND_API_KEY', 'owned-fixture-email-lookup-key')
  mocks.role.mockResolvedValue(true); mocks.permission.mockResolvedValue(undefined)
  mocks.notification.mockResolvedValue({ id: 'notification', title: 'Lease update', email_status: 'uncertain', provider_message_id: providerId, email_delivered_at: null, user: { email: 'member@fixture.invalid' } })
  mocks.update.mockResolvedValue({ count: 1 }); mocks.audit.mockResolvedValue({})
  mocks.fetch.mockResolvedValue(Response.json({ id: providerId, to: ['member@fixture.invalid'], subject: 'Lease update', last_event: 'delivered' }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('audits an authorized lookup and updates only a bound provider receipt, without sending another message', async () => {
  expect(await reconcileNotificationEmail('staff', 'notification', reason)).toMatchObject({ status: 'delivery_confirmed', observedAt: expect.any(String) })
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(`https://api.resend.com/emails/${providerId}`, expect.objectContaining({ cache: 'no-store' }))
  expect(mocks.fetch.mock.calls[0][1]).not.toHaveProperty('body')
  expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0])
  expect(mocks.permission).toHaveBeenCalledTimes(2)
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'notification', email_status: 'uncertain', provider_message_id: providerId }, data: {
    email_status: 'sent', email_error_code: null, email_delivered_at: expect.any(Date),
  } })
})
it('requires current operations-management permission before reading or calling the provider', async () => {
  mocks.role.mockResolvedValue(false)
  await expect(reconcileNotificationEmail('viewer', 'notification', reason)).rejects.toThrow('Staff access')
  expect(mocks.notification).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled()
})
it('preserves unknown sends with no provider ID instead of replaying an idempotency key', async () => {
  mocks.notification.mockResolvedValue({ provider_message_id: null })
  await expect(reconcileNotificationEmail('staff', 'notification', reason)).rejects.toThrow('will not resend')
  expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled()
})
it.each(['recipient', 'subject', 'id', 'event'])('refuses an unbound or malformed receipt (%s) and preserves existing state', async mismatch => {
  const receipt = { id: providerId, to: ['member@fixture.invalid'], subject: 'Lease update', last_event: 'delivered' }
  if (mismatch === 'recipient') receipt.to = ['victim@fixture.invalid']
  if (mismatch === 'subject') receipt.subject = 'A different private email'
  if (mismatch === 'id') receipt.id = '2ca8c61b-ffac-4200-bcba-a7387d0324ac'
  if (mismatch === 'event') receipt.last_event = 'invented-success'
  mocks.fetch.mockResolvedValue(Response.json(receipt))
  await expect(reconcileNotificationEmail('staff', 'notification', reason)).rejects.toThrow('could not be verified')
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).toHaveBeenCalledTimes(1)
})
it('rechecks role revocation after the read-only provider request before persisting its receipt', async () => {
  mocks.permission.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Staff access required.'))
  await expect(reconcileNotificationEmail('staff', 'notification', reason)).rejects.toThrow('Staff access')
  expect(mocks.fetch).toHaveBeenCalledTimes(1); expect(mocks.update).not.toHaveBeenCalled()
})
it('keeps delayed delivery accepted and records a definitive failure without resending', async () => {
  mocks.fetch.mockResolvedValueOnce(Response.json({ id: providerId, to: ['member@fixture.invalid'], subject: 'Lease update', last_event: 'delivery_delayed' }))
  expect(await reconcileNotificationEmail('staff', 'notification', reason)).toMatchObject({ status: 'provider_accepted' })
  expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty('email_delivered_at')
  mocks.fetch.mockResolvedValueOnce(Response.json({ id: providerId, to: ['member@fixture.invalid'], subject: 'Lease update', last_event: 'bounced' }))
  expect(await reconcileNotificationEmail('staff', 'notification', reason)).toMatchObject({ status: 'provider_failed' })
  expect(mocks.update.mock.calls[1][0].data).toEqual({ email_status: 'failed', email_error_code: 'PROVIDER_BOUNCED' })
})
