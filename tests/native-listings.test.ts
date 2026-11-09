import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), account: vi.fn(), findMany: vi.fn(), transaction: vi.fn(), location: vi.fn(), create: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/accounts/bootstrap', () => ({ ensureAccountHandle: mocks.account }))
vi.mock('@/lib/action-helpers', () => ({ revalidateProfilePaths: vi.fn(), requireUserId: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { listing: { findMany: mocks.findMany }, $transaction: mocks.transaction } }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: mocks.transaction, lockRecord: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/posthog', () => ({ captureServerEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))

import { GET, POST } from '@/app/api/v1/my-listings/route'
import { ApiError } from '@/lib/api/http'

const listingId = '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d'
const listing = {
  category: 'house', address: 'Synthetic address in Yaba', basePrice: '500000',
  metadata: { listingTitle: 'A new home', bedrooms: '2', bathrooms: '2', sizeSqm: '80', amenities: '' },
  lat: 6.5, lng: 3.4, accuracy: 10,
  videoPath: 'actor-1/folder/123_video.mp4', documentPath: 'actor-1/folder/123_title.pdf',
}

function post(body: unknown) {
  return new Request('https://rentral.example/api/v1/my-listings', {
    method: 'POST', headers: { authorization: 'Bearer real-session-token', 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MUX_ENABLED', 'false')
  mocks.identity.mockResolvedValue({ userId: 'actor-1', mode: 'bearer' })
  mocks.account.mockResolvedValue({ id: 'actor-1', username: 'member_handle', kyc_verified: false })
  mocks.create.mockResolvedValue({ id: listingId, lister: { username: 'member_handle' } })
  mocks.update.mockResolvedValue({ id: listingId, lister: { username: 'member_handle' } })
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({
    listingLocation: { upsert: mocks.location }, listing: { create: mocks.create, update: mocks.update },
  }))
})
afterEach(() => vi.unstubAllEnvs())

describe('native owner listing transport', () => {
  it('scopes all draft and submitted reads to the authenticated owner and omits private fields', async () => {
    mocks.findMany.mockResolvedValue([{ id: listingId, category: 'house', listing_status: 'draft', base_rent_amount: '500000',
      asset_metadata: { listingTitle: 'Draft home', hardware_coordinates: 'private location' }, video_path: listing.videoPath,
      document_path: listing.documentPath, createdAt: new Date('2026-11-09T12:00:00.000Z'), email: 'private@example.test' }])
    const response = await GET(new Request('https://rentral.example/api/v1/my-listings?userId=another-owner'))
    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { lister_id: 'actor-1' }, take: 100 }))
    const body = await response.json()
    expect(body.data.items).toEqual([{ id: listingId, category: 'house', title: 'Draft home', status: 'draft',
      price: '500,000', pricePeriod: 'year', createdAt: '2026-11-09T12:00:00.000Z', hasVideo: true, hasDocument: true }])
    expect(JSON.stringify(body)).not.toMatch(/private location|private@example|actor-1\/folder|hardware_coordinates/)
  })

  it('uses the authenticated actor and shared transaction to submit without KYC', async () => {
    const response = await POST(post({ mode: 'submit', listing }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ success: true, data: { id: listingId, status: 'pending_verification' } })
    expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), { mutation: true, verified: true })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lister_id: 'actor-1', listing_status: 'draft' }) }))
    expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: listingId }, data: { listing_status: 'pending_verification' } })
    expect(mocks.location).toHaveBeenCalledTimes(1)
  })

  it.each([
    { mode: 'submit', listing, userId: 'victim' },
    { mode: 'submit', listing: { ...listing, lister_id: 'victim' } },
    { mode: 'publish', listing },
  ])('rejects actor injection and unknown operation fields before writes', async body => {
    expect((await POST(post(body))).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects another owner\'s media and new footage without capture coordinates', async () => {
    expect((await POST(post({ mode: 'submit', listing: { ...listing, videoPath: 'other-owner/folder/video.mp4' } }))).status).toBe(400)
    const withoutCoordinates = { ...listing, lat: undefined, lng: undefined }
    expect((await POST(post({ mode: 'submit', listing: withoutCoordinates }))).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('saves incomplete drafts with server ownership and no public publication', async () => {
    const response = await POST(post({ mode: 'draft', listing: { category: 'boat', wizardStep: 'capture', metadata: {} } }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ data: { id: listingId, status: 'draft' } })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lister_id: 'actor-1', listing_status: 'draft' }) }))
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('returns a JSON authentication failure without writes or HTML redirects', async () => {
    mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue.'))
    const response = await POST(post({ mode: 'submit', listing }))
    expect(response.status).toBe(401)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.account).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('returns503 for an uncertain commit so native clients cannot mistake it for validation failure', async () => {
    mocks.transaction.mockRejectedValue(new Error('commit result unknown'))
    const response = await POST(post({ mode: 'submit', listing }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ success: false, code: 'SAVE_UNCERTAIN' })
  })
})
