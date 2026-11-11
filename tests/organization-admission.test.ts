import { beforeEach, describe, expect, it, vi } from 'vitest'

const owner = '11111111-1111-4111-8111-111111111111', staff = '22222222-2222-4222-8222-222222222222'
const id = '33333333-3333-4333-8333-333333333333', clientId = '44444444-4444-4444-8444-444444444444', auditId = '55555555-5555-4555-8555-555555555555'
const state = vi.hoisted(() => ({ ready: vi.fn(), user: vi.fn(), application: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), claim: vi.fn(),
  prepare: vi.fn(), audit: vi.fn(), notify: vi.fn(), allowed: vi.fn(), staffCheck: vi.fn(), lock: vi.fn(), sign: vi.fn(), transaction: vi.fn(),
  receipts: new Map<string, Record<string, unknown>>() }))
const receipt = { findUnique: async ({ where }: { where: { id: string } }) => state.receipts.get(where.id) ?? null,
  create: async ({ data }: { data: Record<string, unknown> & { id: string } }) => { state.receipts.set(data.id, data); return data } }
const tx = { user: { findUnique: state.user }, organizationApplication: { findUnique: state.application, create: state.create, update: state.update, updateMany: state.updateMany },
  adminAudit: { create: state.audit }, notification: { createMany: state.notify }, mutationReceipt: receipt }
vi.mock('@/lib/db', () => ({ default: { user: { findUnique: state.user }, organizationApplication: { findUnique: state.application }, mutationReceipt: { findUnique: (...args: Parameters<typeof receipt.findUnique>) => receipt.findUnique(...args) } } }))
vi.mock('@/lib/database/readiness', () => ({ assertOrganizationsReady: state.ready }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: state.lock, withTransaction: async (work: (value: unknown) => Promise<unknown>) => { state.transaction(); return work(tx) } }))
vi.mock('@/lib/auth/roles', () => ({ hasStaffPermission: state.allowed, assertStaffPermission: state.staffCheck }))
vi.mock('@/lib/storage-claims/service', () => ({ claimStorageObjects: state.claim, prepareListingStorage: state.prepare }))
vi.mock('@/lib/local-storage/urls', () => ({ signedStorageUrl: state.sign }))

import { myOrganization, reviewOrganization, submitOrganization } from '@/lib/organizations/service'
import { organizationSubmissionSchema, organizationReviewSchema } from '@/lib/contracts/organizations'

const proof = { id: 'a'.repeat(64), bucket: 'compliance-docs', path: owner + '/folder/registration.pdf', digest: 'b'.repeat(64), sizeBytes: 2500, contentType: 'application/pdf' }
const now = new Date('2026-11-11T12:00:00Z')
function application(status = 'pending', revision = 0) {
  return { id, user_id: owner, revision, legal_name: 'Synthetic organization', registration_type: 'company', registration_number: 'RC-SYNTHETIC',
    representative_name: 'Synthetic Representative', representative_role: 'Director', document_kind: 'cac_certificate', document_path: proof.path, document_proof: proof,
    supporting_kind: null, supporting_path: null, supporting_proof: null, evidence_paths: [proof.path.toLowerCase()], status, reviewed_by: null, reviewed_at: null,
    review_reason: null, review_checklist: null, submitted_at: now, createdAt: now, updatedAt: now }
}
const submission = { clientId, legalName: 'Synthetic organization', registrationType: 'company', registrationNumber: 'RC-SYNTHETIC', representativeName: 'Synthetic Representative',
  representativeRole: 'Director', documentKind: 'cac_certificate', documentPath: proof.path, declaration: true }
const review = { clientId, targetId: id, expectedRevision: 0, decision: 'approve', reason: 'Registration and representative authority independently reviewed.',
  checklist: { registrationMatches: true, registerChecked: true, authorityConfirmed: true } }
