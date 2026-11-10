import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { createAdminClient } from '@/lib/admin'
import { ApiError } from '@/lib/api/http'
import { accountIsActive } from '@/lib/accounts/availability'
import { assertStaffPermission, currentStaffRole, hasStaffPermission } from '@/lib/auth/roles'
import { permissionsForRole, type StaffPermission } from '@/lib/auth/roles-policy'
import { revokeAccountPush } from '@/lib/auth/credential-state'
import { assertOwnerAdminReady } from '@/lib/database/readiness'
import { committedMutation, mutationCommand, recordMutation, transactionMutation } from '@/lib/database/mutations'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { paymentsEnabled } from '@/lib/payments/config'
import { paystackEnvironment } from '@/lib/payments/providers/paystack/client'
import { PUBLICATION_FEE_KOBO } from '@/lib/contracts/listing-payments'
import { adminCommandSchema, adminDashboardSchema, adminDocumentSchema, adminListingSchema, adminUsersSchema, type AdminCommand, type AdminCommandReceipt } from '@/lib/contracts/admin'
import { publicationFeeWaived } from '@/lib/listings/fee-policy'
import { claimStorageObjects, prepareListingStorage } from '@/lib/storage-claims/service'
import { moderateListingInTransaction, prepareDocumentApproval } from './service'

const userSelect = { id: true, revision: true, email: true, username: true, staff_role: true, closed_at: true, suspended_at: true, gallery_upload_allowed: true, gallery_permission_revision: true, createdAt: true } satisfies Prisma.UserSelect
const listingSelect = { id: true, revision: true, category: true, text_address: true, asset_metadata: true, listing_status: true, media_source: true, gallery_media: true, archived_at: true, createdAt: true,
  lister_id: true, document_path: true, video_path: true, fee_waived_at: true, fee_waived_by: true, fee_waiver_reason: true,
  lister: { select: { id: true, username: true } }, documentReview: { select: { status: true, reviewed_by: true, approved_path: true, approved_digest: true } },
  media: { select: { status: true } }, verification: { select: { spatial_status: true } },
  payments: { where: { kind: 'listing_fee', status: 'succeeded' }, select: { amount_kobo: true, currency: true, user_id: true, provider_environment: true } },
} satisfies Prisma.ListingSelect
type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>
type ListingRow = Prisma.ListingGetPayload<{ select: typeof listingSelect }>

function userView(user: UserRow) {
  return { id: user.id, revision: user.revision, email: user.email, username: user.username, role: user.staff_role ?? 'member', suspended: Boolean(user.suspended_at), closed: Boolean(user.closed_at),
    galleryAllowed: user.gallery_upload_allowed === true, galleryPermissionRevision: user.gallery_permission_revision ?? 0, createdAt: user.createdAt.toISOString() }
}
async function listingViews(rows: ListingRow[]) {
  const objects = rows.length ? await prisma.storageObject.findMany({ where: { bucket: 'compliance-docs', state: 'available', path: { in: rows.flatMap(row => row.document_path ? [row.document_path] : []) } }, select: { path: true, owner_id: true, digest: true } }) : []
  const environment = paymentsEnabled() ? paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim()) : null
  return rows.map(row => {
    const document = objects.find(object => object.path === row.document_path && object.owner_id === row.lister_id)
    const metadata = row.asset_metadata && typeof row.asset_metadata === 'object' && !Array.isArray(row.asset_metadata) ? row.asset_metadata : {}
    const photos = Array.isArray(row.gallery_media) ? row.gallery_media.filter(item => item && typeof item === 'object' && !Array.isArray(item) && item.kind === 'image').length : 0
    return adminListingSchema.parse({ id: row.id, revision: row.revision, category: row.category, title: typeof metadata.listingTitle === 'string' ? metadata.listingTitle.slice(0, 200) : `${row.category} listing`, address: row.text_address ?? '',
      status: row.listing_status, source: row.media_source === 'approved_gallery' ? 'approved_gallery' : 'recorded', archived: Boolean(row.archived_at), createdAt: row.createdAt.toISOString(), lister: row.lister,
      document: { present: Boolean(row.document_path), status: row.documentReview?.status ?? 'pending', approvalMatches: Boolean(document?.digest && row.documentReview?.status === 'approved' && row.documentReview.reviewed_by && row.documentReview.approved_path === row.document_path && row.documentReview.approved_digest === document.digest) },
      media: { hasVideo: Boolean(row.video_path), photoCount: photos, status: row.media?.status ?? null }, locationStatus: row.media_source === 'approved_gallery' ? 'exempt_gallery' : row.verification?.spatial_status ?? null,
      fee: { waived: publicationFeeWaived(row), paid: Boolean(environment && row.payments.some(payment => payment.amount_kobo === BigInt(PUBLICATION_FEE_KOBO) && payment.currency === 'NGN' && payment.user_id === row.lister_id && payment.provider_environment === environment)) } })
  })
}
async function requirePermission(actorId: string, permission: StaffPermission): Promise<void> {
  await assertOwnerAdminReady()
  if (!await hasStaffPermission(actorId, permission)) throw new ApiError(403, 'STAFF_REQUIRED', 'This administrative permission is required.')
}

