import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ values: new Map<string, string>(), api: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn() }))
vi.mock('../apps/mobile/src/lib/session-storage', () => ({ sessionStorage: { getItem: fixture.get, setItem: fixture.set, removeItem: fixture.remove } }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixture.api, ApiError: class ApiError extends Error { constructor(message: string, public code: string, public status: number) { super(message) } } }))
import { ApiError } from '../apps/mobile/src/lib/api'
import { nativeAdminDocumentUrl } from '../apps/mobile/src/lib/admin-api'
import { checkPendingAdminCommand, loadPendingAdminCommand, retryPendingAdminCommand, submitNewAdminCommand } from '../apps/mobile/src/lib/admin-pending-store'
import { loadPendingManualInspection, readManualInspection, submitManualInspection } from '../apps/mobile/src/lib/manual-inspection-api'
import { nativeGalleryPhotoUrl, nativeListingMediaSchema } from '../apps/mobile/src/lib/listing-media'
import { adminCommandSchema } from '../lib/contracts/admin'

const actor = '11111111-1111-4111-8111-111111111111', target = '22222222-2222-4222-8222-222222222222', clientId = '33333333-3333-4333-8333-333333333333', auditId = '44444444-4444-4444-8444-444444444444'
const command = adminCommandSchema.parse({ operation: 'waive_fee', clientId, targetId: target, expectedRevision: 4, reason: 'Reviewed a documented publication fee exception.' })
const receipt = { clientId, auditId, committed: true }
const evidence = 'Both participants inspected the actual asset and supplied these supporting facts.'
const inspection = { bookingId: target, eligible: true, status: 'pending', evidence, requestedAt: '2030-01-01T00:00:00.000Z', reviewedAt: null, reviewReason: null }
beforeEach(() => {
  vi.resetAllMocks(); fixture.values.clear()
  fixture.get.mockImplementation(async (key: string) => fixture.values.get(key) ?? null)
  fixture.set.mockImplementation(async (key: string, value: string) => { fixture.values.set(key, value) })
  fixture.remove.mockImplementation(async (key: string) => { fixture.values.delete(key) })
})
it('persists the exact administrative decision before POST and clears it only after its matching receipt', async () => {
  fixture.api.mockImplementation(async (_path, options) => {
    expect(JSON.parse(fixture.values.get(`rentral.admin.pending.${actor}`)!).command).toEqual(command)
    expect(options).toMatchObject({ method: 'POST', body: command, expectedUserId: actor })
    return receipt
  })
  expect(await submitNewAdminCommand(actor, command)).toEqual({ receipt, cleanupPending: false })
  expect(await loadPendingAdminCommand(actor)).toBeNull()
  expect(fixture.api).toHaveBeenCalledTimes(1)
})
it('restores a lost administrative acknowledgment with GET only and retries the original body only after deliberate404 readback', async () => {
  fixture.api.mockRejectedValueOnce(new TypeError('Acknowledgment lost'))
  await expect(submitNewAdminCommand(actor, command)).rejects.toThrow('Acknowledgment lost')
  expect(await loadPendingAdminCommand(actor)).toEqual(command)
  await expect(submitNewAdminCommand(actor, { ...command, reason: 'Different instructions must not replace an unknown outcome.' })).rejects.toThrow('saved administrative request')
  fixture.api.mockRejectedValueOnce(new ApiError('Missing', 'NOT_FOUND', 404))
  expect(await checkPendingAdminCommand(actor)).toEqual({ found: false, missing: true })
  expect(fixture.api.mock.calls.at(-1)).toEqual([`/admin/commands/${clientId}`, { expectedUserId: actor }])
  fixture.api.mockRejectedValueOnce(new ApiError('Missing', 'NOT_FOUND', 404)).mockResolvedValueOnce(receipt)
  await retryPendingAdminCommand(actor, clientId)
  expect(fixture.api.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(2)
  expect(fixture.api.mock.calls.at(-1)).toEqual(['/admin/commands', { method: 'POST', body: command, expectedUserId: actor }])
})
it('never POSTs a saved admin decision when its original receipt already exists', async () => {
  fixture.api.mockRejectedValueOnce(new TypeError('Lost'))
  await expect(submitNewAdminCommand(actor, command)).rejects.toThrow()
  fixture.api.mockResolvedValueOnce(receipt)
  expect(await checkPendingAdminCommand(actor)).toMatchObject({ found: true, receipt })
  expect(fixture.api.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
  expect(await loadPendingAdminCommand(actor)).toBeNull()
})
it('fails closed on incomplete or foreign actor recovery before sending an admin mutation', async () => {
  fixture.values.set(`rentral.admin.pending.${actor}.present`, '1')
  await expect(submitNewAdminCommand(actor, command)).rejects.toThrow('cannot be confirmed')
  fixture.values.set(`rentral.admin.pending.${actor}`, JSON.stringify({ version: 1, actorId: target, command }))
  await expect(loadPendingAdminCommand(actor)).rejects.toThrow('cannot be confirmed')
  expect(fixture.api).not.toHaveBeenCalled()
})
it('retains an administrative request when an acknowledgment names a different original command', async () => {
  fixture.api.mockResolvedValueOnce({ ...receipt, clientId: auditId })
  await expect(submitNewAdminCommand(actor, command)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(await loadPendingAdminCommand(actor)).toEqual(command)
})
it('keeps private document and gallery photo links on the backend and in their purpose-specific buckets', () => {
  const origin = 'http://192.168.1.7:3000', expiresAt = new Date(Date.now() + 60000).toISOString()
  const path = `/api/v1/files/compliance-docs/${actor}/${target}/proof.pdf?token=fixture-signed-token`
  expect(nativeAdminDocumentUrl({ url: `http://localhost:3000${path}`, expiresAt }, origin)).toBe(`${origin}${path}`)
  expect(nativeAdminDocumentUrl({ url: `https://untrusted.invalid${path}`, expiresAt }, origin)).toBeNull()
  expect(nativeAdminDocumentUrl({ url: `http://localhost:3000${path}`, expiresAt: '2000-01-01T00:00:00.000Z' }, origin)).toBeNull()
  expect(nativeAdminDocumentUrl({ url: `http://localhost:3000${path.replace('compliance-docs', 'profile-avatars')}`, expiresAt }, origin)).toBeNull()
  const photo = `/api/v1/files/listings-media/${actor}/${target}/photo.jpg?token=fixture-signed-token`
  expect(nativeGalleryPhotoUrl(`http://localhost:3000${photo}`, origin)).toBe(`${origin}${photo}`)
  expect(nativeGalleryPhotoUrl(`https://untrusted.invalid${photo}`, origin)).toBeNull()
  expect(nativeGalleryPhotoUrl(`${origin}${photo.replace('.jpg', '.pdf')}`, origin)).toBeNull()
  expect(nativeListingMediaSchema.parse({ videoUrl: null, posterUrl: `${origin}${photo}`, expiresAt, mediaSource: 'approved_gallery', galleryPhotoUrls: [`${origin}${photo}`] }).videoUrl).toBeNull()
})
it('recovers manual inspection by the original actor/nonce receipt instead of another participant’s equal evidence', async () => {
  fixture.api.mockRejectedValueOnce(new TypeError('Lost inspection acknowledgment'))
  await expect(submitManualInspection(actor, target, { clientId, evidence })).rejects.toThrow('Lost inspection acknowledgment')
  expect((await loadPendingManualInspection(actor, target))?.command).toEqual({ clientId, evidence })
  fixture.api.mockRejectedValueOnce(new ApiError('Original receipt missing', 'NOT_FOUND', 404))
  await expect(readManualInspection(target, actor, clientId)).rejects.toMatchObject({ status: 404 })
  expect(fixture.api.mock.calls.at(-1)).toEqual([`/bookings/${target}/manual-inspection?clientId=${clientId}`, { expectedUserId: actor }])
  fixture.api.mockResolvedValueOnce(inspection)
  expect(await submitManualInspection(actor, target, { clientId, evidence }, true)).toEqual(inspection)
  expect(fixture.api.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
  expect(await loadPendingManualInspection(actor, target)).toBeNull()
})
it('serializes competing manual inspection requests and keeps the original unknown command intact', async () => {
  let rejectFirst: (error: Error) => void = () => undefined
  fixture.api.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject }))
  const first = submitManualInspection(actor, target, { clientId, evidence })
  while (!fixture.api.mock.calls.length) await Promise.resolve()
  const competing = submitManualInspection(actor, target, { clientId: auditId, evidence: `${evidence} Changed.` })
  rejectFirst(new TypeError('Unknown'))
  await expect(first).rejects.toThrow('Unknown')
  await expect(competing).rejects.toThrow('original saved inspection request')
  expect((await loadPendingManualInspection(actor, target))?.command.clientId).toBe(clientId)
  expect(fixture.api).toHaveBeenCalledTimes(1)
})
it('retries manual inspection only after exact original receipt404 using the persisted nonce and evidence', async () => {
  fixture.api.mockRejectedValueOnce(new TypeError('Unknown'))
  await expect(submitManualInspection(actor, target, { clientId, evidence })).rejects.toThrow('Unknown')
  fixture.api.mockRejectedValueOnce(new ApiError('Original receipt missing', 'NOT_FOUND', 404)).mockResolvedValueOnce(inspection)
  expect(await submitManualInspection(actor, target, { clientId, evidence }, true)).toEqual(inspection)
  expect(fixture.api.mock.calls.slice(-2)).toEqual([
    [`/bookings/${target}/manual-inspection?clientId=${clientId}`, { expectedUserId: actor }],
    [`/bookings/${target}/manual-inspection`, { method: 'POST', body: { clientId, evidence }, expectedUserId: actor }],
  ])
})

it.each(['set_free_posting_permission','set_direct_publish_permission'] as const)('persists and confirms the independent %s command through the same audited receipt flow', async operation => {
  const input = adminCommandSchema.parse({ operation, clientId, targetId: target, expectedRevision: 4, reason: 'Reviewed the independent publishing permission request.', allowed: true })
  fixture.api.mockImplementationOnce(async (_path, options) => {
    expect(JSON.parse(fixture.values.get('rentral.admin.pending.' + actor)!).command).toEqual(input)
    expect(options).toMatchObject({ method: 'POST', body: input, expectedUserId: actor })
    return receipt
  })
  expect(await submitNewAdminCommand(actor,input)).toEqual({receipt,cleanupPending:false})
  expect(await loadPendingAdminCommand(actor)).toBeNull()
})
