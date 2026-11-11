import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), execute: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/operations/admin-console', () => ({ executeAdminCommand: mocks.execute }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))

import { POST } from '@/app/api/v1/admin/commands/route'
import { ApiError } from '@/lib/api/http'

const actorId = '11111111-1111-4111-8111-111111111111'
const command = { clientId: '22222222-2222-4222-8222-222222222222', targetId: '33333333-3333-4333-8333-333333333333', expectedRevision: 2,
  operation: 'set_gallery_permission', allowed: true, reason: 'Reviewed the gallery uploader supporting evidence.' }
const receipt = { clientId: command.clientId, auditId: '44444444-4444-4444-8444-444444444444', committed: true }
function request(body: unknown = command): Request {
  return new Request('http://localhost:3000/api/v1/admin/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.identity.mockResolvedValue({ userId: actorId, mode: 'cookie' })
  mocks.execute.mockResolvedValue(receipt)
})
afterEach(() => vi.restoreAllMocks())

it('refreshes gallery entry, affected inventory and notification views only after a confirmed grant', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, data: receipt })
  expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), { admission: false, platform: true, mutation: true })
  expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(actorId, expect.objectContaining(command))
  for (const path of ['/admin', '/marketplace/listing/create', '/marketplace/listing', '/marketplace/notifications', '/marketplace']) {
    expect(mocks.revalidate).toHaveBeenCalledWith(path)
  }
  expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidate.mock.invocationCallOrder[0])
})

it('returns the committed receipt if post-commit cache refresh fails, so clients do not create another permission change', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  mocks.revalidate.mockImplementation(() => { throw new Error('Synthetic cache refresh failure') })
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, data: receipt })
  expect(mocks.execute).toHaveBeenCalledTimes(1)
  expect(warning).toHaveBeenCalledExactlyOnceWith('[admin-command] Decision saved; affected pages may need a refresh.')
})

it('does not invalidate pages or report success after a stale permission decision is refused', async () => {
  mocks.execute.mockRejectedValue(new ApiError(409, 'ADMIN_TARGET_CHANGED', 'Refresh this member before deciding.'))
  const response = await POST(request())
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ success: false, code: 'ADMIN_TARGET_CHANGED' })
  expect(mocks.revalidate).not.toHaveBeenCalled()
})

it('refuses invalid instructions before running a command or invalidating pages', async () => {
  const response = await POST(request({ ...command, allowed: 'yes' }))
  expect(response.status).toBe(400)
  expect(mocks.execute).not.toHaveBeenCalled()
  expect(mocks.revalidate).not.toHaveBeenCalled()
})