beforeEach(() => {
  vi.resetAllMocks(); state.receipts.clear()
  state.ready.mockResolvedValue(undefined); state.user.mockResolvedValue({ account_type: 'organization', closed_at: null, suspended_at: null })
  state.application.mockResolvedValue(null); state.create.mockResolvedValue(application()); state.update.mockResolvedValue(application('pending', 3))
  state.updateMany.mockResolvedValue({ count: 1 }); state.prepare.mockResolvedValue([proof]); state.claim.mockResolvedValue(undefined)
  state.allowed.mockResolvedValue(true); state.staffCheck.mockResolvedValue(undefined); state.lock.mockResolvedValue(true); state.audit.mockResolvedValue({ id: auditId })
})
describe('organization registration and independent approval', () => {
  it('requires declared registration evidence and never accepts client-owned approval or identity flags', () => {
    expect(organizationSubmissionSchema.safeParse(submission).success).toBe(true)
    for (const patch of [{ declaration: false }, { documentKind: 'authority_letter' }, { kyc_verified: true }, { status: 'approved' }, { supportingKind: 'office_address' }]) {
      expect(organizationSubmissionSchema.safeParse({ ...submission, ...patch }).success).toBe(false)
    }
  })
  it('keeps readiness separate and refuses new organization work before files or transactions are touched', async () => {
    state.ready.mockRejectedValue(new Error('DATABASE_SETUP_REQUIRED'))
    await expect(submitOrganization(owner, submission)).rejects.toThrow('DATABASE_SETUP_REQUIRED')
    expect(state.prepare).not.toHaveBeenCalled(); expect(state.transaction).not.toHaveBeenCalled()
  })
  it.each(['individual', null, 'unexpected'])('cannot create an organization application from account type %s', async type => {
    state.user.mockResolvedValue({ account_type: type, closed_at: null, suspended_at: null })
    await expect(submitOrganization(owner, submission)).rejects.toMatchObject({ code: 'ORGANIZATION_REQUIRED' })
    expect(state.prepare).not.toHaveBeenCalled(); expect(state.transaction).not.toHaveBeenCalled()
  })
  it('claims exact owned evidence and stores only a pending application, audit and original receipt', async () => {
    const result = await submitOrganization(owner, submission)
    expect(result).toEqual({ clientId, resourceId: id, committed: true })
    expect(state.claim).toHaveBeenCalledExactlyOnceWith(tx, owner, [proof])
    expect(state.create).toHaveBeenCalledWith({ data: expect.objectContaining({ user_id: owner, status: 'pending', document_proof: proof, evidence_paths: [proof.path.toLowerCase()] }) })
    expect(state.user).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.anything() }))
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'organization_submitted' }) }))
    await submitOrganization(owner, submission)
    expect(state.create).toHaveBeenCalledTimes(1); expect(state.claim).toHaveBeenCalledTimes(1)
  })
  it.each(['pending', 'approved'])('never replaces an application currently %s', async status => {
    state.application.mockResolvedValue(application(status))
    await expect(submitOrganization(owner, { ...submission, expectedRevision: 0 })).rejects.toMatchObject({ code: 'ORGANIZATION_CHANGED' })
    expect(state.claim).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled()
  })
  it('retains previous evidence references when corrected registration is resubmitted', async () => {
    const previous = application('changes_requested', 2); previous.evidence_paths.push(owner + '/old/registration.pdf')
    state.application.mockResolvedValue(previous)
    await submitOrganization(owner, { ...submission, expectedRevision: 2 })
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'pending', revision: { increment: 1 }, evidence_paths: expect.arrayContaining(previous.evidence_paths) }) }))
  })
  it('rejects oversized or unsupported registration files before transaction entry', async () => {
    for (const patch of [{ sizeBytes: 10 * 1024 * 1024 + 1 }, { contentType: 'video/mp4' }]) {
      state.prepare.mockResolvedValue([{ ...proof, ...patch }])
      await expect(submitOrganization(owner, submission)).rejects.toMatchObject({ code: 'INVALID_ORGANIZATION_DOCUMENT' })
    }
    expect(state.transaction).not.toHaveBeenCalled()
  })
  it('does not send raw paths, file digests or private proof metadata in application DTOs', async () => {
    state.application.mockResolvedValue(application())
    const result = await myOrganization(owner)
    expect(result.application).toMatchObject({ id, legalName: 'Synthetic organization', status: 'pending' })
    expect(JSON.stringify(result)).not.toContain(proof.path)
    expect(JSON.stringify(result)).not.toMatch(/document_proof|digest|evidence_paths/)
  })
  it('requires every approval attestation and a reason before review mutation', async () => {
    expect(organizationReviewSchema.safeParse(review).success).toBe(true)
    await expect(reviewOrganization(staff, { ...review, checklist: { ...review.checklist, registerChecked: false } })).rejects.toThrow()
    expect(state.transaction).not.toHaveBeenCalled()
  })
  it('denies unassigned staff and requires current permission again inside the transaction', async () => {
    state.allowed.mockResolvedValue(false)
    await expect(reviewOrganization(staff, review)).rejects.toMatchObject({ code: 'STAFF_REQUIRED' })
    expect(state.transaction).not.toHaveBeenCalled()
    state.allowed.mockResolvedValue(true); state.staffCheck.mockRejectedValue(new Error('Staff access required.'))
    await expect(reviewOrganization(staff, review)).rejects.toThrow('Staff access required.')
    expect(state.updateMany).not.toHaveBeenCalled()
  })
  it('does not allow an owner to approve their own organization', async () => {
    state.application.mockResolvedValue(application())
    await expect(reviewOrganization(owner, review)).rejects.toMatchObject({ code: 'INDEPENDENT_REVIEW_REQUIRED' })
    expect(state.claim).not.toHaveBeenCalled(); expect(state.updateMany).not.toHaveBeenCalled()
  })
  it.each([{ revision: 1 }, { status: 'approved' }, { status: 'rejected' }])('rejects a stale or completed application %j', async patch => {
    state.application.mockResolvedValue({ ...application(), ...patch })
    await expect(reviewOrganization(staff, review)).rejects.toMatchObject({ code: 'ORGANIZATION_CHANGED' })
    expect(state.updateMany).not.toHaveBeenCalled()
  })
  it('records one independent approval and notification, even if the original command is replayed', async () => {
    state.application.mockResolvedValue(application())
    expect(await reviewOrganization(staff, review)).toEqual({ clientId, resourceId: auditId, committed: true })
    await reviewOrganization(staff, review)
    expect(state.staffCheck).toHaveBeenCalledExactlyOnceWith(tx, staff, 'user:manage')
    expect(state.updateMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: { id, revision: 0, status: 'pending' }, data: expect.objectContaining({ status: 'approved', reviewed_by: staff, revision: { increment: 1 } }) }))
    expect(state.audit).toHaveBeenCalledTimes(1); expect(state.notify).toHaveBeenCalledTimes(1)
    expect(state.claim).toHaveBeenCalledExactlyOnceWith(tx, owner, [proof])
  })
  it('refuses changed instructions under the same original request identifier', async () => {
    state.application.mockResolvedValue(application())
    await reviewOrganization(staff, review)
    await expect(reviewOrganization(staff, { ...review, decision: 'reject' })).rejects.toMatchObject({ code: 'INVALID_RETRY' })
    expect(state.updateMany).toHaveBeenCalledTimes(1)
  })
})
