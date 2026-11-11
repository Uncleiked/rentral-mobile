import { createHash } from 'node:crypto'
import type { Prisma, OrganizationApplication } from '@prisma/client'
import prisma from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { assertOrganizationsReady } from '@/lib/database/readiness'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { committedMutation, mutationCommand, recordMutation, transactionMutation } from '@/lib/database/mutations'
import { assertStaffPermission, hasStaffPermission } from '@/lib/auth/roles'
import { accountIsActive } from '@/lib/accounts/availability'
import { claimStorageObjects, prepareListingStorage, type PreparedStorageObject } from '@/lib/storage-claims/service'
import { signedStorageUrl } from '@/lib/local-storage/urls'
import { organizationSubmissionSchema, organizationReviewSchema, organizationViewSchema, type OrganizationView } from '@/lib/contracts/organizations'

function view(row: OrganizationApplication): OrganizationView {
  return organizationViewSchema.parse({ id: row.id, userId: row.user_id, revision: row.revision, legalName: row.legal_name,
    registrationType: row.registration_type, registrationNumber: row.registration_number, representativeName: row.representative_name,
    representativeRole: row.representative_role, documentKind: row.document_kind, supportingKind: row.supporting_kind,
    status: row.status, reviewReason: row.review_reason, submittedAt: row.submitted_at.toISOString(), reviewedAt: row.reviewed_at?.toISOString() ?? null })
}
async function requireOrganization(userId: string, tx?: Prisma.TransactionClient): Promise<void> {
  const input = { where: { id: userId }, select: { account_type: true, closed_at: true, suspended_at: true } } satisfies Prisma.UserFindUniqueArgs
  const user = tx ? await tx.user.findUnique(input) : await prisma.user.findUnique(input)
  if (!accountIsActive(user) || user?.account_type !== 'organization') throw new ApiError(403, 'ORGANIZATION_REQUIRED', 'Use your organization account to submit registration documents.')
}
export async function myOrganization(userId: string) {
  await assertOrganizationsReady()
  await requireOrganization(userId)
  const row = await prisma.organizationApplication.findUnique({ where: { user_id: userId } })
  return { application: row ? view(row) : null }
}
async function evidence(userId: string, path: string): Promise<PreparedStorageObject> {
  const object = (await prepareListingStorage(userId, { documentPath: path }))[0]
  if (!object || !['application/pdf', 'image/jpeg', 'image/png'].includes(object.contentType) || object.sizeBytes > 10 * 1024 * 1024) throw new ApiError(400, 'INVALID_ORGANIZATION_DOCUMENT', 'Choose a PDF, JPEG or PNG registration document no larger than 10 MB.')
  return object
}
export async function submitOrganization(userId: string, input: unknown) {
  await assertOrganizationsReady()
  const data = organizationSubmissionSchema.parse(input)
  await requireOrganization(userId)
  const command = mutationCommand(userId, 'organization_submit', data.clientId, data)!
  const receipt = await committedMutation(command)
  if (receipt) return { clientId: data.clientId, resourceId: receipt, committed: true as const }
  const document = await evidence(userId, data.documentPath)
  const support = data.supportingPath ? await evidence(userId, data.supportingPath) : null
  if (support?.id === document.id) throw new ApiError(400, 'DUPLICATE_DOCUMENT', 'Supporting evidence must be a different document.')
  const run = () => withTransaction(async tx => {
    if (!await lockRecord(tx, 'user', userId)) throw new ApiError(403, 'ACCOUNT_REQUIRED', 'Your account is unavailable.')
    await requireOrganization(userId, tx)
    const existingReceipt = await transactionMutation(tx, command)
    if (existingReceipt) return existingReceipt
    const existing = await tx.organizationApplication.findUnique({ where: { user_id: userId } })
    if (existing && (existing.revision !== data.expectedRevision || !['changes_requested', 'rejected'].includes(existing.status))) throw new ApiError(409, 'ORGANIZATION_CHANGED', 'Refresh your application before resubmitting. Pending and approved applications cannot be replaced.')
    if (!existing && data.expectedRevision !== undefined) throw new ApiError(409, 'ORGANIZATION_CHANGED', 'Refresh the organization application before submitting.')
    await claimStorageObjects(tx, userId, support ? [document, support] : [document])
    const evidencePaths = [...new Set([...(existing?.evidence_paths ?? []), document.path.toLowerCase(), ...(support ? [support.path.toLowerCase()] : [])])]
    const fields = { legal_name: data.legalName, registration_type: data.registrationType, registration_number: data.registrationNumber,
      representative_name: data.representativeName, representative_role: data.representativeRole, document_kind: data.documentKind,
      document_path: document.path, document_proof: { ...document }, supporting_kind: data.supportingKind ?? null,
      supporting_path: support?.path ?? null, supporting_proof: support ? { ...support } : null,
      evidence_paths: evidencePaths, status: 'pending', submitted_at: new Date(), reviewed_by: null, reviewed_at: null, review_reason: null, review_checklist: null }
    const row = existing ? await tx.organizationApplication.update({ where: { id: existing.id }, data: { ...fields, revision: { increment: 1 } } })
      : await tx.organizationApplication.create({ data: { user_id: userId, ...fields } })
    await tx.adminAudit.create({ data: { actor_id: userId, action: 'organization_submitted', target_type: 'organization', target_id: row.id,
      reason: 'Applicant declared authority and submitted registration evidence for independent review.', metadata: { documentPath: document.path, documentDigest: document.digest, supportingPath: support?.path ?? null, revision: row.revision } } })
    await recordMutation(tx, command, row.id)
    return row.id
  })
  let resourceId: string
  try { resourceId = await run() } catch (error) { const saved = await committedMutation(command); if (!saved) throw error; resourceId = saved }
  return { clientId: data.clientId, resourceId, committed: true as const }
}
async function staff(actorId: string): Promise<void> {
  await assertOrganizationsReady()
  if (!await hasStaffPermission(actorId, 'user:manage')) throw new ApiError(403, 'STAFF_REQUIRED', 'Organization review permission is required.')
}
export async function organizationQueue(actorId: string) {
  await staff(actorId)
  const rows = await prisma.organizationApplication.findMany({ orderBy: [{ submitted_at: 'desc' }, { id: 'desc' }], take: 50 })
  return { items: rows.map(view) }
}
export async function reviewOrganization(actorId: string, input: unknown) {
  await staff(actorId)
  const data = organizationReviewSchema.parse(input)
  const command = mutationCommand(actorId, 'organization_review', data.clientId, data)!
  const receipt = await committedMutation(command)
  if (receipt) return { clientId: data.clientId, resourceId: receipt, committed: true as const }
  const run = () => withTransaction(async tx => {
    await assertStaffPermission(tx, actorId, 'user:manage')
    const existingReceipt = await transactionMutation(tx, command)
    if (existingReceipt) return existingReceipt
    const current = await tx.organizationApplication.findUnique({ where: { id: data.targetId } })
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'The organization application is unavailable.')
    if (current.user_id === actorId) throw new ApiError(403, 'INDEPENDENT_REVIEW_REQUIRED', 'Another administrator must review your own organization.')
    if (!await lockRecord(tx, 'user', current.user_id)) throw new ApiError(404, 'NOT_FOUND', 'The applicant is unavailable.')
    await requireOrganization(current.user_id, tx)
    if (current.status !== 'pending' || current.revision !== data.expectedRevision) throw new ApiError(409, 'ORGANIZATION_CHANGED', 'This application changed. Refresh before deciding.')
    const document = await evidenceFromProof(tx, current.user_id, current.document_proof)
    const support = current.supporting_path ? await evidenceFromProof(tx, current.user_id, current.supporting_proof) : null
    await claimStorageObjects(tx, current.user_id, support ? [document, support] : [document])
    const status = data.decision === 'approve' ? 'approved' : data.decision === 'request_changes' ? 'changes_requested' : 'rejected'
    const changed = await tx.organizationApplication.updateMany({ where: { id: current.id, revision: data.expectedRevision, status: 'pending' },
      data: { status, revision: { increment: 1 }, reviewed_by: actorId, reviewed_at: new Date(), review_reason: data.reason, review_checklist: data.checklist } })
    if (changed.count !== 1) throw new ApiError(409, 'ORGANIZATION_CHANGED', 'This application changed. Refresh before deciding.')
    const audit = await tx.adminAudit.create({ data: { actor_id: actorId, action: 'organization_' + data.decision, target_type: 'organization', target_id: current.id,
      reason: data.reason, metadata: { revision: data.expectedRevision, status, documentPath: document.path, documentDigest: document.digest, checklist: data.checklist } } })
    await tx.notification.createMany({ data: [{ user_id: current.user_id, kind: 'organization_review', title: 'Organization review updated', body: data.reason, href: '/onboarding/organization' }] })
    await recordMutation(tx, command, audit.id)
    return audit.id
  })
  let resourceId: string
  try { resourceId = await run() } catch (error) { const saved = await committedMutation(command); if (!saved) throw error; resourceId = saved }
  return { clientId: data.clientId, resourceId, committed: true as const }
}
async function evidenceFromProof(_tx: Prisma.TransactionClient, userId: string, proof: Prisma.JsonValue | null): Promise<PreparedStorageObject> {
  // Local files are immutable after upload; the exact durable record is locked by
  // claimStorageObjects. Re-reading bytes belongs outside retry transactions.
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) || proof.bucket !== 'compliance-docs' || typeof proof.path !== 'string'
    || !proof.path.startsWith(userId + '/') || typeof proof.id !== 'string' || typeof proof.digest !== 'string' || !/^[a-f0-9]{64}$/.test(proof.digest)
    || typeof proof.sizeBytes !== 'number' || !Number.isSafeInteger(proof.sizeBytes) || proof.sizeBytes <= 0 || proof.sizeBytes > 10 * 1024 * 1024
    || typeof proof.contentType !== 'string' || !['application/pdf', 'image/jpeg', 'image/png'].includes(proof.contentType)) throw new ApiError(409, 'DOCUMENT_CHANGED', 'The registration evidence could not be confirmed.')
  return { id: proof.id, bucket: 'compliance-docs', path: proof.path, digest: proof.digest, sizeBytes: proof.sizeBytes, contentType: proof.contentType }
}
export async function organizationDocument(actorId: string, applicationId: string, supporting: boolean) {
  await staff(actorId)
  const current = await prisma.organizationApplication.findUnique({ where: { id: applicationId } })
  if (!current) throw new ApiError(404, 'NOT_FOUND', 'The document is unavailable.')
  const path = supporting ? current.supporting_path : current.document_path
  if (!path) throw new ApiError(404, 'NOT_FOUND', 'The document is unavailable.')
  const actual = await evidence(current.user_id, path)
  const expected = supporting ? current.supporting_proof : current.document_proof
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) || actual.digest !== expected.digest) throw new ApiError(409, 'DOCUMENT_CHANGED', 'The document changed. Refresh its application.')
  await withTransaction(async tx => {
    await assertStaffPermission(tx, actorId, 'user:manage')
    const row = await tx.organizationApplication.findUnique({ where: { id: applicationId } })
    if (row?.revision !== current.revision) throw new ApiError(409, 'ORGANIZATION_CHANGED', 'The application changed.')
    await claimStorageObjects(tx, current.user_id, [actual])
    await tx.adminAudit.create({ data: { actor_id: actorId, action: 'view_organization_document', target_type: 'organization', target_id: current.id,
      reason: 'Opened private registration evidence for human review.', metadata: { path, digest: actual.digest, revision: current.revision } } })
  })
  return { url: await signedStorageUrl('compliance-docs', path, 60), expiresAt: new Date(Date.now() + 60000).toISOString() }
}
export async function organizationReceipt(userId: string, scope: 'organization_submit' | 'organization_review', clientId: string) {
  await assertOrganizationsReady()
  const id = createHash('sha256').update(userId + '\0' + scope + '\0' + clientId.toLowerCase()).digest('hex')
  const row = await prisma.mutationReceipt.findUnique({ where: { id } })
  if (!row || row.actor_id !== userId || row.scope !== scope) throw new ApiError(404, 'NOT_FOUND', 'No committed receipt was found for this original request.')
  return { clientId: clientId.toLowerCase(), resourceId: row.resource_id, committed: true as const }
}
