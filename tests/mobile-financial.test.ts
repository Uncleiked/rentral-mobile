import { beforeEach, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn(), values: new Map<string, string>() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixtures.request, ApiError: class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message) }
} }))
vi.mock('../apps/mobile/src/lib/session-storage', () => ({ sessionStorage: { getItem: fixtures.get, setItem: fixtures.set, removeItem: fixtures.remove } }))
import { financialOperationSchema } from '../lib/contracts/financial'
import { ApiError } from '../apps/mobile/src/lib/api'
import { disableFinancialRecipient, nativeFinancialOverviewSchema, reconcileFinancialOperation, requestFinancialOperation, setupFinancialRecipient } from '../apps/mobile/src/lib/financial-api'
import { canRequestOrdinaryPayout, financialCommandSchema, koboToNaira, nairaToKobo, type FinancialCommand } from '../apps/mobile/src/lib/financial-input'
import { dismissPendingFinancialCommand, loadPendingFinancialCommand, submitPendingFinancialCommand } from '../apps/mobile/src/lib/financial-pending-store'
import type { BookingDetail } from '../apps/mobile/src/lib/booking-contracts'

const actor = '11111111-1111-4111-8111-111111111111'
const paymentId = '22222222-2222-4222-8222-222222222222'
const bookingId = '33333333-3333-4333-8333-333333333333'
const recipientId = '44444444-4444-4444-8444-444444444444'
const clientId = '55555555-5555-4555-8555-555555555555'
const operationId = '66666666-6666-4666-8666-666666666666'
const timestamp = '2030-01-01T10:00:00.000Z'
const command: FinancialCommand = { clientId, kind: 'refund', paymentId, bookingId, amountKobo: '123456', reason: 'A reviewed fixture refund request.', policyVersion: 'standard-v1' }
const operation = { id: operationId, environment: 'test', kind: 'refund', bookingId, paymentId, recipientId: null, reference: `rt-refund-${operationId}`, amountKobo: command.amountKobo, retainedKobo: '0', policyVersion: 'standard-v1', currency: 'NGN', status: 'requested', providerStatus: null, failureCode: null,
  reason: command.reason, requestedBy: actor, createdAt: timestamp, updatedAt: timestamp, approvedAt: null, completedAt: null,
  actions: { approve: false, reject: true, execute: false, reconcile: false, finalize: false, retryRefund: false } }
const recipient = { id: recipientId, environment: 'test', bankCode: '058', accountLast4: '6789', status: 'active', createdAt: timestamp }
const workspace = { operations: [operation], recipients: [recipient], payments: [{ id: paymentId, environment: 'test', bookingId, refundBookingId: bookingId, reference: 'payment-fixture', amountKobo: '200000', availableKobo: '123456', status: 'succeeded', createdAt: timestamp }], receipts: [], settlementAvailable: false, operationsNextCursor: null, paymentsNextCursor: null }
beforeEach(() => {
  vi.resetAllMocks(); fixtures.values.clear()
  fixtures.get.mockImplementation(async key => fixtures.values.get(key) ?? null)
  fixtures.set.mockImplementation(async (key, value) => { fixtures.values.set(key, value) })
  fixtures.remove.mockImplementation(async key => { fixtures.values.delete(key) })
  fixtures.request.mockResolvedValue({ operation })
})

