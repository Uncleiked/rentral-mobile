import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), ready: vi.fn(), renewal: vi.fn(), renewals: vi.fn(), termination: vi.fn(), terminations: vi.fn(),
  requestRenewal: vi.fn(), requestTermination: vi.fn(), confirmRenewal: vi.fn(), confirmTermination: vi.fn(), staff: vi.fn(), sign: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/database/readiness', () => ({ assertLifecycleReady: mocks.ready, MongoReadinessError: class extends Error {} }))
vi.mock('@/lib/db', () => ({ default: { renewal: { findFirst: mocks.renewal, findMany: mocks.renewals, findUnique: mocks.renewal },
  leaseTermination: { findFirst: mocks.termination, findMany: mocks.terminations, findUnique: mocks.termination } } }))
vi.mock('@/lib/lifecycle/service', () => ({ requestRenewal: mocks.requestRenewal, requestTermination: mocks.requestTermination, confirmRenewal: mocks.confirmRenewal, confirmTermination: mocks.confirmTermination }))
vi.mock('@/lib/auth/roles', () => ({ hasStaffPermission: mocks.staff }))
vi.mock('@/lib/local-storage/adapter', () => ({ createStorageAdmin: () => ({ storage: { from: () => ({ createSignedUrl: mocks.sign }) } }) }))
import { ApiError } from '@/lib/api/http'
import { GET as renewals, POST as createRenewal } from '@/app/api/v1/renewals/route'
import { GET as renewal, PATCH as confirmRenewal } from '@/app/api/v1/renewals/[id]/route'
import { GET as termination, PATCH as confirmTermination } from '@/app/api/v1/terminations/[id]/route'
import { POST as createTermination } from '@/app/api/v1/terminations/route'
import { GET as renewalEvidence } from '@/app/api/v1/renewals/[id]/evidence/route'

