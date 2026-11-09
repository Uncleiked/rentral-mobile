import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/http'
import { FinancialError } from '@/lib/payments/financial-policy'
import { PaystackError } from '@/lib/payments/providers/paystack/client'
import { MongoReadinessError } from '@/lib/database/readiness'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), overview: vi.fn(), recipient: vi.fn(), disable: vi.fn(), payment: vi.fn(), request: vi.fn(), decide: vi.fn(),
  execute: vi.fn(), finalize: vi.fn(), retry: vi.fn(), reconcile: vi.fn(), viewer: vi.fn(), receipt: vi.fn(), banks: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/payments/financial', () => ({ getFinancialWorkspace: mocks.overview, setupPaymentRecipient: mocks.recipient, disablePaymentRecipient: mocks.disable,
  getFinancialPayment: mocks.payment, requestFinancialOperation: mocks.request, decideFinancialOperation: mocks.decide }))
vi.mock('@/lib/payments/financial-execution', () => ({ executeFinancialOperation: mocks.execute, finalizeFinancialTransfer: mocks.finalize,
  retryFinancialRefund: mocks.retry, reconcileFinancialOperation: mocks.reconcile, financialOperationForViewer: mocks.viewer }))
vi.mock('@/lib/payments/financial-receipts', () => ({ retryProviderReceipt: mocks.receipt }))

import { GET as overview } from '@/app/api/v1/financial/route'
import { POST as setupRecipient } from '@/app/api/v1/financial/recipients/route'
import { DELETE as disableRecipient } from '@/app/api/v1/financial/recipients/[id]/route'
import { GET as payment } from '@/app/api/v1/financial/payments/[id]/route'
import { POST as createOperation } from '@/app/api/v1/financial/operations/route'
import { POST as action } from '@/app/api/v1/financial/operations/[id]/route'
import { POST as retryReceipt } from '@/app/api/v1/financial/receipts/[id]/route'

const actor = 'f889f677-c3d3-4182-bd60-64066ee1c237', id = '828db1e4-46ec-4774-9d8d-e78058b399d2'
const reason = 'Independent request for a carefully reviewed financial instruction.'
const context = { params: Promise.resolve({ id }) }
function request(value: unknown, method = 'POST') { return new Request('http://localhost:3000/api/v1/financial', { method,
  headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: JSON.stringify(value) }) }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.identity.mockResolvedValue({ userId: actor, mode: 'bearer' })
  mocks.overview.mockResolvedValue({ operations: [] }); mocks.recipient.mockResolvedValue({ id }); mocks.request.mockResolvedValue({ id })
  for (const fn of [mocks.decide, mocks.execute, mocks.finalize, mocks.retry, mocks.viewer]) fn.mockResolvedValue({ id })
  mocks.payment.mockResolvedValue({ id, environment: 'test', bookingId: null, refundBookingId: null, reference: 'fixture', amountKobo: '10000', availableKobo: '10000', status: 'succeeded', createdAt: '2026-11-09T00:00:00.000Z' })
})

