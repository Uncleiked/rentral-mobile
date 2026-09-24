import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findLog: vi.fn(), upsertLog: vi.fn(), finishLog: vi.fn(),
  findUser: vi.fn(), updateUsers: vi.fn(), updatedUser: vi.fn(), syncMetadata: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ default: {
  webhookLog: { findUnique: mocks.findLog, upsert: mocks.upsertLog, update: mocks.finishLog },
  user: { findUnique: mocks.findUser, updateMany: mocks.updateUsers, findUniqueOrThrow: mocks.updatedUser },
} }))
vi.mock('@/lib/admin', () => ({ createAdminClient: () => ({ auth: { admin: { updateUserById: mocks.syncMetadata } } }) }))
vi.mock('@/lib/posthog', () => ({ captureServerEvent: vi.fn() }))

import { POST } from '@/app/api/webhooks/didit/route'

function delivery(status: string = 'Approved', timestamp: number = Date.now() / 1000): Request {
  // Fixed-order fixture, representing the provider's compact canonical JSON.
  const body = JSON.stringify({ event_id: 'event-1', session_id: 'session-1', status, vendor_data: 'user-1', webhook_type: 'status.updated', workflow_id: 'workflow-1' })
  const signature = createHmac('sha256', 'test-only-secret').update(body).digest('hex')
  return new Request('https://rentral.example/api/webhooks/didit', {
    method: 'POST', body,
    headers: { 'x-signature-v2': signature, 'x-timestamp': String(timestamp) },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('DIDIT_WEBHOOK_SECRET', 'test-only-secret')
  mocks.findLog.mockResolvedValue(null)
  mocks.findUser.mockResolvedValue({ didit_session_id: 'session-1' })
  mocks.updateUsers.mockResolvedValue({ count: 1 })
  mocks.updatedUser.mockResolvedValue({ kyc_verified: true, verification_status: 'verified', username: 'renter' })
  mocks.syncMetadata.mockResolvedValue({ error: null })
})
afterEach(() => vi.unstubAllEnvs())

it('rejects unsigned requests before touching persistence', async () => {
  const request = delivery()
  request.headers.delete('x-signature-v2')
  expect((await POST(request)).status).toBe(401)
  expect(mocks.upsertLog).not.toHaveBeenCalled()
})
it('rejects expired deliveries', async () => {
  expect((await POST(delivery('Approved', Date.now() / 1000 - 600))).status).toBe(401)
  expect(mocks.upsertLog).not.toHaveBeenCalled()
})
it('deduplicates already processed deliveries', async () => {
  mocks.findLog.mockResolvedValue({ processed_at: new Date() })
  expect((await POST(delivery())).status).toBe(200)
  expect(mocks.updateUsers).not.toHaveBeenCalled()
})
it('requires current session and workflow when recording approval', async () => {
  expect((await POST(delivery())).status).toBe(200)
  expect(mocks.updateUsers).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'user-1', didit_session_id: 'session-1', didit_workflow_id: 'workflow-1' },
    data: expect.objectContaining({ kyc_verified: true }),
  }))
})
it('does not promote a user from a superseded verification attempt', async () => {
  mocks.updateUsers.mockResolvedValue({ count: 0 })
  expect((await POST(delivery())).status).toBe(200)
  expect(mocks.syncMetadata).not.toHaveBeenCalled()
})
it('retries an event that arrives before its session is stored', async () => {
  mocks.findUser.mockResolvedValue({ didit_session_id: null })
  expect((await POST(delivery())).status).toBe(503)
  expect(mocks.finishLog).not.toHaveBeenCalled()
})
it('revokes authorization after a declined verdict', async () => {
  mocks.updatedUser.mockResolvedValue({ kyc_verified: false, verification_status: 'declined' })
  expect((await POST(delivery('Declined'))).status).toBe(200)
  expect(mocks.syncMetadata).toHaveBeenCalledWith('user-1', expect.objectContaining({
    app_metadata: expect.objectContaining({ kyc_verified: false, verification_status: 'declined' }),
  }))
})
it('leaves failed metadata sync available for provider retry', async () => {
  mocks.syncMetadata.mockResolvedValue({ error: { message: 'Test service unavailable' } })
  expect((await POST(delivery())).status).toBe(500)
  expect(mocks.finishLog).not.toHaveBeenCalled()
})
