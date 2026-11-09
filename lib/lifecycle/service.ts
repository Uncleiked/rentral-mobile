import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { assertLifecycleReady } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { assertStaffPermission } from '@/lib/auth/roles'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { bookingWindowAvailable } from '@/lib/bookings/availability'
import { expireListingReservations } from '@/lib/bookings/service'
import { claimStorageObjects, prepareListingStorage } from '@/lib/storage-claims/service'
import { LifecycleError, assertIndependentLifecycleReviewer, lifecycleCounterpartySchema, lifecycleDecisionSchema,
  otherParticipant, renewalPeriod, renewalRequestSchema, terminationPeriod, terminationRequestSchema } from './policy'

const activeLifecycle = ['pending_counterparty', 'pending_review', 'approved']
/** Caller holds the user lock and checks lifecycle preparation before closure. */
export async function lifecycleAccountClosureBlocked(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const participant = { OR: [{ seeker_id: userId }, { lister_id: userId }] }
  if (await tx.renewal.findFirst({ where: { booking: participant, status: { in: ['pending_counterparty', 'pending_review'] } }, select: { id: true } })) return true
  return Boolean(await tx.leaseTermination.findFirst({ where: { booking: participant, status: { in: activeLifecycle } }, select: { id: true } }))
}
async function lockLease(tx: Prisma.TransactionClient, bookingId: string, requireActive = false) {
  const current = await tx.booking.findUnique({ where: { id: bookingId }, select: { listing_id: true, seeker_id: true, lister_id: true } })
  if (!current) throw new LifecycleError('This lease is unavailable.')
  if (requireActive) await assertActiveAccounts(tx, [current.seeker_id, current.lister_id])
  await lockRecord(tx, 'listing', current.listing_id)
  await lockRecord(tx, 'booking', bookingId)
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { listing: { select: { category: true } } } })
  if (!booking || booking.kind !== 'rental' || booking.listing.category !== 'house') throw new LifecycleError('Choose a residential rental lease.')
  return booking
}
async function lifecycleAudit(tx: Prisma.TransactionClient, actorId: string, action: string, targetType: string, targetId: string, reason: string): Promise<void> {
  await tx.adminAudit.create({ data: { actor_id: actorId, action, target_type: targetType, target_id: targetId, reason } })
}
async function notifyParticipants(tx: Prisma.TransactionClient, booking: { id: string; seeker_id: string; lister_id: string }, title: string, body: string): Promise<void> {
  await tx.notification.createMany({ data: [booking.seeker_id, booking.lister_id].map(user_id => ({ user_id,
    kind: 'lease_update', title, body, href: `/marketplace/bookings/${booking.id}` })) })
}

export async function requestRenewal(userId: string, input: unknown): Promise<string> {
  await assertLifecycleReady()
  const data = renewalRequestSchema.parse(input)
  const prepared = await prepareListingStorage(userId, { documentPath: data.evidencePath })
  return withTransaction(async tx => {
    const booking = await lockLease(tx, data.bookingId, true)
    if (booking.seeker_id !== userId || !['confirmed', 'completed'].includes(booking.status)) throw new LifecycleError('Choose one of your residential leases.')
    renewalPeriod(booking.ends_at, new Date(data.requestedEndsAt))
    const existing = await tx.renewal.findFirst({ where: { booking_id: booking.id, status: { in: ['pending_counterparty', 'pending_review'] } },
      select: { id: true, user_id: true, reference: true, original_ends_at: true, requested_ends_at: true, evidence_path: true } })
    const legacyDraft = existing && existing.user_id === userId && existing.reference === data.reference && (!existing.original_ends_at || !existing.requested_ends_at || !existing.evidence_path)
    if ((existing && !legacyDraft) || await tx.leaseTermination.findFirst({ where: { booking_id: booking.id, status: { in: activeLifecycle } }, select: { id: true } })) throw new LifecycleError('Review the existing lease request before submitting another. To complete an old incomplete renewal, use its original reference.')
    await claimStorageObjects(tx, userId, prepared)
    const values = { booking_id: booking.id, user_id: userId, reference: data.reference,
      recipient_route: data.recipientRoute, status: 'pending_counterparty', original_ends_at: booking.ends_at,
      requested_ends_at: new Date(data.requestedEndsAt), evidence_path: data.evidencePath }
    const renewalId = legacyDraft ? existing.id : (await tx.renewal.create({ data: values })).id
    if (legacyDraft) await tx.renewal.update({ where: { id: existing.id }, data: { ...values, host_confirmed_at: null, host_confirmed_by: null,
      reviewed_by: null, reviewed_at: null, decision_reason: null } })
    await tx.notification.create({ data: { user_id: booking.lister_id, kind: 'renewal', title: 'Review a lease extension request',
      body: 'The renter submitted dates and supporting evidence. Confirm the proposed extension before independent staff review. This is not provider payment verification.', href: '/marketplace/renewals' } })
    return renewalId
  })
}

