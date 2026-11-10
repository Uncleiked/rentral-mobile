import { createHash } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ identity: vi.fn(), begin: vi.fn(), read: vi.fn(), finish: vi.fn(), seal: vi.fn(), address: vi.fn(), receipt: vi.fn(), listing: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/listings/capture', () => ({ beginCaptureForOwner: mocks.begin, getCaptureForOwner: mocks.read, finishCaptureForOwner: mocks.finish, sealCaptureForOwner: mocks.seal, checkCaptureAddressForOwner: mocks.address }))
vi.mock('@/lib/db', () => ({ default: { mutationReceipt: { findFirst: mocks.receipt }, listing: { findFirst: mocks.listing } } }))
import { POST as begin } from '@/app/api/v1/captures/route'
import { GET as read } from '@/app/api/v1/captures/[id]/route'
import { POST as finish } from '@/app/api/v1/captures/[id]/finish/route'
import { POST as seal } from '@/app/api/v1/captures/[id]/seal/route'
import { POST as address } from '@/app/api/v1/captures/[id]/check-address/route'
import { GET as requestReceipt } from '@/app/api/v1/my-listings/requests/[clientId]/route'
import { ApiError } from '@/lib/api/http'

const id = '11111111-1111-4111-8111-111111111111', owner = '22222222-2222-4222-8222-222222222222'
const dto = { id, status: 'recording', startedAt: '2026-11-10T09:00:00.000Z', finishBy: '2026-11-10T09:03:00.000Z', finishedAt: null, sealBy: null, videoPath: null, listingId: null }
const context = { params: Promise.resolve({ id }) }
const body = (value: unknown) => new Request('https://rentral.example/api/v1/captures', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
beforeEach(() => {
  vi.resetAllMocks(); mocks.identity.mockResolvedValue({ userId: owner, sessionId: 'current-session', mode: 'bearer' })
  mocks.begin.mockResolvedValue(dto); mocks.read.mockResolvedValue(dto); mocks.finish.mockResolvedValue({ ...dto, status: 'recorded' }); mocks.seal.mockResolvedValue({ ...dto, status: 'sealed' })
  mocks.address.mockResolvedValue({ captureId: id, status: 'matched', addressHash: 'a'.repeat(64), toleranceMeters: 100 })
})
it('starts a recording only under the authenticated account and session and returns private no-store JSON', async () => {
  const input = { id, reading: { latitude: 6.45, longitude: 3.4, accuracy: 8, capturedAt: '2026-11-10T09:00:00.000Z' } }
  const response = await begin(body(input))
  expect(response.status).toBe(201); expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(owner, 'current-session', input)
  expect(JSON.stringify(await response.json())).not.toMatch(/latitude|longitude|geometry|session_id/)
})
it('denies unauthenticated capture starts before domain work', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
  expect((await begin(body({}))).status).toBe(401); expect(mocks.begin).not.toHaveBeenCalled()
})
it('keeps a captured actor mismatch as409 and does not start a session for the new account', async () => {
  mocks.identity.mockRejectedValue(new ApiError(409, 'ACCOUNT_CHANGED', 'Refresh.'))
  expect((await begin(body({}))).status).toBe(409); expect(mocks.begin).not.toHaveBeenCalled()
})
it('scopes readback to current owner and rejects malformed recording identifiers', async () => {
  expect((await read(new Request('https://rentral.example/api/v1/captures/'+id), context)).status).toBe(200)
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith(owner, id)
  mocks.read.mockClear()
  expect((await read(new Request('https://rentral.example'), { params: Promise.resolve({ id: 'invalid' }) })).status).toBe(400)
  expect(mocks.read).not.toHaveBeenCalled()
})
it.each([[finish, 'finish'], [seal, 'seal']] as const)('maps recording transition evidence failures to their definite HTTP response %s', async (route, name) => {
  mocks[name].mockRejectedValue(new ApiError(409, 'CAPTURE_CONFLICT', 'Read the original recording.'))
  const response = await route(body({}), context)
  expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ success: false, code: 'CAPTURE_CONFLICT' })
  expect(mocks[name]).toHaveBeenCalledExactlyOnceWith(owner, 'current-session', id, {})
})
it('runs the address preflight against an owned capture and does not accept client actor fields as authority', async () => {
  const input = { address: 'Building, Lekki, Lagos' }
  const response = await address(body(input), context)
  expect(response.status).toBe(200); expect(mocks.address).toHaveBeenCalledExactlyOnceWith(owner, id, input)
  expect(await response.json()).toMatchObject({ data: { status: 'matched', toleranceMeters: 100 } })
})
it('reads a legacy committed listing receipt without replaying its saved mutation body', async () => {
  mocks.receipt.mockResolvedValue({ resource_id: id }); mocks.listing.mockResolvedValue({ id, listing_status: 'pending_verification' })
  const response = await requestReceipt(new Request(`https://rentral.example/api/v1/my-listings/requests/${id}?mode=submit`), { params: Promise.resolve({ clientId: id }) })
  expect(response.status).toBe(200)
  expect(mocks.receipt).toHaveBeenCalledWith({ where: { id: createHash('sha256').update(`${owner}\0listing_submit\0${id}`).digest('hex'), actor_id: owner, scope: 'listing_submit', client_id: id }, select: { resource_id: true } })
  expect(mocks.listing).toHaveBeenCalledWith({ where: { id, lister_id: owner }, select: { id: true, listing_status: true } })
  expect(await response.json()).toMatchObject({ data: { id, status: 'pending_verification' } })
})
it('returns404 for absent receipts and never guesses successful submission', async () => {
  mocks.receipt.mockResolvedValue(null)
  const response = await requestReceipt(new Request(`https://rentral.example/api/v1/my-listings/requests/${id}?mode=draft`), { params: Promise.resolve({ clientId: id }) })
  expect(response.status).toBe(404); expect(await response.json()).toMatchObject({ code: 'REQUEST_NOT_FOUND' }); expect(mocks.listing).not.toHaveBeenCalled()
})
