import prisma from '@/lib/db'
import { memberDashboardSchema } from '@/lib/contracts/dashboard'
import { responseObservations, inspectionObservations } from './metrics-policy'

const MESSAGE_LIMIT = 2000
const INSPECTION_LIMIT = 1000
/** Own-account operational observations. These are not a credit score or a
 * guarantee of responsiveness, identity, attendance or payment reliability. */
export async function memberDashboard(userId: string) {
  const now = new Date(), since = new Date(now.getTime() - 90 * 86400000)
  const participant = { OR: [{ seeker_id: userId }, { lister_id: userId }] }
  const [assets, activeAssets, drafts, activeBookings, completedRentals, saved, conversations, ratings, messages, inspections] = await Promise.all([
    prisma.listing.count({ where: { lister_id: userId } }),
    prisma.listing.count({ where: { lister_id: userId, listing_status: 'active' } }),
    prisma.listing.count({ where: { lister_id: userId, listing_status: 'draft' } }),
    prisma.booking.count({ where: { ...participant, status: { in: ['requested', 'awaiting_payment', 'confirmed', 'disputed'] } } }),
    prisma.booking.count({ where: { ...participant, kind: 'rental', status: 'completed' } }),
    prisma.savedListing.count({ where: { user_id: userId } }), prisma.conversation.count({ where: participant }),
    prisma.review.aggregate({ where: { subject_id: userId, booking: { status: 'completed' } }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.message.findMany({ where: { conversation: participant, createdAt: { gte: since, lte: now } },
      select: { id: true, conversation_id: true, sender_id: true, createdAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MESSAGE_LIMIT + 1 }),
    prisma.booking.findMany({ where: { ...participant, kind: 'inspection', status: { in: ['confirmed', 'completed'] }, ends_at: { gte: since, lte: now } },
      select: { seeker_id: true, starts_at: true, seeker_checked_in_at: true, lister_checked_in_at: true }, orderBy: [{ ends_at: 'desc' }, { id: 'desc' }], take: INSPECTION_LIMIT + 1 }),
  ])
  return memberDashboardSchema.parse({ counts: { assets, activeAssets, drafts, activeBookings, completedRentals, saved, conversations }, activity: {
    periodDays: 90, windowStart: since.toISOString(), windowEnd: now.toISOString(),
    response: responseObservations(userId, messages.slice(0, MESSAGE_LIMIT), messages.length <= MESSAGE_LIMIT),
    inspections: inspectionObservations(userId, inspections.slice(0, INSPECTION_LIMIT), inspections.length <= INSPECTION_LIMIT),
    reviews: { count: ratings._count._all, averageRating: ratings._avg.rating },
  } })
}