export async function getAdminDashboard(actorId: string) {
  await requirePermission(actorId, 'staff:workspace')
  const role = await currentStaffRole(actorId)
  const permissions = permissionsForRole(role)
  const [listings, users, inspections, audit] = await Promise.all([
    permissions.includes('listing:review') ? prisma.listing.findMany({ where: { listing_status: { not: 'draft' } }, select: listingSelect, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 50 }) : [],
    permissions.includes('user:manage') ? prisma.user.findMany({ select: userSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 }) : [],
    permissions.includes('inspection:review') ? prisma.booking.findMany({ where: { manual_inspection_status: 'pending' }, select: { id: true, revision: true, listing_id: true, manual_inspection_status: true, manual_inspection_evidence: true, manual_inspection_requested_by: true, manual_inspection_requested_at: true, seeker_id: true, lister_id: true, starts_at: true }, orderBy: { manual_inspection_requested_at: 'asc' }, take: 50 }) : [],
    permissions.includes('operations:read') ? prisma.adminAudit.findMany({ select: { id: true, action: true, target_type: true, target_id: true, reason: true, actor_id: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 }) : [],
  ])
  return adminDashboardSchema.parse({ role, permissions, listings: await listingViews(listings), users: users.map(userView),
    inspections: inspections.filter(row => row.manual_inspection_requested_by && row.manual_inspection_requested_at).map(row => ({ id: row.id, revision: row.revision, listingId: row.listing_id, status: row.manual_inspection_status, evidence: row.manual_inspection_evidence ?? '', requestedBy: row.manual_inspection_requested_by, requestedAt: row.manual_inspection_requested_at!.toISOString(), renterId: row.seeker_id, hostId: row.lister_id, startsAt: row.starts_at.toISOString() })),
    audit: audit.map(row => ({ id: row.id, action: row.action, targetType: row.target_type, targetId: row.target_id, reason: row.reason, actorId: row.actor_id, createdAt: row.createdAt.toISOString() })) })
}
export async function searchAdminUsers(actorId: string, query: string) {
  await requirePermission(actorId, 'user:manage')
  const value = query.trim().toLowerCase()
  const rows = await prisma.user.findMany({ where: value ? { OR: [{ email: { startsWith: value } }, { username: { startsWith: value } }, ...(/^[a-f0-9-]{36}$/i.test(value) ? [{ id: value }] : [])] } : {}, select: userSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 })
  return adminUsersSchema.parse({ items: rows.map(userView) })
}
export async function getAdminListing(actorId: string, id: string) {
  await requirePermission(actorId, 'listing:review')
  const listing = await prisma.listing.findFirst({ where: { id, listing_status: { not: 'draft' } }, select: listingSelect })
  if (!listing) throw new ApiError(404, 'NOT_FOUND', 'This submitted listing is unavailable.')
  return (await listingViews([listing]))[0]
}
export async function getAdminDocument(actorId: string, id: string) {
  await requirePermission(actorId, 'listing:review')
  const listing = await prisma.listing.findFirst({ where: { id, listing_status: { not: 'draft' } }, select: { document_path: true, lister_id: true } })
  if (!listing?.document_path) throw new ApiError(404, 'NOT_FOUND', 'This document is unavailable.')
  const prepared = await prepareListingStorage(listing.lister_id, { documentPath: listing.document_path })
  const document = prepared[0]
  await withTransaction(async tx => {
    await assertStaffPermission(tx, actorId, 'listing:review')
    if (!await lockRecord(tx, 'listing', id)) throw new ApiError(404, 'NOT_FOUND', 'This document is unavailable.')
    const current = await tx.listing.findUnique({ where: { id }, select: { document_path: true, listing_status: true } })
    if (current?.document_path !== listing.document_path || current.listing_status === 'draft') throw new ApiError(409, 'DOCUMENT_CHANGED', 'The document changed. Refresh this listing.')
    await claimStorageObjects(tx, listing.lister_id, prepared)
    await tx.adminAudit.create({ data: { actor_id: actorId, action: 'view_listing_document', target_type: 'listing', target_id: id, reason: 'Opened the current private document for human review.', metadata: { path: document.path, digest: document.digest } } })
  })
  const signed = await createAdminClient().storage.from('compliance-docs').createSignedUrl(document.path, 60)
  if (!signed.data || signed.error) throw new ApiError(503, 'DOCUMENT_UNAVAILABLE', 'The private document could not be opened.')
  return adminDocumentSchema.parse({ url: signed.data.signedUrl, expiresAt: new Date(Date.now() + 60000).toISOString(), digest: document.digest })
}

export function adminCommandPermission(command: AdminCommand): StaffPermission {
  if (command.operation === 'transfer_ownership') return 'owner:transfer'
  if (command.operation === 'change_role') return 'staff:manage'
  if (command.operation === 'set_gallery_permission') return 'gallery:manage'
  if (command.operation === 'suspend_user' || command.operation === 'restore_user') return 'user:manage'
  if (command.operation === 'review_manual_inspection') return 'inspection:review'
  if (command.operation === 'waive_fee' || command.operation === 'revoke_fee_waiver') return 'listing:waive'
  return 'listing:review'
}
function changed(): never { throw new ApiError(409, 'ADMIN_TARGET_CHANGED', 'This record changed. Refresh its current state before creating another review.') }
async function userCommand(tx: Prisma.TransactionClient, actorId: string, data: AdminCommand): Promise<string> {
  const owner = await tx.user.findUnique({ where: { id: actorId }, select: { staff_role: true } })
  const selfGallery = data.operation === 'set_gallery_permission' && actorId === data.targetId && owner?.staff_role === 'owner' && data.ownerOverride && data.reason.length >= 30
  if (actorId === data.targetId && !selfGallery) throw new ApiError(403, 'INDEPENDENT_REVIEW_REQUIRED', 'Another administrator must change your own access. The owner may explicitly override only their own gallery privilege.')
  if (!await lockRecord(tx, 'user', data.targetId)) throw new ApiError(404, 'NOT_FOUND', 'This member is unavailable.')
  const target = await tx.user.findUniqueOrThrow({ where: { id: data.targetId }, select: userSelect })
  if (target.revision !== data.expectedRevision + (selfGallery ? 2 : 1)) changed()
  if (target.staff_role === 'owner' && !selfGallery) throw new ApiError(409, 'OWNER_PROTECTED', 'The owner account is protected. Use explicit ownership transfer instead.')
  if (target.closed_at) throw new ApiError(409, 'ACCOUNT_CLOSED', 'Closed accounts cannot receive new administrative privileges.')
  const previous = { role: target.staff_role, suspended: Boolean(target.suspended_at), galleryAllowed: target.gallery_upload_allowed === true, galleryPermissionRevision: target.gallery_permission_revision ?? 0 }
  if (data.operation === 'transfer_ownership') {
    if (!accountIsActive(target)) throw new ApiError(409, 'ACCOUNT_UNAVAILABLE', 'Choose an active account for ownership.')
    const owners = await tx.user.findMany({ where: { staff_role: 'owner' }, select: { id: true }, take: 2 })
    if (owners.length !== 1 || owners[0].id !== actorId) throw new ApiError(409, 'OWNERSHIP_CHANGED', 'Ownership changed. Sign in again and review the current owner.')
    await tx.user.update({ where: { id: actorId }, data: { staff_role: 'admin' } })
    await tx.user.update({ where: { id: target.id }, data: { staff_role: 'owner' } })
  } else if (data.operation === 'change_role') {
    if (!accountIsActive(target)) throw new ApiError(409, 'ACCOUNT_UNAVAILABLE', 'Restore access before assigning a staff role.')
    await tx.user.update({ where: { id: target.id }, data: { staff_role: data.role === 'member' ? null : data.role } })
  } else if (data.operation === 'set_gallery_permission') {
    if (data.allowed && !accountIsActive(target)) throw new ApiError(409, 'ACCOUNT_UNAVAILABLE', 'Restore access before approving gallery uploads.')
    if (previous.galleryAllowed !== data.allowed) await tx.user.update({ where: { id: target.id }, data: { gallery_upload_allowed: data.allowed, gallery_permission_revision: previous.galleryPermissionRevision + 1 } })
    if (!data.allowed) await tx.listing.updateMany({ where: { lister_id: target.id, media_source: 'approved_gallery', listing_status: 'active' }, data: { listing_status: 'suspended', revision: { increment: 1 } } })
  } else if (data.operation === 'suspend_user') {
    await tx.user.update({ where: { id: target.id }, data: { suspended_at: new Date(), suspension_reason: data.reason, gallery_upload_allowed: false, gallery_permission_revision: previous.galleryPermissionRevision + 1 } })
    await tx.authSession.updateMany({ where: { user_id: target.id, OR: [{ revoked_at: null }, { revoked_at: { isSet: false } }] }, data: { revoked_at: new Date() } })
    await revokeAccountPush(tx, target.id)
    await tx.listing.updateMany({ where: { lister_id: target.id, listing_status: 'active' }, data: { listing_status: 'suspended', revision: { increment: 1 } } })
  } else if (data.operation === 'restore_user') {
    await tx.user.update({ where: { id: target.id }, data: { suspended_at: null, suspension_reason: null } })
  } else throw new ApiError(400, 'INVALID_REQUEST', 'Choose a user access action.')
  const audit = await tx.adminAudit.create({ data: { actor_id: actorId, action: data.operation, target_type: 'user', target_id: target.id, reason: data.reason, metadata: { previous, ...(data.operation === 'set_gallery_permission' ? { allowed: data.allowed } : {}), ...(data.operation === 'change_role' ? { role: data.role } : {}), ownerOverride: selfGallery, moneyMoved: false } } })
  return audit.id
}
async function inspectionCommand(tx: Prisma.TransactionClient, actorId: string, data: Extract<AdminCommand, { operation: 'review_manual_inspection' }>): Promise<string> {
  if (!await lockRecord(tx, 'booking', data.targetId)) throw new ApiError(404, 'NOT_FOUND', 'This inspection is unavailable.')
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: data.targetId }, include: { listing: { select: { media_source: true } } } })
  if (booking.revision !== data.expectedRevision + 1) changed()
  if (actorId === booking.seeker_id || actorId === booking.lister_id) throw new ApiError(403, 'INDEPENDENT_REVIEW_REQUIRED', 'A nonparticipant must review inspection evidence, including when the owner is involved.')
  if (booking.kind !== 'inspection' || booking.status !== 'confirmed' || booking.listing.media_source !== 'approved_gallery' || booking.manual_inspection_status !== 'pending' || !booking.manual_inspection_evidence || !booking.manual_inspection_requested_by || ![booking.seeker_id, booking.lister_id].includes(booking.manual_inspection_requested_by)) throw new ApiError(409, 'INSPECTION_NOT_PENDING', 'Choose a pending gallery inspection evidence request.')
  await tx.booking.update({ where: { id: booking.id }, data: { manual_inspection_status: data.decision === 'approve' ? 'approved' : 'rejected', manual_inspection_reviewed_by: actorId, manual_inspection_reviewed_at: new Date(), manual_inspection_review_reason: data.reason, ...(data.decision === 'approve' ? { status: 'completed', handshake_code_hash: null } : {}) } })
  const audit = await tx.adminAudit.create({ data: { actor_id: actorId, action: `manual_inspection_${data.decision}`, target_type: 'booking', target_id: booking.id, reason: data.reason, metadata: { moneyMoved: false, spatialProof: false } } })
  await tx.notification.createMany({ data: [booking.seeker_id, booking.lister_id].map(user_id => ({ user_id, kind: 'inspection_review', title: 'Inspection evidence reviewed', body: `The manual inspection request was ${data.decision === 'approve' ? 'approved' : 'rejected'}. No payment was released by this decision.`, href: `/marketplace/bookings/${booking.id}` })) })
  return audit.id
}
export async function executeAdminCommand(actorId: string, input: unknown): Promise<AdminCommandReceipt> {
  const data = adminCommandSchema.parse(input)
  const permission = adminCommandPermission(data)
  await requirePermission(actorId, permission)
  const command = mutationCommand(actorId, 'admin_command', data.clientId, data)!
  const existing = await committedMutation(command)
  if (existing) return { clientId: data.clientId, auditId: existing, committed: true }
  const document = data.operation === 'approve_document' ? await prepareDocumentApproval(data.targetId) : undefined
  const run = async () => withTransaction(async tx => {
    await assertStaffPermission(tx, actorId, permission)
    const receipt = await transactionMutation(tx, command)
    if (receipt) return receipt
    let auditId: string
    if (data.operation === 'review_manual_inspection') auditId = await inspectionCommand(tx, actorId, data)
    else if (['change_role', 'set_gallery_permission', 'suspend_user', 'restore_user', 'transfer_ownership'].includes(data.operation)) auditId = await userCommand(tx, actorId, data)
    else auditId = await moderateListingInTransaction(tx, actorId, data.targetId, data.operation === 'suspend_listing' ? 'suspend' : data.operation as 'approve_document' | 'reject_document' | 'publish' | 'waive_fee' | 'revoke_fee_waiver', data.reason, { expectedRevision: data.expectedRevision, ownerOverride: 'ownerOverride' in data && data.ownerOverride, document })
    await recordMutation(tx, command, auditId)
    return auditId
  })
  let auditId: string
  try { auditId = await run() } catch (error) { const saved = await committedMutation(command); if (!saved) throw error; auditId = saved }
  return { clientId: data.clientId, auditId, committed: true }
}
export async function getAdminCommandReceipt(actorId: string, clientId: string): Promise<AdminCommandReceipt> {
  await assertOwnerAdminReady()
  const id = createHash('sha256').update(`${actorId}\0admin_command\0${clientId.toLowerCase()}`).digest('hex')
  const receipt = await prisma.mutationReceipt.findUnique({ where: { id }, select: { actor_id: true, scope: true, client_id: true, resource_id: true } })
  if (!receipt || receipt.actor_id !== actorId || receipt.scope !== 'admin_command' || receipt.client_id !== clientId.toLowerCase()) throw new ApiError(404, 'NOT_FOUND', 'No committed receipt was found for this original request.')
  return { clientId: clientId.toLowerCase(), auditId: receipt.resource_id, committed: true }
}
