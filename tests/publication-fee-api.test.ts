import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ identity: vi.fn(), listing: vi.fn(), payment: vi.fn(), matches: vi.fn(), start: vi.fn(), reconcile: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/db', () => ({ default: { listing: { findFirst: mocks.listing }, paymentIntent: { findFirst: mocks.payment } } }))
vi.mock('@/lib/payments/service', () => ({ startListingFeePayment: mocks.start, reconcilePayment: mocks.reconcile }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/accounts/availability', async original => ({ ...await original<typeof import('@/lib/accounts/availability')>(), assertActiveAccounts: vi.fn(async () => undefined) }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: vi.fn(async () => true), withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({ listing: { findFirst: mocks.listing }, paymentIntent: { findMany: mocks.matches, findFirst: mocks.payment } }) }))
import { ApiError } from '@/lib/api/http'
import { ownedPublicationFee } from '@/lib/api/listing-payments'
import { GET } from '@/app/api/v1/my-listings/[id]/publication-fee/route'
import { POST as checkout } from '@/app/api/v1/my-listings/[id]/publication-fee/checkout/route'
import { POST as reconcile } from '@/app/api/v1/my-listings/[id]/publication-fee/reconcile/route'
const owner = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222', paymentId = '33333333-3333-4333-8333-333333333333'
const reference = `rentral-${paymentId}`, date = new Date('2030-01-01T00:00:00Z'), context = { params: Promise.resolve({ id }) }
let listing: { id: string; listing_status: string; archived_at: Date | null }
let payment: { id: string; reference: string; status: string; provider_environment: string | null; amount_kobo: bigint; currency: string; createdAt: Date; paid_at: Date | null; customer_email: string; checkout_url: string }
function request(method = 'GET', body?: unknown) { return new Request(`http://localhost:3000/api/v1/my-listings/${id}/publication-fee`, { method,
  headers: { authorization: 'Bearer owned-fixture', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_owned_fixture'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'test')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://owned-fixture.invalid')
  listing = { id, listing_status: 'pending_verification', archived_at: null }
  payment = { id: paymentId, reference, status: 'pending', provider_environment: 'test', amount_kobo: BigInt(100000), currency: 'NGN', createdAt: date, paid_at: null, customer_email: 'private-owned-fixture@fixture.invalid', checkout_url: 'https://checkout.paystack.com/owned-fixture' }
  mocks.identity.mockResolvedValue({ userId: owner, mode: 'bearer' })
  mocks.listing.mockImplementation(async ({ where }) => where.id === id && where.lister_id === owner ? listing : null)
  mocks.payment.mockImplementation(async ({ where }) => where.listing_id === id && where.user_id === owner && where.kind === 'listing_fee' && (!where.reference || where.reference === reference)
    && (!where.status || where.status === payment.status) && (!where.provider_environment || where.provider_environment === payment.provider_environment) ? payment : null)
  payment.checkout_url = 'https://checkout.paystack.com/owned-fixture'
  mocks.matches.mockResolvedValue([{ id: paymentId }])
  mocks.start.mockImplementation(async () => { payment.status = 'pending'; payment.provider_environment = process.env.PAYSTACK_ENVIRONMENT ?? 'test'; return payment.checkout_url }); mocks.reconcile.mockResolvedValue('pending')
})
afterEach(() => vi.unstubAllEnvs())
it('authenticates before reads or provider mutations and keeps central cookie-CSRF/captured-actor guards', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
  expect((await GET(request(), context)).status).toBe(401)
  expect((await checkout(request('POST', {}), context)).status).toBe(401)
  expect(mocks.listing).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled()
})
it('returns exact integer-kobo own-listing history without provider credentials or customer data', async () => {
  const response = await GET(request(), context), body = await response.text()
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(JSON.parse(body)).toMatchObject({ data: { listingId: id, amountKobo: '100000', currency: 'NGN', environment: 'test', payment: { reference, amountKobo: '100000' }, actions: { checkout: true, reconcile: true } } })
  expect(body).not.toContain(payment.customer_email); expect(body).not.toContain('provider_environment'); expect(body).not.toContain('checkout_url')
})
it('does not expose or prepare a foreign listing even if its ID is valid', async () => {
  mocks.identity.mockResolvedValue({ userId: paymentId, mode: 'bearer' })
  expect((await GET(request(), context)).status).toBe(404)
  expect((await checkout(request('POST', {}), context)).status).toBe(404)
  expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.payment).not.toHaveBeenCalled()
})
it.each(['created', 'pending', 'failed', 'abandoned'])('allows explicit checkout for a current-mode%s attempt', async status => {
  payment.status = status
  expect((await ownedPublicationFee(owner, id)).actions.checkout).toBe(true)
})
it.each(['initializing', 'uncertain', 'succeeded', 'requires_review', 'reversed'])('preserves%s history without allowing another collection', async status => {
  payment.status = status
  expect((await ownedPublicationFee(owner, id)).actions.checkout).toBe(false)
  expect((await checkout(request('POST', {}), context)).status).toBe(409)
  expect(mocks.start).not.toHaveBeenCalled()
})
it('requires submitted nonarchived inventory and denies malformed historical amount/currency', async () => {
  listing.archived_at = date; expect((await ownedPublicationFee(owner, id)).actions.checkout).toBe(false)
  listing.archived_at = null; listing.listing_status = 'draft'; expect((await ownedPublicationFee(owner, id)).actions.checkout).toBe(false)
  listing.listing_status = 'pending_verification'; payment.amount_kobo = BigInt(1)
  expect((await GET(request(), context)).status).toBe(503)
  payment.amount_kobo = BigInt(100000); payment.currency = 'USD'
  expect((await GET(request(), context)).status).toBe(503)
})
it('denies saved wrong-mode pending/unknown-mode checkout but permits explicit retry of a known terminal attempt in the new mode', async () => {
  vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_owned_fixture'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'live')
  const current = await ownedPublicationFee(owner, id)
  expect(current).toMatchObject({ environment: 'live', payment: { environment: 'test' }, actions: { checkout: false, reconcile: false } })
  expect((await checkout(request('POST', {}), context)).status).toBe(409); expect(mocks.start).not.toHaveBeenCalled()
  payment.status = 'failed'; expect((await ownedPublicationFee(owner, id)).actions.checkout).toBe(true)
  expect((await checkout(request('POST', {}), context)).status).toBe(200)
  payment.provider_environment = null; expect((await ownedPublicationFee(owner, id)).actions.checkout).toBe(false)
})
it('accepts no client amount/actor and never emits an unverified checkout URL', async () => {
  for (const body of [{ amountKobo: '1' }, { userId: paymentId }]) expect((await checkout(request('POST', body), context)).status).toBe(400)
  expect(mocks.start).not.toHaveBeenCalled()
  mocks.start.mockResolvedValue('https://checkout.paystack.com.attacker.invalid/private')
  const response = await checkout(request('POST', {}), context)
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: 'PUBLICATION_FEE_CHECKOUT_UNCONFIRMED' })
  expect(mocks.identity).toHaveBeenCalledWith(expect.anything(), { platform: true, mutation: true, verified: true })
})
it('binds reconciliation to exact actor/listing/fee kind instead of another owned booking reference', async () => {
  const otherReference = `rentral-${owner}`
  expect((await reconcile(request('POST', { reference: otherReference }), context)).status).toBe(404)
  expect(mocks.reconcile).not.toHaveBeenCalled()
  expect(mocks.payment).toHaveBeenLastCalledWith({ where: { user_id: owner, listing_id: id, kind: 'listing_fee', reference: otherReference }, select: { id: true, provider_environment: true } })
  expect((await reconcile(request('POST', { reference }), context)).status).toBe(200)
  expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(owner, reference)
})
it('keeps disabled provider history readable and reports payment mutations unavailable', async () => {
  vi.stubEnv('PAYMENTS_ENABLED', 'false')
  expect((await ownedPublicationFee(owner, id))).toMatchObject({ paymentAvailable: false, actions: { checkout: false, reconcile: false } })
  expect((await checkout(request('POST', {}), context)).status).toBe(503)
  expect((await reconcile(request('POST', { reference }), context)).status).toBe(503)
  expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled()
})
it('reports unknown checkout acceptance honestly without private details or automatic provider replay', async () => {
  mocks.start.mockRejectedValue(new Error('private-account-and-provider-secret'))
  const response = await checkout(request('POST', {}), context), body = await response.text()
  expect(response.status).toBe(503); expect(body).toContain('PUBLICATION_FEE_UPDATE_UNCONFIRMED'); expect(body).not.toContain('private-account')
  expect(mocks.start).toHaveBeenCalledExactlyOnceWith(owner, id)
})
it('binds a successful checkout to the exact persisted current intent without leaking other records', async () => {
  const response = await checkout(request('POST', {}), context)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ data: { url: payment.checkout_url, paymentId, reference, environment: 'test' } })
})
it.each(['duplicate-url', 'new-latest', 'webhook-paid'])('returns readback409 when checkout provenance changes (%s)', async change => {
  if (change === 'duplicate-url') mocks.matches.mockResolvedValue([{ id: paymentId }, { id: owner }])
  if (change === 'new-latest') mocks.matches.mockResolvedValue([{ id: owner }])
  if (change === 'webhook-paid') mocks.start.mockImplementation(async () => { payment.status = 'succeeded'; return payment.checkout_url })
  const response = await checkout(request('POST', {}), context)
  expect(response.status).toBe(409)
  const body = await response.text(); expect(body).toContain('PUBLICATION_FEE_CHANGED'); expect(body).not.toContain(payment.checkout_url)
})
it('reports invalid callback configuration before checkout while retaining existing payment reconciliation', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  expect(await ownedPublicationFee(owner, id)).toMatchObject({ paymentAvailable: false, actions: { checkout: false, reconcile: true } })
  const response = await checkout(request('POST', {}), context)
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: 'PAYMENT_CALLBACK_UNAVAILABLE' })
  expect(mocks.start).not.toHaveBeenCalled()
})