describe('financial HTTP authorization and strict commands', () => {
  it('requires an authenticated identity before reading any financial history', async () => {
    mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in required.'))
    expect((await overview(new Request('http://localhost:3000/api/v1/financial'))).status).toBe(401)
    expect(mocks.overview).not.toHaveBeenCalled()
  })
  it('forwards bounded archive cursors and explicit staff scope for current-role service checks', async () => {
    expect((await overview(new Request('http://localhost:3000/api/v1/financial?scope=staff&operationsCursor=older&paymentsCursor=payments'))).status).toBe(200)
    expect(mocks.overview).toHaveBeenCalledWith(actor, { staff: true, operationsCursor: 'older', paymentsCursor: 'payments' })
  })
  it.each(['approve', 'reject'])('requires a reason and strict %s command before the privileged service', async operation => {
    expect((await action(request({ action: operation }), context)).status).toBe(400)
    expect(mocks.decide).not.toHaveBeenCalled()
    expect((await action(request({ action: operation, reason }), context)).status).toBe(200)
    expect(mocks.decide).toHaveBeenCalledWith(actor, id, operation, reason)
    expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), { mutation: true, verified: true, platform: true })
  })
  it.each(['execute', 'reconcile'])('rejects injected money/recipient fields on %s command', async operation => {
    expect((await action(request({ action: operation, amountKobo: '1', recipientId: id }), context)).status).toBe(400)
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled()
  })
  it('passes only the authenticated actor and existing operation to execution or reconciliation', async () => {
    expect((await action(request({ action: 'execute' }), context)).status).toBe(200)
    expect(mocks.execute).toHaveBeenCalledWith(actor, id)
    expect((await action(request({ action: 'reconcile' }), context)).status).toBe(200)
    expect(mocks.reconcile).toHaveBeenCalledWith(actor, id)
  })
  it('uses OTP only for explicit finalization and rejects malformed or extra data', async () => {
    expect((await action(request({ action: 'finalize', otp: '123456' }), context)).status).toBe(200)
    expect(mocks.finalize).toHaveBeenCalledWith(actor, id, '123456')
    mocks.finalize.mockClear()
    expect((await action(request({ action: 'finalize', otp: 'not-numeric' }), context)).status).toBe(400)
    expect(mocks.finalize).not.toHaveBeenCalled()
  })
  it('forwards refund bank ID separately from bank code with no public response echo', async () => {
    const response = await action(request({ action: 'retryRefund', bankId: '9', accountNumber: '0123456789' }), context)
    expect(response.status).toBe(200)
    expect(mocks.retry).toHaveBeenCalledWith(actor, id, { action: 'retryRefund', bankId: '9', accountNumber: '0123456789' })
    expect(await response.text()).not.toContain('0123456789')
  })
  it('passes recipient setup through authenticated write/origin policy and masks the response', async () => {
    const response = await setupRecipient(request({ accountNumber: '0123456789', bankCode: '058' }))
    expect(response.status).toBe(201)
    expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), { mutation: true, verified: true, platform: true })
    expect(mocks.recipient).toHaveBeenCalledWith(actor, { accountNumber: '0123456789', bankCode: '058' })
    expect(await response.text()).not.toContain('0123456789')
  })
  it('disables only the path recipient through the current authenticated owner', async () => {
    expect((await disableRecipient(new Request('http://localhost:3000/api/v1/financial/recipients/id', { method: 'DELETE' }), context)).status).toBe(200)
    expect(mocks.disable).toHaveBeenCalledWith(actor, id)
  })
  it('looks up archived refund sources by authenticated payer and validates the returned DTO', async () => {
    const response = await payment(new Request('http://localhost:3000/api/v1/financial/payments/id'), context)
    expect(response.status).toBe(200)
    expect(mocks.payment).toHaveBeenCalledWith(actor, id)
    expect((await response.json()).data.payment.refundBookingId).toBeNull()
  })
  it('keeps financial reads and writes private and uncacheable', async () => {
    const response = await createOperation(request({ clientId: id, kind: 'refund', paymentId: id, amountKobo: '100', reason }))
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toContain('Authorization')
  })
  it('bounds chunked create commands before service access', async () => {
    const response = await createOperation(request({ reason: 'x'.repeat(20000) }))
    expect(response.status).toBe(413)
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('requeues only an existing receipt with a recorded current staff review reason', async () => {
    expect((await retryReceipt(request({ reason }), context)).status).toBe(200)
    expect(mocks.receipt).toHaveBeenCalledWith(actor, id, reason)
  })
})

describe('financial HTTP safe failure semantics', () => {
  it.each([
    [new FinancialError('INDEPENDENT_APPROVAL_REQUIRED', 'Independent reviewer required.', 403), 403, 'INDEPENDENT_APPROVAL_REQUIRED'],
    [new FinancialError('FUNDS_RESERVED', 'The source is already reserved.', 409), 409, 'FUNDS_RESERVED'],
    [new FinancialError('SETTLEMENT_UNAVAILABLE', 'Merchant capability is disabled.', 503), 503, 'SETTLEMENT_UNAVAILABLE'],
    [new Error('Staff access required.'), 403, 'FORBIDDEN'],
    [new PaystackError('TIMEOUT', true), 409, 'FINANCIAL_OUTCOME_UNCERTAIN'],
    [new PaystackError('UNAVAILABLE'), 503, 'PROVIDER_UNAVAILABLE'],
    [new MongoReadinessError('DATABASE_SETUP_REQUIRED'), 503, 'DATABASE_SETUP_REQUIRED'],
  ])('returns a stable safe code for%s', async (error, status, code) => {
    mocks.execute.mockRejectedValue(error)
    const response = await action(request({ action: 'execute' }), context)
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ success: false, code })
  })
})