const renter = '55bfc098-ff33-4fdd-b7ae-68d810a74050', host = '52db23e2-fb48-4cf7-9dfc-06e3c96c301f'
const id = 'c7af3d50-a016-475d-8e51-23fd04989436', bookingId = '2ca8c61b-ffac-4200-bcba-a7387d0324ac'
const at = new Date('2030-01-01T10:00:00Z'), end = new Date('2030-02-01T10:00:00Z'), nextEnd = new Date('2031-02-01T10:00:00Z')
const context = { params: Promise.resolve({ id }) }
const evidencePath = `${renter}/folder/receipt.pdf`
function request(path: string, method = 'GET', body?: unknown): Request {
  return new Request(`http://localhost:3000/api/v1${path}`, { method, headers: { authorization: 'Bearer test-session', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
function renewalRow() { return { id, booking_id: bookingId, reference: 'External-reference', recipient_route: 'direct_landlord', status: 'pending_counterparty',
  original_ends_at: end, requested_ends_at: nextEnd, evidence_path: evidencePath, host_confirmed_at: null, host_confirmed_by: null,
  reviewed_at: null, decision_reason: null, createdAt: at, booking: { seeker_id: renter, lister_id: host } } }
beforeEach(() => {
  vi.resetAllMocks(); mocks.identity.mockResolvedValue({ userId: renter, mode: 'bearer' }); mocks.ready.mockResolvedValue(undefined)
  mocks.renewal.mockResolvedValue(renewalRow()); mocks.renewals.mockResolvedValue([renewalRow()])
  mocks.termination.mockResolvedValue({ id, booking_id: bookingId, requested_by: renter, reason: 'A mutually agreed early lease end request.', status: 'pending_counterparty',
    original_ends_at: end, requested_end_at: new Date('2030-01-15T10:00:00Z'), evidence_path: evidencePath, counterparty_decision: 'pending',
    counterparty_decided_at: null, counterparty_reason: null, reviewed_at: null, decision_reason: null, released_at: null, createdAt: at, booking: { seeker_id: renter, lister_id: host } })
  mocks.requestRenewal.mockResolvedValue(id); mocks.requestTermination.mockResolvedValue(id)
  mocks.confirmRenewal.mockResolvedValue(undefined); mocks.confirmTermination.mockResolvedValue(undefined)
  mocks.staff.mockResolvedValue(false); mocks.sign.mockResolvedValue({ data: { signedUrl: 'http://localhost:3000/api/v1/files/compliance-docs/owned/receipt.pdf?token=fixture' }, error: null })
})

it('requires authentication before all lease reads/creates/confirmation/evidence signing', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
  for (const response of await Promise.all([renewals(request('/renewals')), renewal(request(`/renewals/${id}`), context),
    createRenewal(request('/renewals', 'POST', {})), createTermination(request('/terminations', 'POST', {})),
    confirmRenewal(request(`/renewals/${id}`, 'PATCH', {}), context), renewalEvidence(request(`/renewals/${id}/evidence`), context)])) expect(response.status).toBe(401)
  for (const call of [mocks.renewal, mocks.renewals, mocks.requestRenewal, mocks.requestTermination, mocks.sign]) expect(call).not.toHaveBeenCalled()
})
it('archives only participant requests and exposes the approved extension separately from provider payment', async () => {
  const response = await renewals(request(`/renewals?bookingId=${bookingId}&limit=5`))
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.data.items[0]).toMatchObject({ bookingId, originalEndsAt: end.toISOString(), requestedEndsAt: nextEnd.toISOString(), paymentProviderVerified: false,
    evidenceEndpoint: `/api/v1/renewals/${id}/evidence`, needsDetails: false })
  expect(JSON.stringify(body)).not.toContain(evidencePath)
  expect(JSON.stringify(body)).not.toContain(renter)
  expect(mocks.renewals).toHaveBeenCalledWith(expect.objectContaining({ where: { booking_id: bookingId, booking: { OR: [{ seeker_id: renter }, { lister_id: renter }] } }, take: 6 }))
})
it('keeps legacy rows visible as incomplete and unapprovable rather than inventing dates/evidence', async () => {
  mocks.renewal.mockResolvedValue({ ...renewalRow(), original_ends_at: null, requested_ends_at: null, evidence_path: null, status: 'pending_review' })
  expect((await (await renewal(request(`/renewals/${id}`), context)).json()).data).toMatchObject({ needsDetails: true, originalEndsAt: null, requestedEndsAt: null, evidenceEndpoint: null, actions: { confirm: false } })
})
it('rejects actor/money/staff fields before create and forwards only the authenticated actor to domain services', async () => {
  const input = { bookingId, reference: 'External-reference', recipientRoute: 'direct_landlord', requestedEndsAt: nextEnd.toISOString(), evidencePath }
  expect((await createRenewal(request('/renewals', 'POST', { ...input, approvedBy: host }))).status).toBe(400)
  expect(mocks.requestRenewal).not.toHaveBeenCalled()
  expect((await createRenewal(request('/renewals', 'POST', input))).status).toBe(201)
  expect(mocks.requestRenewal).toHaveBeenCalledExactlyOnceWith(renter, input)
  expect(mocks.identity).toHaveBeenLastCalledWith(expect.any(Request), { platform: true, mutation: true, verified: true })
})
it('reads current scope before counterparty mutations and hides foreign requests', async () => {
  mocks.identity.mockResolvedValue({ userId: host, mode: 'bearer' })
  const decision = { decision: 'accept', reason: 'I agree to these proposed lease dates.' }
  expect((await confirmRenewal(request(`/renewals/${id}`, 'PATCH', decision), context)).status).toBe(200)
  expect(mocks.confirmRenewal).toHaveBeenCalledExactlyOnceWith(host, id, decision)
  expect((await confirmTermination(request(`/terminations/${id}`, 'PATCH', decision), context)).status).toBe(200)
  expect(mocks.confirmTermination).toHaveBeenCalledExactlyOnceWith(host, id, decision)
  mocks.termination.mockResolvedValue(null)
  expect((await termination(request(`/terminations/${id}`), context)).status).toBe(404)
})
it('signs supporting evidence only after participant/current-staff scope and never returns an app access token', async () => {
  expect((await renewalEvidence(request(`/renewals/${id}/evidence`), context)).status).toBe(200)
  expect(mocks.sign).toHaveBeenCalledExactlyOnceWith(evidencePath, 300)
  mocks.sign.mockClear(); mocks.identity.mockResolvedValue({ userId: 'outsider', mode: 'bearer' })
  expect((await renewalEvidence(request(`/renewals/${id}/evidence`), context)).status).toBe(404)
  expect(mocks.sign).not.toHaveBeenCalled()
  mocks.staff.mockResolvedValue(true)
  expect((await renewalEvidence(request(`/renewals/${id}/evidence`), context)).status).toBe(200)
  expect(mocks.staff).toHaveBeenCalledWith('outsider', 'renewal:review')
})
it('keeps ambiguous creates unconfirmed and never retries or marks a payment verified', async () => {
  mocks.requestTermination.mockRejectedValue(new Error('Acknowledgement lost'))
  const response = await createTermination(request('/terminations', 'POST', { bookingId, requestedEndAt: '2030-01-15T10:00:00Z', reason: 'A mutually agreed early lease end request.', evidencePath }))
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: 'LEASE_UPDATE_UNCONFIRMED' })
  expect(mocks.requestTermination).toHaveBeenCalledTimes(1)
})
