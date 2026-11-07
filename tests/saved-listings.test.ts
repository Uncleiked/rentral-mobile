import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ user: vi.fn(), findListing: vi.fn(), upsert: vi.fn(), remove: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/action-helpers', () => ({ requireUserId: mocks.user }))
vi.mock('@/lib/db', () => ({ default: { listing: { findFirst: mocks.findListing }, savedListing: { upsert: mocks.upsert, deleteMany: mocks.remove } } }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { setListingSaved } from '@/app/actions/savedActions'

const listingId = '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d'
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
  mocks.user.mockResolvedValue('current-user')
  mocks.findListing.mockResolvedValue({ id: listingId })
})
afterEach(() => vi.unstubAllEnvs())

it('does not access auth or new tables before the schema is enabled', async () => {
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'false')
  expect(await setListingSaved({ listingId, saved: true })).toMatchObject({ success: false })
  expect(mocks.user).not.toHaveBeenCalled()
  expect(mocks.upsert).not.toHaveBeenCalled()
})

it('requires an authenticated user and valid input', async () => {
  expect(await setListingSaved({ listingId: '../../private', saved: true })).toMatchObject({ success: false })
  expect(mocks.user).not.toHaveBeenCalled()
  mocks.user.mockResolvedValue(null)
  expect(await setListingSaved({ listingId, saved: true })).toMatchObject({ success: false })
  expect(mocks.upsert).not.toHaveBeenCalled()
})

it('only saves a currently active listing, using the authenticated identity', async () => {
  expect(await setListingSaved({ listingId, saved: true, userId: 'another-user' })).toEqual({ success: true, data: { saved: true } })
  expect(mocks.findListing).toHaveBeenCalledWith({ where: { id: listingId, listing_status: 'active' }, select: { id: true } })
  expect(mocks.upsert).toHaveBeenCalledWith({ where: { user_id_listing_id: { user_id: 'current-user', listing_id: listingId } }, create: { user_id: 'current-user', listing_id: listingId }, update: {} })
  mocks.findListing.mockResolvedValue(null)
  expect(await setListingSaved({ listingId, saved: true })).toMatchObject({ success: false })
  expect(mocks.upsert).toHaveBeenCalledTimes(1)
})

it('scopes removal to the current user and allows removal after a listing disappears', async () => {
  expect(await setListingSaved({ listingId, saved: false })).toEqual({ success: true, data: { saved: false } })
  expect(mocks.remove).toHaveBeenCalledWith({ where: { user_id: 'current-user', listing_id: listingId } })
  expect(mocks.findListing).not.toHaveBeenCalled()
  expect(mocks.revalidate).toHaveBeenCalledWith('/marketplace/saved')
})

it('returns a useful retry error without exposing a database failure', async () => {
  mocks.upsert.mockRejectedValue(new Error('secret database details'))
  const result = await setListingSaved({ listingId, saved: true })
  expect(result).toEqual({ success: false, error: 'We could not update your saved listings. Please try again.' })
})
