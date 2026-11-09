import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ identity: vi.fn(), create: vi.fn(), own: vi.fn(), checkout: vi.fn(), reconcile: vi.fn(), payment: vi.fn(), observation: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/db', () => ({ default: { paymentIntent: { findFirst: mocks.payment } } }))
vi.mock('@/lib/commerce/orders', () => ({ createCommercialOrder: mocks.create }))
vi.mock('@/lib/commerce/views', () => ({ ownCommercialOrder: mocks.own }))
vi.mock('@/lib/payments/service', () => ({ startCommercialOrderPayment: mocks.checkout, reconcilePayment: mocks.reconcile }))
vi.mock('@/lib/commerce/placements', () => ({ recordSponsoredObservation: mocks.observation }))
import { ApiError } from '@/lib/api/http'
import { POST as createOrder } from '@/app/api/v1/commercial/orders/route'
import { POST as checkout } from '@/app/api/v1/commercial/orders/[id]/checkout/route'
import { POST as reconcile } from '@/app/api/v1/commercial/orders/[id]/reconcile/route'
import { POST as observe } from '@/app/api/v1/sponsored/[id]/events/route'
const actor = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222'
const reference = `rentral-${id}`
const input = { clientId: id, kind: 'insights' }
const context = { params: Promise.resolve({ id }) }
function request(body: unknown) { return new Request('http://localhost:3000/api/v1/commercial/orders', { method: 'POST', headers: { authorization: 'Bearer controlled-fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
beforeEach(() => {
  vi.resetAllMocks(); mocks.identity.mockResolvedValue({ userId: actor, mode: 'bearer' }); mocks.create.mockResolvedValue(id)
  mocks.own.mockResolvedValue({ id }); mocks.checkout.mockResolvedValue('https://checkout.paystack.com/owned-fixture')
  mocks.payment.mockResolvedValue({ id }); mocks.reconcile.mockResolvedValue(undefined); mocks.observation.mockResolvedValue(false)
})
it('checks identity and central mutation guards before purchase services', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
  expect((await createOrder(request(input))).status).toBe(401)
  expect((await checkout(request({}), context)).status).toBe(401)
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.checkout).not.toHaveBeenCalled()
})
it('creates only the authenticated actor order with a durable client key and no client price', async () => {
  expect((await createOrder(request(input))).status).toBe(201)
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith(actor, input)
  expect(mocks.identity).toHaveBeenCalledWith(expect.anything(), { platform: true, mutation: true, verified: true })
  mocks.create.mockClear()
  for (const bad of [{ ...input, userId: id }, { ...input, amountKobo: '1' }, { ...input, billingEnvironment: 'live' }, { ...input, serviceDays: 366 }]) expect((await createOrder(request(bad))).status).toBe(400)
  expect(mocks.create).not.toHaveBeenCalled()
})
it('never prepares checkout for an unavailable owned order', async () => {
  mocks.own.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Unavailable.'))
  expect((await checkout(request({}), context)).status).toBe(404)
  expect(mocks.checkout).not.toHaveBeenCalled()
})
it.each(['http://checkout.paystack.com/insecure', 'https://checkout.paystack.com.attacker.invalid/forged', 'https://user:secret@checkout.paystack.com/private', 'https://checkout.paystack.com:444/private'])('rejects an unverified hosted checkout URL (%s)', async url => {
  mocks.checkout.mockResolvedValue(url)
  const response = await checkout(request({}), context)
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ code: 'COMMERCIAL_CHECKOUT_UNCONFIRMED' })
  expect(mocks.checkout).toHaveBeenCalledOnce()
})
it('reconciles only a reference scoped to the authenticated actor and exact commercial order', async () => {
  mocks.payment.mockResolvedValue(null)
  expect((await reconcile(request({ reference }), context)).status).toBe(404)
  expect(mocks.payment).toHaveBeenCalledWith({ where: { user_id: actor, order_id: id, kind: 'commercial', reference }, select: { id: true } })
  expect(mocks.reconcile).not.toHaveBeenCalled()
  mocks.payment.mockResolvedValue({ id })
  expect((await reconcile(request({ reference }), context)).status).toBe(200)
  expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(actor, reference)
})
it('returns an honest uncertain mutation error without private diagnostics or automatic replay', async () => {
  mocks.create.mockRejectedValue(new Error('private-provider-key-or-account-data'))
  const response = await createOrder(request(input)), body = await response.text()
  expect(response.status).toBe(503); expect(body).toContain('COMMERCIAL_UPDATE_UNCONFIRMED'); expect(body).not.toContain('private-provider')
  expect(mocks.create).toHaveBeenCalledOnce()
})
it('treats sponsored telemetry as optional consented observations and rejects client success claims', async () => {
  const response = await observe(request({ event: 'impression' }), context)
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ data: { recorded: false } })
  expect(mocks.observation).toHaveBeenCalledExactlyOnceWith(actor, id, 'impression')
  mocks.observation.mockClear()
  for (const bad of [{ event: 'verified_booking' }, { event: 'click', subject_hash: 'client-identity' }, { event: 'click', people: 10 }]) expect((await observe(request(bad), context)).status).toBe(400)
  expect(mocks.observation).not.toHaveBeenCalled()
})
