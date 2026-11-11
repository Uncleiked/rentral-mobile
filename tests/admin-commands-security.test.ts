import { beforeEach, describe, expect, it, vi } from 'vitest'
type Account = { id: string; revision: number; staff_role: string | null; closed_at: Date | null; suspended_at: Date | null; gallery_upload_allowed: boolean; gallery_permission_revision: number }
const state = vi.hoisted(() => ({ users: new Map<string, Account>(), receipts: new Map<string, Record<string, unknown>>(), audits: vi.fn(), listingUpdate: vi.fn(), userUpdate: vi.fn(), sessionUpdate: vi.fn(), bookingUpdate: vi.fn(), moderate: vi.fn(), transaction: vi.fn(), revokePush: vi.fn(), notify: vi.fn(), lostCommit: false, revokeAtLock: false, booking: {} as Record<string, unknown> }))
const owner = '11111111-1111-4111-8111-111111111111', member = '22222222-2222-4222-8222-222222222222', admin = '33333333-3333-4333-8333-333333333333', renter = '44444444-4444-4444-8444-444444444444', bookingId = '55555555-5555-4555-8555-555555555555', nonce = '66666666-6666-4666-8666-666666666666', auditId = '77777777-7777-4777-8777-777777777777'
const reason = 'Reviewed supporting records and explicitly approved this platform decision.'
const userDelegate = {
  findUnique: async ({ where }: { where: { id: string } }) => state.users.get(where.id) ?? null,
  findUniqueOrThrow: async ({ where }: { where: { id: string } }) => { const user = state.users.get(where.id); if (!user) throw new Error('Missing user'); return user },
  findMany: async ({ where }: { where: { staff_role: string } }) => [...state.users.values()].filter(user => user.staff_role === where.staff_role),
  update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { state.userUpdate({ where, data }); Object.assign(state.users.get(where.id)!, data); return state.users.get(where.id)! },
}
const receiptDelegate = { findUnique: async ({ where }: { where: { id: string } }) => state.receipts.get(where.id) ?? null,
  create: async ({ data }: { data: Record<string, unknown> & { id: string } }) => { state.receipts.set(data.id, data); return data } }
vi.mock('@/lib/db', () => ({ default: {
  user: { findUnique: (...args: Parameters<typeof userDelegate.findUnique>) => userDelegate.findUnique(...args) },
  mutationReceipt: { findUnique: (...args: Parameters<typeof receiptDelegate.findUnique>) => receiptDelegate.findUnique(...args) },
} }))
vi.mock('@/lib/database/readiness', () => ({ assertOwnerAdminReady: async () => undefined }))
vi.mock('@/lib/auth/credential-state', () => ({ revokeAccountPush: (...args: unknown[]) => state.revokePush(...args) }))
vi.mock('@/lib/operations/service', () => ({ moderateListingInTransaction: (...args: unknown[]) => state.moderate(...args), prepareDocumentApproval: async () => [] }))
vi.mock('@/lib/storage-claims/service', () => ({ claimStorageObjects: vi.fn(), prepareListingStorage: vi.fn() }))
vi.mock('@/lib/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/database/transactions', () => ({
  lockRecord: async (_tx: unknown, model: string, id: string) => {
    if (model === 'user') { const user = state.users.get(id); if (!user) return false; user.revision += 1; if (id === owner && state.revokeAtLock) user.staff_role = null }
    if (model === 'booking') state.booking.revision = Number(state.booking.revision) + 1
    return true
  },
  withTransaction: async (work: (tx: unknown) => Promise<unknown>) => {
    state.transaction()
    const result = await work({ user: userDelegate, mutationReceipt: receiptDelegate,
      listing: { updateMany: state.listingUpdate }, authSession: { updateMany: state.sessionUpdate },
      booking: { findUniqueOrThrow: async () => state.booking, update: state.bookingUpdate },
      adminAudit: { create: async (input: unknown) => { state.audits(input); return { id: auditId } } }, notification: { createMany: state.notify },
    })
    if (state.lostCommit) { state.lostCommit = false; throw new Error('Acknowledgment lost after commit') }
    return result
  },
}))
import { executeAdminCommand, getAdminCommandReceipt } from '@/lib/operations/admin-console'
import { adminCommandSchema, manualInspectionRequestSchema } from '@/lib/contracts/admin'
import { permissionsForRole } from '@/lib/auth/roles-policy'

