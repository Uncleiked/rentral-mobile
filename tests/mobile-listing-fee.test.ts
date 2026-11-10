import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn(), values: new Map<string, string>() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixture.request, ApiError: class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message) }
} }))
vi.mock('../apps/mobile/src/lib/session-storage', () => ({ sessionStorage: { getItem: fixture.get, setItem: fixture.set, removeItem: fixture.remove } }))
import { ApiError } from '../apps/mobile/src/lib/api'
import { publicationFeeCheckoutSchema, publicationFeeSchema } from '../lib/contracts/listing-payments'
import { canOpenPublicationCheckout, canReopenPublicationCheckout, currentPublicationFeeVerified, loadPublicationFee, preparePublicationCheckout, reconcilePublicationFee, type PublicationFee } from '../apps/mobile/src/lib/listing-fee-api'
import { beginPublicationCheckout, loadListingFeeRecovery, reviewPublicationPayment, verifyPublicationPayment } from '../apps/mobile/src/lib/listing-fee-recovery'
const actor = '11111111-1111-4111-8111-111111111111', listing = '22222222-2222-4222-8222-222222222222', other = '33333333-3333-4333-8333-333333333333'
const reference = `rentral-${other}`, path = `/my-listings/${listing}/publication-fee`, key = `rentral.listing-fee.pending.${actor}.${listing}`
const initial: PublicationFee = { listingId: listing, currency: 'NGN', amountKobo: '100000', paymentAvailable: true, environment: 'test', listingStatus: 'pending_verification', archived: false, waived: false, payment: null, actions: { checkout: true, reconcile: false } }
const payment = { id: other, reference, status: 'pending' as const, environment: 'test' as const, amountKobo: '100000' as const, currency: 'NGN' as const, createdAt: '2030-01-01T00:00:00Z', paidAt: null }
const pending: PublicationFee = { ...initial, payment, actions: { checkout: true, reconcile: true } }
const paid: PublicationFee = { ...pending, payment: { ...payment, status: 'succeeded', paidAt: '2030-01-01T00:00:01Z' }, actions: { checkout: false, reconcile: true } }
const checkout = { url: 'https://checkout.paystack.com/fixture', paymentId: other, reference, environment: 'test' as const }
const prepared = { ...checkout, actorId: actor, listingId: listing }
beforeEach(() => {
  vi.resetAllMocks(); fixture.values.clear()
  fixture.get.mockImplementation(async key => fixture.values.get(key) ?? null)
  fixture.set.mockImplementation(async (key, value) => { fixture.values.set(key, value) })
  fixture.remove.mockImplementation(async key => { fixture.values.delete(key) })
})
it('uses the server’s exact publication amount and does not equate verified payment with listing publication', () => {
  expect(publicationFeeSchema.parse(paid).amountKobo).toBe('100000')
  expect(publicationFeeSchema.parse(paid).listingStatus).toBe('pending_verification')
  expect(publicationFeeSchema.safeParse({ ...paid, amountKobo: '100001' }).success).toBe(false)
  expect(publicationFeeSchema.safeParse({ ...paid, payment: { ...paid.payment, currency: 'USD' } }).success).toBe(false)
})
it.each(['http://checkout.paystack.com/access', 'https://checkout.paystack.com.attacker.test/access', 'https://name:secret@checkout.paystack.com/access',
  'https://checkout.paystack.com:8443/access', 'https://checkout.paystack.com/access#private', 'javascript:alert(1)'])('refuses unsafe publication checkout URL %s', url => {
  expect(publicationFeeCheckoutSchema.safeParse({ ...checkout, url }).success).toBe(false)
})
it('binds read, checkout and reconciliation to the captured owner and checks the returned listing identity', async () => {
  fixture.request.mockResolvedValueOnce(initial).mockResolvedValueOnce(checkout).mockResolvedValueOnce(paid)
  await loadPublicationFee(listing, actor); await preparePublicationCheckout(listing, actor); await reconcilePublicationFee(listing, reference, actor)
  expect(fixture.request.mock.calls).toEqual([[path, { expectedUserId: actor }], [`${path}/checkout`, { method: 'POST', body: {}, expectedUserId: actor }], [`${path}/reconcile`, { method: 'POST', body: { reference }, expectedUserId: actor }]])
  fixture.request.mockResolvedValue({ ...initial, listingId: other })
  await expect(loadPublicationFee(listing, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it.each([
  { paymentAvailable: false }, { waived: true }, { environment: null }, { archived: true }, { listingStatus: 'draft' }, { listingStatus: 'active' }, { actions: { checkout: false, reconcile: false } },
  { payment: { ...payment, environment: 'live' as const } }, { payment: { ...payment, environment: null } },
  ...(['initializing', 'uncertain', 'succeeded', 'requires_review', 'reversed'] as const).map(status => ({ payment: { ...payment, status } })),
])('keeps checkout disabled for unavailable, wrong-mode, archived or unresolved state %#', patch => {
  expect(canOpenPublicationCheckout({ ...initial, ...patch })).toBe(false)
})
it('persists an actor/listing operation before any POST without storing browser URLs or credentials', async () => {
  fixture.request.mockImplementation(async () => {
    expect(JSON.parse(fixture.values.get(key)!)).toEqual({ version: 1, actorId: actor, listingId: listing, operation: 'checkout' })
    expect(fixture.values.get(`${key}.present`)).toBe('1')
    return checkout
  })
  expect(await beginPublicationCheckout(actor, listing)).toEqual(checkout)
  expect([...fixture.values.values()].join('')).not.toMatch(/checkout\.paystack|fixture-access|refresh_token/)
})
it.each(['failed', 'abandoned'] as const)('allows a deliberate new current-mode attempt after a known terminal %s result', status => {
  expect(canOpenPublicationCheckout({ ...initial, environment: 'live', payment: { ...payment, environment: 'test', status } })).toBe(true)
})
it('reopens a provider capability only for the exact actor, listing, payment, reference and current environment', () => {
  expect(canReopenPublicationCheckout(pending, prepared, actor, listing)).toBe(true)
  expect(canReopenPublicationCheckout(pending, prepared, other, listing)).toBe(false)
  expect(canReopenPublicationCheckout(pending, prepared, actor, other)).toBe(false)
  expect(canReopenPublicationCheckout({ ...pending, listingId: other }, prepared, actor, listing)).toBe(false)
  expect(canReopenPublicationCheckout({ ...pending, payment: { ...payment, id: listing } }, prepared, actor, listing)).toBe(false)
  expect(canReopenPublicationCheckout({ ...pending, payment: { ...payment, reference: `rentral-${listing}` } }, prepared, actor, listing)).toBe(false)
  expect(canReopenPublicationCheckout(initial, prepared, actor, listing)).toBe(false)
  expect(canReopenPublicationCheckout(paid, prepared, actor, listing)).toBe(false)
  expect(canReopenPublicationCheckout({ ...pending, environment: 'live' }, prepared, actor, listing)).toBe(false)
  expect(canReopenPublicationCheckout({ ...pending, payment: { ...payment, status: 'failed' } }, prepared, actor, listing)).toBe(false)
})
it('does not label a historical test/legacy successful fee as verified for another or unavailable current configuration', () => {
  expect(currentPublicationFeeVerified(paid)).toBe(true)
  expect(currentPublicationFeeVerified({ ...paid, environment: 'live' })).toBe(false)
  expect(currentPublicationFeeVerified({ ...paid, environment: null })).toBe(false)
  expect(currentPublicationFeeVerified({ ...paid, payment: { ...payment, status: 'succeeded', environment: null } })).toBe(false)
})
it('keeps an unknown action through restore, isolates other actors/listings and does not repeat a POST', async () => {
  fixture.request.mockRejectedValueOnce(new ApiError('Interrupted', 'NETWORK_ERROR', 0))
  await expect(beginPublicationCheckout(actor, listing)).rejects.toMatchObject({ status: 0 })
  expect((await loadListingFeeRecovery(actor, listing))?.operation).toBe('checkout')
  expect(await loadListingFeeRecovery(other, listing)).toBeNull()
  expect(await loadListingFeeRecovery(actor, other)).toBeNull()
  await expect(beginPublicationCheckout(actor, listing)).rejects.toThrow('previous action was not repeated')
  expect(fixture.request).toHaveBeenCalledTimes(1)
})
it('requires successful owner readback before clearing unknown recovery; readback never calls checkout or verify', async () => {
  fixture.request.mockRejectedValueOnce(new Error('unknown'))
  await expect(beginPublicationCheckout(actor, listing)).rejects.toThrow('unknown')
  fixture.request.mockRejectedValueOnce(new ApiError('Unavailable', 'UNAVAILABLE', 503))
  await expect(reviewPublicationPayment(actor, listing)).rejects.toMatchObject({ status: 503 })
  expect(await loadListingFeeRecovery(actor, listing)).not.toBeNull()
  fixture.request.mockResolvedValueOnce(pending)
  expect((await reviewPublicationPayment(actor, listing)).fee.payment?.status).toBe('pending')
  expect(await loadListingFeeRecovery(actor, listing)).toBeNull()
  expect(fixture.request.mock.calls.slice(1)).toEqual([[path, { expectedUserId: actor }], [path, { expectedUserId: actor }]])
})
it('records verification intent and retains uncertain verification until explicit server readback', async () => {
  fixture.request.mockRejectedValueOnce(new ApiError('Interrupted', 'NETWORK_ERROR', 0))
  await expect(verifyPublicationPayment(actor, listing, reference)).rejects.toMatchObject({ status: 0 })
  expect(await loadListingFeeRecovery(actor, listing)).toMatchObject({ operation: 'reconcile', reference })
  fixture.request.mockResolvedValueOnce(paid)
  const result = await reviewPublicationPayment(actor, listing)
  expect(result.fee.payment?.status).toBe('succeeded')
  expect(result.fee.listingStatus).toBe('pending_verification')
  expect(fixture.request).toHaveBeenCalledTimes(2)
})
it.each([1, 2])('does not submit when durable storage write %s fails', async failAt => {
  let writes = 0
  fixture.set.mockImplementation(async (key, value) => { if (++writes === failAt) throw new Error('Keychain unavailable'); fixture.values.set(key, value) })
  await expect(beginPublicationCheckout(actor, listing)).rejects.toThrow('Keychain unavailable')
  expect(fixture.request).not.toHaveBeenCalled()
})
it('preserves a missing/corrupt recovery marker until server state can be reviewed', async () => {
  fixture.values.set(`${key}.present`, '1')
  await expect(loadListingFeeRecovery(actor, listing)).rejects.toThrow('incomplete')
  await expect(beginPublicationCheckout(actor, listing)).rejects.toThrow('incomplete')
  expect(fixture.request).not.toHaveBeenCalled()
  fixture.request.mockResolvedValueOnce(initial)
  expect((await reviewPublicationPayment(actor, listing)).cleanupPending).toBe(false)
  expect(await loadListingFeeRecovery(actor, listing)).toBeNull()
})
it('never announces successful keychain cleanup when a verified result cannot be cleared locally', async () => {
  fixture.request.mockResolvedValue(paid); fixture.remove.mockRejectedValue(new Error('Keychain unavailable'))
  const result = await verifyPublicationPayment(actor, listing, reference)
  expect(result.fee.payment?.status).toBe('succeeded')
  expect(result.cleanupPending).toBe(true)
  expect(await loadListingFeeRecovery(actor, listing)).not.toBeNull()
})
