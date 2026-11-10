import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ userId: vi.fn(), draft: vi.fn(), capture: vi.fn() }))
vi.mock('@/lib/action-helpers', () => ({ requireUserId: mocks.userId }))
vi.mock('@/lib/db', () => ({ default: { listing: { findFirst: mocks.draft }, listingCapture: { findFirst: mocks.capture } } }))
vi.mock('@/lib/profile-data', () => ({ capitalizeCategory: vi.fn(), deriveListingTitle: vi.fn(), formatListingPrice: vi.fn(), listingPriceDenomination: vi.fn() }))
import { getDraftForOwner } from '@/lib/listing-data'

const id = '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d'
const row = { id, category: 'house', text_address: 'Owner-private address', base_rent_amount: 500000, asset_metadata: { bedrooms: '2' }, wizard_step: 'details', video_path: 'owner/folder/video.mov', poster_path: null, document_path: 'owner/folder/document.pdf', privateLocation: { id, geometry: { type: 'Point', coordinates: [3.4, 6.45] } } }
beforeEach(() => { vi.resetAllMocks(); mocks.userId.mockResolvedValue('owner'); mocks.draft.mockResolvedValue(row) })

it('resumes only an owner draft and projects location existence, never coordinates', async () => {
  const result = await getDraftForOwner(id)
  expect(result).toMatchObject({ id, hasCoords: false, captureId: null, basePrice: '500000' })
  expect(mocks.draft).toHaveBeenCalledWith(expect.objectContaining({ where: { id, lister_id: 'owner', listing_status: 'draft' }, select: expect.objectContaining({ privateLocation: { select: { id: true, capture_id: true } } }) }))
  expect(JSON.stringify(result)).not.toMatch(/geometry|coordinates|6\.45|3\.4|privateLocation/)
})

it('reports a lock only for the exact sealed owner/capture/video association without selecting GPS evidence', async () => {
  const captureId = 'f5ab5330-1c37-4488-aed8-157222d202cb'
  mocks.draft.mockResolvedValue({ ...row, capture_id: captureId, privateLocation: { id, capture_id: captureId } })
  mocks.capture.mockResolvedValue({ id: captureId })
  expect(await getDraftForOwner(id)).toMatchObject({ captureId, hasCoords: true })
  expect(mocks.capture).toHaveBeenCalledWith({ where: { id: captureId, owner_id: 'owner', state: 'sealed', listing_id: id, video_path: row.video_path }, select: { id: true } })
  mocks.capture.mockResolvedValue(null)
  expect(await getDraftForOwner(id)).toMatchObject({ captureId: null, hasCoords: false })
})

it('returns no GPS lock when the draft has no private capture record', async () => {
  mocks.draft.mockResolvedValue({ ...row, privateLocation: null })
  expect(await getDraftForOwner(id)).toMatchObject({ hasCoords: false })
})

it('does not inspect drafts for an unauthenticated caller', async () => {
  mocks.userId.mockResolvedValue(null)
  expect(await getDraftForOwner(id)).toBeNull()
  expect(mocks.draft).not.toHaveBeenCalled()
})

it('does not resume a missing, submitted or other-owner record', async () => {
  mocks.draft.mockResolvedValue(null)
  expect(await getDraftForOwner(id)).toBeNull()
})