function command(operation: string, extra: Record<string, unknown> = {}) { return { operation, clientId: nonce, targetId: member, expectedRevision: 0, reason, ...extra } }
beforeEach(() => {
  vi.clearAllMocks(); state.users.clear(); state.receipts.clear(); state.lostCommit = false; state.revokeAtLock = false
  for (const [id, role] of [[owner, 'owner'], [member, null], [admin, 'admin'], [renter, null]] as const) state.users.set(id, { id, revision: 0, staff_role: role, closed_at: null, suspended_at: null, gallery_upload_allowed: false, gallery_permission_revision: 0 })
  state.moderate.mockResolvedValue(auditId)
  state.booking = { id: bookingId, revision: 0, kind: 'inspection', status: 'confirmed', seeker_id: renter, lister_id: member, listing: { media_source: 'approved_gallery' }, manual_inspection_status: 'pending', manual_inspection_evidence: reason, manual_inspection_requested_by: renter }
})

describe('owner administration authorization and original-command receipts', () => {
  it('validates a closed command vocabulary and never accepts owner as an ordinary assigned role', () => {
    expect(adminCommandSchema.safeParse(command('change_role', { role: 'owner' })).success).toBe(false)
    expect(adminCommandSchema.safeParse(command('set_gallery_permission', { allowed: true, is_admin: true })).success).toBe(false)
    expect(manualInspectionRequestSchema.safeParse({ clientId: nonce, evidence: reason, latitude: 6.4, longitude: 3.4 }).success).toBe(false)
    expect(permissionsForRole('owner')).toContain('owner:transfer'); expect(permissionsForRole('admin')).not.toContain('owner:transfer')
  })
  it('rejects members before opening a privileged transaction', async () => {
    await expect(executeAdminCommand(member, command('set_gallery_permission', { targetId: admin, allowed: true }))).rejects.toMatchObject({ status: 403 })
    expect(state.transaction).not.toHaveBeenCalled(); expect(state.audits).not.toHaveBeenCalled()
  })
  it('rechecks a role revoked after the outer permission read', async () => {
    state.revokeAtLock = true
    await expect(executeAdminCommand(owner, command('set_gallery_permission', { allowed: true }))).rejects.toThrow('Staff access required')
    expect(state.userUpdate).not.toHaveBeenCalled(); expect(state.audits).not.toHaveBeenCalled()
  })
  it('rejects suspended staff even when their stored role is owner', async () => {
    state.users.get(owner)!.suspended_at = new Date()
    await expect(executeAdminCommand(owner, command('waive_fee'))).rejects.toMatchObject({ status: 403 })
    expect(state.transaction).not.toHaveBeenCalled()
  })
  it('records gallery revocation and removes only active gallery inventory', async () => {
    Object.assign(state.users.get(member)!, { gallery_upload_allowed: true, gallery_permission_revision: 4 })
    const result = await executeAdminCommand(owner, command('set_gallery_permission', { allowed: false }))
    expect(result).toEqual({ clientId: nonce, auditId, committed: true })
    expect(state.userUpdate).toHaveBeenCalledWith({ where: { id: member }, data: { gallery_upload_allowed: false, gallery_permission_revision: 5 } })
    expect(state.listingUpdate).toHaveBeenCalledWith({ where: { lister_id: member, media_source: 'approved_gallery', listing_status: 'active' }, data: { listing_status: 'suspended', revision: { increment: 1 } } })
    expect(state.audits).toHaveBeenCalledTimes(1); expect(state.receipts.size).toBe(1)
  })
  it('notifies a newly approved gallery uploader once, including original-command replay', async () => {
    const input = command('set_gallery_permission', { allowed: true })
    await executeAdminCommand(owner, input)
    await executeAdminCommand(owner, input)
    expect(state.users.get(member)!.gallery_upload_allowed).toBe(true)
    expect(state.notify).toHaveBeenCalledExactlyOnceWith({ data: [expect.objectContaining({ user_id: member, kind: 'gallery_permission', title: 'Gallery uploads approved', href: '/marketplace/listing/create?gallery=1' })] })
    expect(state.userUpdate).toHaveBeenCalledTimes(1)
    expect(state.audits).toHaveBeenCalledTimes(1)
  })
  it('does not create a new permission-change notification for an unchanged setting', async () => {
    await executeAdminCommand(owner, command('set_gallery_permission', { allowed: false }))
    expect(state.notify).not.toHaveBeenCalled()
    expect(state.audits).toHaveBeenCalledTimes(1)
  })
  it('rejects a stale target snapshot before altering its capability', async () => {
    state.users.get(member)!.revision = 3
    await expect(executeAdminCommand(owner, command('set_gallery_permission', { allowed: true }))).rejects.toMatchObject({ code: 'ADMIN_TARGET_CHANGED' })
    expect(state.userUpdate).not.toHaveBeenCalled()
  })
  it('allows owner self-gallery approval only with explicit detailed override', async () => {
    await expect(executeAdminCommand(owner, command('set_gallery_permission', { targetId: owner, allowed: true }))).rejects.toMatchObject({ status: 403 })
    state.users.get(owner)!.revision = 0
    await executeAdminCommand(owner, command('set_gallery_permission', { targetId: owner, allowed: true, ownerOverride: true }))
    expect(state.users.get(owner)!.gallery_upload_allowed).toBe(true)
    expect(state.audits).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ ownerOverride: true }) }) }))
  })
  it.each(['change_role', 'suspend_user', 'restore_user', 'set_gallery_permission'])('protects the owner against ordinary admin %s', async operation => {
    await expect(executeAdminCommand(admin, command(operation, { targetId: owner, ...(operation === 'change_role' ? { role: 'member' } : operation === 'set_gallery_permission' ? { allowed: false } : {}) }))).rejects.toMatchObject({ code: 'OWNER_PROTECTED' })
    expect(state.userUpdate).not.toHaveBeenCalled()
  })
  it('suspension revokes sessions and gallery privilege while preserving historical listings/bookings', async () => {
    await executeAdminCommand(owner, command('suspend_user'))
    expect(state.userUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ suspended_at: expect.any(Date), gallery_upload_allowed: false, gallery_permission_revision: 1 }) }))
    expect(state.sessionUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: member, OR: [{ revoked_at: null }, { revoked_at: { isSet: false } }] } }))
    expect(state.revokePush).toHaveBeenCalled(); expect(state.listingUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { lister_id: member, listing_status: 'active' } }))
    expect(state.bookingUpdate).not.toHaveBeenCalled()
  })
  it('restores access without republishing listings or inventing gallery approval', async () => {
    state.users.get(member)!.suspended_at = new Date()
    await executeAdminCommand(owner, command('restore_user'))
    expect(state.userUpdate).toHaveBeenCalledWith({ where: { id: member }, data: { suspended_at: null, suspension_reason: null } })
    expect(state.listingUpdate).not.toHaveBeenCalled(); expect(state.users.get(member)!.gallery_upload_allowed).toBe(false)
  })
  it('transfers sole ownership atomically and ordinary admins cannot invoke it', async () => {
    await expect(executeAdminCommand(admin, command('transfer_ownership'))).rejects.toMatchObject({ status: 403 })
    await executeAdminCommand(owner, command('transfer_ownership'))
    expect(state.users.get(owner)!.staff_role).toBe('admin'); expect(state.users.get(member)!.staff_role).toBe('owner')
    expect(state.audits).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'transfer_ownership', metadata: expect.objectContaining({ moneyMoved: false }) }) }))
  })
  it('does not transfer ownership when the source is no longer the unique current owner', async () => {
    state.users.get(admin)!.staff_role = 'owner'
    await expect(executeAdminCommand(owner, command('transfer_ownership'))).rejects.toMatchObject({ code: 'OWNERSHIP_CHANGED' })
    expect(state.userUpdate).not.toHaveBeenCalled()
  })
  it('returns the original receipt after a lost commit acknowledgment without replaying the operation', async () => {
    state.lostCommit = true
    const input = command('set_gallery_permission', { allowed: true })
    expect(await executeAdminCommand(owner, input)).toEqual({ clientId: nonce, auditId, committed: true })
    await executeAdminCommand(owner, input)
    expect(state.transaction).toHaveBeenCalledTimes(1); expect(state.userUpdate).toHaveBeenCalledTimes(1); expect(state.audits).toHaveBeenCalledTimes(1)
    expect(await getAdminCommandReceipt(owner, nonce)).toEqual({ clientId: nonce, auditId, committed: true })
    await expect(getAdminCommandReceipt(admin, nonce)).rejects.toMatchObject({ status: 404 })
  })
  it('rejects changed instructions under an existing command nonce', async () => {
    await executeAdminCommand(owner, command('set_gallery_permission', { allowed: true }))
    await expect(executeAdminCommand(owner, command('set_gallery_permission', { allowed: false }))).rejects.toMatchObject({ code: 'INVALID_RETRY' })
    expect(state.userUpdate).toHaveBeenCalledTimes(1)
  })
  it('keeps receipt recovery available to an active actor after a role was removed', async () => {
    await executeAdminCommand(admin, command('set_gallery_permission', { allowed: true }))
    state.users.get(admin)!.staff_role = null
    expect(await getAdminCommandReceipt(admin, nonce)).toEqual({ clientId: nonce, auditId, committed: true })
    await expect(executeAdminCommand(admin, command('set_gallery_permission', { allowed: true }))).rejects.toMatchObject({ status: 403 })
  })
})

