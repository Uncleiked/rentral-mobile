import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ verified: vi.fn(), transaction: vi.fn(), lock: vi.fn(), booking: vi.fn(), createReview: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/action-helpers', () => ({ requireVerifiedUserId: mocks.verified }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction } }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: (work: (tx: unknown) => Promise<unknown>) => mocks.transaction(work), lockRecord: async (_tx: unknown, model: string, id: string) => { mocks.lock(model, id); return true } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { reviewSubject } from '@/lib/trust/policy'
import { submitReviewAction } from '@/app/actions/trustActions'

const bookingId = '11111111-1111-4111-8111-111111111111'
const input = { bookingId, rating: 4, comment: 'This is a synthetic completed-rental review.' }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); mocks.verified.mockResolvedValue('seeker')
  mocks.booking.mockResolvedValue({ seeker_id: 'seeker', lister_id: 'host', status: 'completed' })
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $queryRaw: mocks.lock,
    booking: { findFirst: mocks.booking }, review: { create: mocks.createReview }, notification: { create: mocks.notify } }))
})
afterEach(() => vi.unstubAllEnvs())

describe('booking-linked review eligibility', () => {
  it('derives the other participant only after completion', () => {
    expect(reviewSubject('seeker', { seeker_id: 'seeker', lister_id: 'host', status: 'completed' })).toBe('host')
    expect(reviewSubject('host', { seeker_id: 'seeker', lister_id: 'host', status: 'completed' })).toBe('seeker')
    expect(reviewSubject('outsider', { seeker_id: 'seeker', lister_id: 'host', status: 'completed' })).toBeNull()
    expect(reviewSubject('seeker', { seeker_id: 'seeker', lister_id: 'host', status: 'confirmed' })).toBeNull()
  })
  it('does not reach the database before platform availability and account authentication', async () => {
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'false')
    expect(await submitReviewAction(input)).toMatchObject({ success: false }); expect(mocks.verified).not.toHaveBeenCalled()
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); mocks.verified.mockResolvedValue(null)
    expect(await submitReviewAction(input)).toMatchObject({ success: false }); expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('locks and scopes the booking, deriving the subject server-side', async () => {
    expect(await submitReviewAction(input)).toMatchObject({ success: true })
    expect(mocks.lock).toHaveBeenCalledTimes(1)
    expect(mocks.booking).toHaveBeenCalledWith(expect.objectContaining({ where: { id: bookingId, OR: [{ seeker_id: 'seeker' }, { lister_id: 'seeker' }] } }))
    expect(mocks.createReview).toHaveBeenCalledWith({ data: { booking_id: bookingId, author_id: 'seeker', subject_id: 'host', rating: 4, comment: input.comment } })
    expect(await submitReviewAction({ ...input, subject_id: 'chosen-victim' })).toMatchObject({ success: false })
  })
  it('rejects outsiders, incomplete/disputed bookings, and duplicate reviews without misleading success', async () => {
    mocks.booking.mockResolvedValue(null)
    expect(await submitReviewAction(input)).toMatchObject({ success: false }); expect(mocks.createReview).not.toHaveBeenCalled()
    mocks.booking.mockResolvedValue({ seeker_id: 'seeker', lister_id: 'host', status: 'disputed' })
    expect(await submitReviewAction(input)).toMatchObject({ success: false }); expect(mocks.createReview).not.toHaveBeenCalled()
    mocks.booking.mockResolvedValue({ seeker_id: 'seeker', lister_id: 'host', status: 'completed' }); mocks.createReview.mockRejectedValue(new Error('unique constraint'))
    expect(await submitReviewAction(input)).toMatchObject({ success: false }); expect(mocks.notify).not.toHaveBeenCalled()
  })
})