export async function confirmRenewal(userId: string, id: string, input: unknown): Promise<void> {
  await assertLifecycleReady()
  const data = lifecycleCounterpartySchema.parse(input)
  await withTransaction(async tx => {
    const current = await tx.renewal.findUnique({ where: { id }, select: { booking_id: true } })
    if (!current) throw new LifecycleError('This renewal is unavailable.')
    const booking = await lockLease(tx, current.booking_id, data.decision === 'accept')
    await lockRecord(tx, 'renewal', id)
    const renewal = await tx.renewal.findUnique({ where: { id } })
    if (!renewal || booking.lister_id !== userId || renewal.status !== 'pending_counterparty') throw new LifecycleError('Only the host can decide a pending extension request.')
    if (!renewal.original_ends_at || !renewal.requested_ends_at || !renewal.evidence_path || renewal.original_ends_at.getTime() !== booking.ends_at.getTime()) throw new LifecycleError('The lease dates changed. Submit a current extension request.')
    await tx.renewal.update({ where: { id }, data: data.decision === 'accept'
      ? { status: 'pending_review', host_confirmed_at: new Date(), host_confirmed_by: userId }
      : { status: 'rejected', decision_reason: data.reason } })
    await notifyParticipants(tx, booking, data.decision === 'accept' ? 'Lease extension awaits staff review' : 'Lease extension declined',
      'The recorded lease dates and payment history are unchanged until an eligible extension is independently approved.')
  })
}

export async function reviewRenewal(actorId: string, id: string, input: unknown): Promise<void> {
  await assertLifecycleReady()
  const data = lifecycleDecisionSchema.parse(input)
  await withTransaction(async tx => {
    const current = await tx.renewal.findUnique({ where: { id }, select: { booking_id: true } })
    if (!current) throw new LifecycleError('This renewal is unavailable.')
    const booking = await lockLease(tx, current.booking_id, data.decision === 'approve')
    await lockRecord(tx, 'renewal', id)
    await assertStaffPermission(tx, actorId, 'renewal:review')
    assertIndependentLifecycleReviewer(actorId, booking)
    const renewal = await tx.renewal.findUnique({ where: { id } })
    if (!renewal || !['pending_counterparty', 'pending_review'].includes(renewal.status)) throw new LifecycleError('This renewal has already been decided.')
    if (data.decision === 'approve') {
      if (renewal.status !== 'pending_review' || !renewal.original_ends_at || !renewal.requested_ends_at || !renewal.evidence_path ||
        !renewal.host_confirmed_at || renewal.host_confirmed_by !== booking.lister_id || renewal.user_id !== booking.seeker_id ||
        renewal.original_ends_at.getTime() !== booking.ends_at.getTime() || !['confirmed', 'completed'].includes(booking.status)) throw new LifecycleError('Approval requires current dates, supporting evidence and the host confirmation.')
      renewalPeriod(booking.ends_at, renewal.requested_ends_at)
      if (await tx.leaseTermination.findFirst({ where: { booking_id: booking.id, status: { in: activeLifecycle } }, select: { id: true } })) throw new LifecycleError('Review the existing termination request first.')
      await expireListingReservations(tx, booking.listing_id, new Date())
      if (!await bookingWindowAvailable(tx, { ...booking, ends_at: renewal.requested_ends_at })) throw new LifecycleError('The extension overlaps an existing reservation.')
      // Original collected amount/pricing/payment records remain unchanged.
      await tx.booking.update({ where: { id: booking.id }, data: { ends_at: renewal.requested_ends_at, status: 'confirmed' } })
    }
    await tx.renewal.update({ where: { id }, data: { status: data.decision === 'approve' ? 'approved' : 'rejected',
      reviewed_by: actorId, reviewed_at: new Date(), decision_reason: data.reason } })
    await lifecycleAudit(tx, actorId, `renewal_${data.decision}`, 'renewal', id, data.reason)
    await notifyParticipants(tx, booking, data.decision === 'approve' ? 'Lease extension approved' : 'Lease extension declined',
      data.decision === 'approve' ? 'The reviewed lease end was extended. The external reference is recorded separately; this does not verify a provider payment or move funds.' : 'The lease extension was declined. Existing lease dates and financial history remain unchanged.')
  })
}