it.each([['1','100'],['0.01','1'],['1234.56','123456'],['90071992547409.91','9007199254740991']])('converts exact naira%s to%s kobo without floats', (naira,kobo) => {
  expect(nairaToKobo(naira)).toBe(kobo)
  expect(nairaToKobo(koboToNaira(kobo))).toBe(kobo)
})
it.each(['0','-1','01','1,000','1.001','1e6','90071992547409.92','Infinity','.20'])('rejects ambiguous or unsupported amount%s', value => {
  expect(() => nairaToKobo(value)).toThrow()
})
it('does not expose the holding-default policy through ordinary native instructions', () => {
  expect(financialCommandSchema.safeParse({ ...command, policyVersion: '30-70-v1' }).success).toBe(false)
  expect(financialCommandSchema.safeParse({ ...command, kind: 'payout', recipientId }).success).toBe(false)
})
it('limits ordinary payout entry to completed eligible host bookings', () => {
  const base = { role: 'host', status: 'completed', kind: 'rental', settlementStatus: 'unsettled', checkIn: { renterAt: null, hostAt: null } } as BookingDetail
  expect(canRequestOrdinaryPayout(base)).toBe(true)
  for (const patch of [{ role: 'renter' },{ status: 'confirmed' },{ kind: 'hold' },{ settlementStatus: 'settled' },{ settlementStatus: 'requires_review' },{ kind: 'inspection' }]) expect(canRequestOrdinaryPayout({ ...base, ...patch } as BookingDetail)).toBe(false)
  expect(canRequestOrdinaryPayout({ ...base, kind: 'inspection', checkIn: { renterAt: timestamp, hostAt: timestamp } })).toBe(true)
})
it('does not display impossible available funds or zero-amount requests from a malformed overview', () => {
  expect(nativeFinancialOverviewSchema.parse(workspace).payments[0].availableKobo).toBe('123456')
  expect(nativeFinancialOverviewSchema.safeParse({ ...workspace, payments: [{ ...workspace.payments[0], availableKobo: '200001' }] }).success).toBe(false)
  expect(nativeFinancialOverviewSchema.safeParse({ ...workspace, operations: [{ ...operation, amountKobo: '0' }] }).success).toBe(false)
  expect(nativeFinancialOverviewSchema.safeParse({ ...workspace, payments: [{ ...workspace.payments[0], availableKobo: '100.5' }] }).success).toBe(false)
  expect(financialCommandSchema.safeParse({ ...command, amountKobo: '100.5' }).success).toBe(false)
})
it('matches the confirmed financial response to the actor and exact submitted instructions', async () => {
  expect((await requestFinancialOperation(command,actor)).id).toBe(operationId)
  expect(fixtures.request).toHaveBeenCalledExactlyOnceWith('/financial/operations',{ method: 'POST', body: command, expectedUserId: actor })
})
it.each([{ amountKobo: '123457' },{ requestedBy: paymentId },{ kind: 'payout' },{ recipientId },{ paymentId: recipientId },{ bookingId: recipientId }])('rejects a mismatched financial acknowledgment%j', async patch => {
  fixtures.request.mockResolvedValue({ operation: { ...operation, ...patch } })
  await expect(requestFinancialOperation(command,actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('validates scoped recipient acknowledgment without returning or persisting the full bank number', async () => {
  fixtures.request.mockResolvedValueOnce({ recipient }).mockResolvedValueOnce({ recipient: { ...recipient, accountNumber: '0123456789' } })
  expect(await setupFinancialRecipient({ bankCode: '058', accountNumber: '0123456789' },actor)).toEqual(recipient)
  expect(fixtures.request.mock.calls[0][1]).toEqual({ method: 'POST', body: { bankCode: '058', accountNumber: '0123456789' }, expectedUserId: actor })
  await expect(setupFinancialRecipient({ bankCode: '058', accountNumber: '0123456789' },actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(fixtures.set).not.toHaveBeenCalled()
})
it('keeps reconcile and disable commands scoped to the current actor', async () => {
  await reconcileFinancialOperation(operationId,actor)
  expect(fixtures.request).toHaveBeenLastCalledWith(`/financial/operations/${operationId}`,{ method: 'POST', body: { action: 'reconcile' }, expectedUserId: actor })
  fixtures.request.mockResolvedValue({ removed: true })
  await disableFinancialRecipient(recipientId,actor)
  expect(fixtures.request).toHaveBeenLastCalledWith(`/financial/recipients/${recipientId}`,{ method: 'DELETE', expectedUserId: actor })
})
it('never automatically retries a financial mutation after a connection failure', async () => {
  fixtures.request.mockRejectedValue(new ApiError('Unknown result','NETWORK_ERROR',0))
  await expect(requestFinancialOperation(command,actor)).rejects.toMatchObject({ status: 0 })
  expect(fixtures.request).toHaveBeenCalledTimes(1)
})
it('saves the immutable command before sending and clears it only after a matching response', async () => {
  fixtures.request.mockImplementationOnce(async () => {
    const saved = [...fixtures.values.values()].find(value => value.startsWith('{'))
    expect(saved && JSON.parse(saved)).toEqual({ version: 1, actorId: actor, command })
    expect(saved).not.toMatch(/accountNumber|otp|access_token/i)
    return { operation }
  })
  const result = await submitPendingFinancialCommand(actor,command)
  expect(result.cleanupPending).toBe(false)
  expect(result.operation.id).toBe(operationId)
  expect(await loadPendingFinancialCommand(actor)).toBeNull()
})
it('keeps uncertain instructions across restore and retries exactly the same id and body', async () => {
  fixtures.request.mockRejectedValueOnce(new ApiError('Unknown result','NETWORK_ERROR',0)).mockResolvedValueOnce({ operation })
  await expect(submitPendingFinancialCommand(actor,command)).rejects.toMatchObject({ status: 0 })
  expect(await loadPendingFinancialCommand(actor)).toEqual(command)
  expect(await loadPendingFinancialCommand(recipientId)).toBeNull()
  await submitPendingFinancialCommand(actor,command)
  expect(fixtures.request.mock.calls[0]).toEqual(fixtures.request.mock.calls[1])
})
it('does not replace an uncertain command with a new idempotency key or changed amount', async () => {
  fixtures.request.mockRejectedValueOnce(new ApiError('Unknown result','NETWORK_ERROR',0))
  await expect(submitPendingFinancialCommand(actor,command)).rejects.toMatchObject({ status: 0 })
  await expect(submitPendingFinancialCommand(actor,{ ...command, clientId: recipientId, amountKobo: '10' })).rejects.toThrow('previous financial request')
  expect(fixtures.request).toHaveBeenCalledTimes(1)
  expect(await loadPendingFinancialCommand(actor)).toEqual(command)
})
it('does not submit when durable device persistence fails', async () => {
  fixtures.set.mockRejectedValueOnce(new Error('Keychain unavailable'))
  await expect(submitPendingFinancialCommand(actor,command)).rejects.toThrow('Keychain unavailable')
  expect(fixtures.request).not.toHaveBeenCalled()
})
it('treats missing chunks with a recovery marker as unknown rather than a new request', async () => {
  fixtures.values.set(`rentral.financial.pending.${actor}.present`,'1')
  await expect(loadPendingFinancialCommand(actor)).rejects.toThrow('incomplete')
  await expect(submitPendingFinancialCommand(actor,command)).rejects.toThrow('incomplete')
  expect(fixtures.request).not.toHaveBeenCalled()
})
it('does not let an overlapping screen overwrite an in-flight command that becomes uncertain', async () => {
  let fail: (reason: unknown) => void = () => undefined
  fixtures.request.mockImplementationOnce(() => new Promise((_resolve,reject) => { fail = reject }))
  const first = submitPendingFinancialCommand(actor,command)
  const firstRejected = expect(first).rejects.toMatchObject({ status: 0 })
  await vi.waitFor(() => expect(fixtures.request).toHaveBeenCalledTimes(1))
  const second = submitPendingFinancialCommand(actor,{ ...command, clientId: recipientId })
  const secondRejected = expect(second).rejects.toThrow('previous financial request')
  fail(new ApiError('Unknown result','NETWORK_ERROR',0))
  await Promise.all([firstRejected,secondRejected])
  expect(fixtures.request).toHaveBeenCalledTimes(1)
  expect(await loadPendingFinancialCommand(actor)).toEqual(command)
})
it('reports confirmed success even if local record cleanup fails, keeping safe recovery available', async () => {
  fixtures.remove.mockRejectedValueOnce(new Error('Keychain unavailable'))
  expect((await submitPendingFinancialCommand(actor,command)).cleanupPending).toBe(true)
  expect(await loadPendingFinancialCommand(actor)).toEqual(command)
})
it('requires explicit dismissal for malformed records and never sends their content', async () => {
  fixtures.values.set(`rentral.financial.pending.${actor}`,'{"bankNumber":"never forward"}')
  await expect(loadPendingFinancialCommand(actor)).rejects.toThrow('cannot be confirmed')
  expect(fixtures.request).not.toHaveBeenCalled()
  await dismissPendingFinancialCommand(actor)
  expect(await loadPendingFinancialCommand(actor)).toBeNull()
})
it('does not invent success when a financial operation has an invalid status', () => {
  expect(financialOperationSchema.safeParse({ ...operation, status: 'paid_promise' }).success).toBe(false)
})