describe('independent manual gallery inspection review', () => {
  it('approves evidence without forging participant GPS timestamps or releasing money', async () => {
    await executeAdminCommand(owner, command('review_manual_inspection', { targetId: bookingId, decision: 'approve' }))
    expect(state.bookingUpdate).toHaveBeenCalledWith({ where: { id: bookingId }, data: { manual_inspection_status: 'approved', manual_inspection_reviewed_by: owner, manual_inspection_reviewed_at: expect.any(Date), manual_inspection_review_reason: reason, status: 'completed', handshake_code_hash: null } })
    expect(state.audits).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: { moneyMoved: false, spatialProof: false } }) }))
    expect(state.listingUpdate).not.toHaveBeenCalled(); expect(state.userUpdate).not.toHaveBeenCalled()
  })
  it('rejects evidence without cancelling the reservation or changing settlement', async () => {
    await executeAdminCommand(admin, command('review_manual_inspection', { targetId: bookingId, decision: 'reject' }))
    expect(state.bookingUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { manual_inspection_status: 'rejected', manual_inspection_reviewed_by: admin, manual_inspection_reviewed_at: expect.any(Date), manual_inspection_review_reason: reason } }))
  })
  it('requires a nonparticipant reviewer even for the owner', async () => {
    state.booking.seeker_id = owner
    await expect(executeAdminCommand(owner, command('review_manual_inspection', { targetId: bookingId, decision: 'approve' }))).rejects.toMatchObject({ code: 'INDEPENDENT_REVIEW_REQUIRED' })
    expect(state.bookingUpdate).not.toHaveBeenCalled()
  })
  it.each([{ listing: { media_source: 'recorded' } }, { status: 'disputed' }, { manual_inspection_status: 'approved' }, { manual_inspection_requested_by: owner }])('fails closed on ineligible inspection state %j', async override => {
    Object.assign(state.booking, override)
    await expect(executeAdminCommand(owner, command('review_manual_inspection', { targetId: bookingId, decision: 'approve' }))).rejects.toMatchObject({ code: 'INSPECTION_NOT_PENDING' })
    expect(state.bookingUpdate).not.toHaveBeenCalled()
  })
})