export async function requestTermination(userId: string, input: unknown): Promise<string> {
  await assertLifecycleReady()
  const data = terminationRequestSchema.parse(input)
  const prepared = await prepareListingStorage(userId, { documentPath: data.evidencePath })
  return withTransaction(async tx => {
    const booking = await lockLease(tx, data.bookingId)
    otherParticipant(userId, booking)
    if (booking.status !== 'confirmed') throw new LifecycleError('Resolve outstanding reports before requesting termination of an active lease.')
    terminationPeriod(booking.starts_at, booking.ends_at, new Date(data.requestedEndAt))
    if (await tx.leaseTermination.findFirst({ where: { booking_id: booking.id, status: { in: activeLifecycle } }, select: { id: true } }) ||
      await tx.renewal.findFirst({ where: { booking_id: booking.id, status: { in: ['pending_counterparty', 'pending_review'] } }, select: { id: true } })) throw new LifecycleError('Review the existing lease request before submitting another.')
    await claimStorageObjects(tx, userId, prepared)
    const termination = await tx.leaseTermination.create({ data: { booking_id: booking.id, requested_by: userId, reason: data.reason,
      evidence_path: data.evidencePath, original_ends_at: booking.ends_at, requested_end_at: new Date(data.requestedEndAt) } })
    await notifyParticipants(tx, booking, 'Review an early lease end request', 'Both participants must agree and an independent staff reviewer must assess the evidence. Existing lease dates and financial history are unchanged.')
    return termination.id
  })
}

export async function confirmTermination(userId: string, id: string, input: unknown): Promise<void> {
  await assertLifecycleReady()
  const data = lifecycleCounterpartySchema.parse(input)
  await withTransaction(async tx => {
    const current = await tx.leaseTermination.findUnique({ where: { id }, select: { booking_id: true } })
    if (!current) throw new LifecycleError('This termination request is unavailable.')
    const booking = await lockLease(tx, current.booking_id)
    await lockRecord(tx, 'leaseTermination', id)
    const termination = await tx.leaseTermination.findUnique({ where: { id } })
    if (!termination || otherParticipant(termination.requested_by, booking) !== userId || termination.status !== 'pending_counterparty') throw new LifecycleError('Only the other lease participant can decide this pending request.')
    await tx.leaseTermination.update({ where: { id }, data: { counterparty_decision: data.decision === 'accept' ? 'accepted' : 'rejected',
      counterparty_decided_at: new Date(), counterparty_reason: data.reason, status: data.decision === 'accept' ? 'pending_review' : 'rejected' } })
    await notifyParticipants(tx, booking, data.decision === 'accept' ? 'Lease end request awaits staff review' : 'Lease end request declined', 'The recorded lease dates and financial history remain unchanged.')
  })
}

