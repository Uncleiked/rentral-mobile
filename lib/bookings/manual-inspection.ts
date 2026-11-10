import prisma from '@/lib/db'
import { createHash } from 'node:crypto'
import { ApiError } from '@/lib/api/http'
import { manualInspectionRequestSchema, manualInspectionSchema } from '@/lib/contracts/admin'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { assertOwnerAdminReady } from '@/lib/database/readiness'
import { committedMutation, mutationCommand, recordMutation, transactionMutation } from '@/lib/database/mutations'
import { lockRecord, withTransaction } from '@/lib/database/transactions'

export async function getManualInspection(userId: string, bookingId: string, clientId?: string) {
  await assertOwnerAdminReady()
  if (clientId) {
    const id = createHash('sha256').update(`${userId}\0manual_inspection_request\0${clientId.toLowerCase()}`).digest('hex')
    const receipt = await prisma.mutationReceipt.findUnique({ where: { id }, select: { actor_id: true, scope: true, client_id: true, resource_id: true } })
    if (!receipt || receipt.actor_id !== userId || receipt.scope !== 'manual_inspection_request' || receipt.client_id !== clientId.toLowerCase() || receipt.resource_id !== bookingId) throw new ApiError(404, 'NOT_FOUND', 'No committed receipt was found for this original inspection request.')
  }
  const row = await prisma.booking.findFirst({ where: { id: bookingId, OR: [{ seeker_id: userId }, { lister_id: userId }] }, select: {
    kind: true, status: true, starts_at: true, manual_inspection_status: true, manual_inspection_evidence: true, manual_inspection_requested_at: true, manual_inspection_reviewed_at: true, manual_inspection_review_reason: true,
    listing: { select: { media_source: true } },
  } })
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'This inspection is unavailable.')
  const time = Date.now() - row.starts_at.getTime()
  return manualInspectionSchema.parse({ bookingId, eligible: row.listing.media_source === 'approved_gallery' && row.kind === 'inspection' && row.status === 'confirmed' && time >= -4 * 3600000 && time <= 7 * 86400000 && row.manual_inspection_status !== 'pending',
    status: row.manual_inspection_status ?? null, evidence: row.manual_inspection_evidence ?? null, requestedAt: row.manual_inspection_requested_at?.toISOString() ?? null, reviewedAt: row.manual_inspection_reviewed_at?.toISOString() ?? null, reviewReason: row.manual_inspection_review_reason ?? null })
}
export async function requestManualInspection(userId: string, bookingId: string, input: unknown) {
  await assertOwnerAdminReady()
  const data = manualInspectionRequestSchema.parse(input)
  const command = mutationCommand(userId, 'manual_inspection_request', data.clientId, { ...data, bookingId })!
  const existing = await committedMutation(command)
  if (existing) return getManualInspection(userId, existing)
  try {
    await withTransaction(async tx => {
      const receipt = await transactionMutation(tx, command)
      if (receipt) return
      const target = await tx.booking.findFirst({ where: { id: bookingId, OR: [{ seeker_id: userId }, { lister_id: userId }] }, select: { listing_id: true } })
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'This inspection is unavailable.')
      await lockRecord(tx, 'listing', target.listing_id)
      if (!await lockRecord(tx, 'booking', bookingId)) throw new ApiError(404, 'NOT_FOUND', 'This inspection is unavailable.')
      const booking = await tx.booking.findFirst({ where: { id: bookingId, OR: [{ seeker_id: userId }, { lister_id: userId }] }, include: { listing: { select: { media_source: true } } } })
      if (!booking) throw new ApiError(404, 'NOT_FOUND', 'This inspection is unavailable.')
      await assertActiveAccounts(tx, [booking.seeker_id, booking.lister_id])
      const time = Date.now() - booking.starts_at.getTime()
      if (booking.kind !== 'inspection' || booking.status !== 'confirmed' || booking.listing.media_source !== 'approved_gallery' || time < -4 * 3600000 || time > 7 * 86400000) throw new ApiError(409, 'MANUAL_INSPECTION_UNAVAILABLE', 'Manual evidence review is available for a confirmed gallery inspection from four hours before its time until seven days afterward.')
      if (booking.manual_inspection_status === 'pending') throw new ApiError(409, 'INSPECTION_ALREADY_PENDING', 'Inspection evidence is already awaiting review. Refresh its status instead of sending another request.')
      await tx.booking.update({ where: { id: bookingId }, data: { manual_inspection_status: 'pending', manual_inspection_evidence: data.evidence, manual_inspection_requested_by: userId, manual_inspection_requested_at: new Date(), manual_inspection_reviewed_by: null, manual_inspection_reviewed_at: null, manual_inspection_review_reason: null } })
      await tx.adminAudit.create({ data: { actor_id: userId, action: 'request_manual_inspection', target_type: 'booking', target_id: bookingId, reason: data.evidence, metadata: { spatialProof: false, moneyMoved: false } } })
      await recordMutation(tx, command, bookingId)
    })
  } catch (error) { const saved = await committedMutation(command); if (!saved) throw error }
  return getManualInspection(userId, bookingId)
}
