import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ api: vi.fn(), preview: vi.fn() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error { constructor(message: string, public code: string, public status: number) { super(message) } } }))
vi.mock('../apps/mobile/src/lib/config', () => ({ config: { apiUrl: 'http://localhost:3000' } }))
vi.mock('../apps/mobile/src/lib/private-document', () => ({ previewPrivateDocument: mocks.preview }))
import { leaseEvidenceOwner, leaseRequestedInstant, leaseRequestInput, submitLeaseRequest, decideLeaseRequest, openLeaseEvidence } from '../apps/mobile/src/lib/lifecycle-api'
import { renewalArchiveSchema, terminationArchiveSchema } from '@/lib/contracts/lifecycle'
const actorId = '11111111-1111-4111-8111-111111111111', bookingId = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333'
const ownerId = '44444444-4444-4444-8444-444444444444'
const date = '2030-01-01T10:00:00.000Z'
const renewal = { id, bookingId, reference: 'bank-reference-123', recipientRoute: 'direct_landlord', status: 'pending_counterparty', role: 'host',
  originalEndsAt: date, requestedEndsAt: '2031-01-01T10:00:00.000Z', needsDetails: false, evidenceEndpoint: `/api/v1/renewals/${id}/evidence`, hostConfirmedAt: null,
  reviewedAt: null, decisionReason: null, createdAt: date, paymentProviderVerified: false, actions: { confirm: true } }
beforeEach(() => vi.resetAllMocks())
describe('native lease request contracts and recovery', () => {
  it('interprets a valid local date and rejects calendar rollover and invalid clocks', () => {
    const actual = new Date(leaseRequestedInstant('2030-01-02', '09:30'))
    expect([actual.getFullYear(), actual.getMonth(), actual.getDate(), actual.getHours(), actual.getMinutes()]).toEqual([2030, 0, 2, 9, 30])
    for (const [day, time] of [['2030-02-30', '09:00'], ['2030-01-02', '24:00'], ['2030-01-02', '09:60'], ['02/01/2030', '9:00']]) expect(() => leaseRequestedInstant(day, time)).toThrow()
  })
  it('validates supporting references and reasons before transport', async () => {
    expect(() => leaseRequestInput('renewal', { bookingId, reference: '123', recipientRoute: 'direct_landlord', requestedEndsAt: date, evidencePath: 'file.pdf' })).toThrow('reference')
    await expect(submitLeaseRequest('termination', { bookingId, requestedEndAt: date, evidencePath: 'file.pdf', reason: 'short' }, actorId)).rejects.toThrow('reason')
    expect(mocks.api).not.toHaveBeenCalled()
  })
  it('binds a strict create to the rendered actor and makes one explicit POST', async () => {
    mocks.api.mockResolvedValue({ id })
    const body = { bookingId, requestedEndAt: date, evidencePath: `${actorId}/folder/doc.pdf`, reason: 'The lease participants agreed on this proposed early end.' }
    expect(await submitLeaseRequest('termination', body, actorId)).toEqual({ id })
    expect(mocks.api).toHaveBeenCalledOnce(); expect(mocks.api).toHaveBeenCalledWith('/terminations', { method: 'POST', body, expectedUserId: actorId })
  })
  it('rejects malformed success and does not replay a failed create', async () => {
    mocks.api.mockResolvedValue({ success: true }); await expect(submitLeaseRequest('renewal', { bookingId, reference: 'bank-123', recipientRoute: 'direct_landlord', requestedEndsAt: date, evidencePath: 'file.pdf' }, actorId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(mocks.api).toHaveBeenCalledOnce()
  })
  it('requires the exact requested record when confirming a proposal', async () => {
    mocks.api.mockResolvedValue(renewal)
    expect((await decideLeaseRequest('renewal', id, { decision: 'accept', reason: 'I agree with this proposed lease extension.' }, actorId)).id).toBe(id)
    mocks.api.mockResolvedValue({ ...renewal, id: bookingId })
    await expect(decideLeaseRequest('renewal', id, { decision: 'reject', reason: 'I do not agree with the proposed dates.' }, actorId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('does not label an external renewal reference as provider-verified', () => {
    expect(renewalArchiveSchema.parse({ items: [renewal], nextCursor: null, limit: 20 }).items[0].paymentProviderVerified).toBe(false)
    expect(renewalArchiveSchema.safeParse({ items: [{ ...renewal, paymentProviderVerified: true }], nextCursor: null, limit: 20 }).success).toBe(false)
    expect(terminationArchiveSchema.safeParse({ items: [], nextCursor: null, limit: 51 }).success).toBe(false)
  })
  it('accepts participant-authorized evidence from the counterparty without accepting a foreign origin', () => {
    const url = `http://localhost:3000/api/v1/files/compliance-docs/${ownerId}/folder/evidence.pdf?token=short-lived-test`
    expect(leaseEvidenceOwner(url)).toEqual({ url, ownerId })
    for (const bad of [url.replace('localhost:3000', 'attacker.invalid'), url.replace('/compliance-docs/', '/profile-avatars/'), url.replace(ownerId, 'not-an-id')]) expect(() => leaseEvidenceOwner(bad)).toThrow()
  })
  it('requests a fresh scoped evidence link and never previews expired access', async () => {
    const url = `http://localhost:3000/api/v1/files/compliance-docs/${ownerId}/folder/evidence.pdf?token=short-lived-test`
    mocks.api.mockResolvedValue({ url, expiresAt: new Date(Date.now() + 300000).toISOString() })
    await openLeaseEvidence('renewal', id, actorId)
    expect(mocks.preview).toHaveBeenCalledWith(url, ownerId)
    expect(mocks.api).toHaveBeenCalledWith(`/renewals/${id}/evidence`, { expectedUserId: actorId })
    mocks.preview.mockClear(); mocks.api.mockResolvedValue({ url, expiresAt: '2020-01-01T00:00:00.000Z' })
    await expect(openLeaseEvidence('renewal', id, actorId)).rejects.toThrow('expired'); expect(mocks.preview).not.toHaveBeenCalled()
  })
})