export async function reviewTermination(actorId: string, id: string, input: unknown): Promise<void> {
  await assertLifecycleReady()
  const data = lifecycleDecisionSchema.parse(input)
  await withTransaction(async tx => {
    const current = await tx.leaseTermination.findUnique({ where: { id }, select: { booking_id: true } })
    if (!current) throw new LifecycleError('This termination request is unavailable.')
    const booking = await lockLease(tx, current.booking_id)
    await lockRecord(tx, 'leaseTermination', id)
    await assertStaffPermission(tx, actorId, 'termination:review')
    assertIndependentLifecycleReviewer(actorId, booking)
    const termination = await tx.leaseTermination.findUnique({ where: { id } })
    if (!termination || !['pending_counterparty', 'pending_review'].includes(termination.status)) throw new LifecycleError('This request has already been decided.')
    if (data.decision === 'approve' && (termination.status !== 'pending_review' || termination.counterparty_decision !== 'accepted' || !termination.counterparty_decided_at ||
      !termination.evidence_path || booking.status !== 'confirmed' || termination.original_ends_at.getTime() !== booking.ends_at.getTime() ||
      termination.requested_end_at <= booking.starts_at || termination.requested_end_at >= booking.ends_at)) throw new LifecycleError('Approval requires both participants, reviewed evidence and unchanged lease dates.')
    await tx.leaseTermination.update({ where: { id }, data: { status: data.decision === 'approve' ? 'approved' : 'rejected', reviewed_by: actorId,
      reviewed_at: new Date(), decision_reason: data.reason } })
    await lifecycleAudit(tx, actorId, `termination_${data.decision}`, 'lease_termination', id, data.reason)
    await notifyParticipants(tx, booking, data.decision === 'approve' ? 'Early lease end approved' : 'Early lease end declined',
      'Approval records the agreed date. Inventory is released only when it becomes effective and no active report or reservation prevents release. No refund or payout is implied.')
  })
}

/** Worker/manual safe retry: only reviewed effective requests can release inventory. */
export async function releaseTermination(id: string): Promise<boolean> {
  await assertLifecycleReady()
  return withTransaction(async tx => {
    const current = await tx.leaseTermination.findUnique({ where: { id }, select: { booking_id: true } })
    if (!current) return false
    const booking = await lockLease(tx, current.booking_id)
    await lockRecord(tx, 'leaseTermination', id)
    const termination = await tx.leaseTermination.findUnique({ where: { id } }), now = new Date()
    if (!termination || termination.status !== 'approved' || termination.counterparty_decision !== 'accepted' || !termination.reviewed_by || !termination.reviewed_at ||
      !termination.evidence_path || termination.requested_end_at > now || termination.requested_end_at <= booking.starts_at || termination.requested_end_at >= booking.ends_at ||
      termination.original_ends_at.getTime() !== booking.ends_at.getTime() || booking.status !== 'confirmed') return false
    if (await tx.dispute.findFirst({ where: { booking_id: booking.id, status: 'open' }, select: { id: true } }) ||
      await tx.booking.findFirst({ where: { id: { not: booking.id }, listing_id: booking.listing_id, kind: 'rental',
        status: { in: ['awaiting_payment', 'confirmed', 'disputed'] }, starts_at: { lte: now }, ends_at: { gt: now } }, select: { id: true } })) return false
    await tx.booking.update({ where: { id: booking.id }, data: { ends_at: termination.requested_end_at, status: 'completed' } })
    await tx.leaseTermination.update({ where: { id }, data: { status: 'released', released_at: now } })
    await lifecycleAudit(tx, termination.reviewed_by, 'termination_effective_release', 'lease_termination', id, 'Released the independently reviewed, mutually accepted lease end when effective; financial records are unchanged.')
    await notifyParticipants(tx, booking, 'Agreed lease end is effective', 'The reviewed lease end is now recorded. Existing payment and settlement records remain separate. Listing review status was preserved.')
    return true
  })
}

export async function getOwnLeaseRequests(userId: string) {
  await assertLifecycleReady()
  return Promise.all([
    prisma.renewal.findMany({ where: { booking: { OR: [{ seeker_id: userId }, { lister_id: userId }] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 }),
    prisma.leaseTermination.findMany({ where: { booking: { OR: [{ seeker_id: userId }, { lister_id: userId }] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 }),
  ])
}
