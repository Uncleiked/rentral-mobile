import prisma from '@/lib/db'
import { accountExportManifestSchema, accountExportPageSchema, accountExportQuerySchema, accountExportResources } from '@/lib/contracts/account-lifecycle'
import { financialPrepared } from '@/lib/database/readiness'
import { activeAccountWhere } from './availability'
import { AuthError } from '@/lib/auth/types'

/** Deliberately shallow allowlists: never serialize a full Prisma record. */
export async function exportAccountPage(userId: string, input: unknown) {
  const query = accountExportQuerySchema.parse(input)
  if (!await prisma.user.findUnique({ where: { id: userId, ...activeAccountWhere }, select: { id: true } })) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  if (!query.resource) return accountExportManifestSchema.parse({ version: 1, resources: accountExportResources, description: 'Download each resource page before closing your account. This export contains your account records, not uploaded files or another person’s private evidence. It is not an erasure request.' })
  const page = { ...(query.cursor ? { id: { gt: query.cursor } } : {}), }, take = query.limit + 1, orderBy = { id: 'asc' as const }
  let rows: { id: string; [key: string]: unknown }[]
  switch (query.resource) {
    case 'profile': rows = query.cursor ? [] : await prisma.user.findMany({ where: { id: userId }, take: 1, select: { id: true, email: true, username: true, account_type: true, bio: true, avatar_url: true, createdAt: true, updatedAt: true } }); break
    case 'listings': rows = await prisma.listing.findMany({ where: { lister_id: userId, ...page }, take, orderBy, select: { id: true, category: true, text_address: true, base_rent_amount: true, listing_status: true, archived_at: true, createdAt: true, updatedAt: true } }); break
    case 'bookings': rows = await prisma.booking.findMany({ where: { OR: [{ seeker_id: userId }, { lister_id: userId }], ...page }, take, orderBy, select: { id: true, listing_id: true, kind: true, status: true, starts_at: true, ends_at: true, amount_kobo: true, hold_credit_kobo: true, currency: true, settlement_status: true, createdAt: true, updatedAt: true } }); break
    case 'payments': rows = await prisma.paymentIntent.findMany({ where: { user_id: userId, ...page }, take, orderBy, select: { id: true, booking_id: true, listing_id: true, provider: true, provider_environment: true, reference: true, kind: true, amount_kobo: true, currency: true, status: true, paid_at: true, createdAt: true, updatedAt: true } }); break
    case 'financial': rows = await financialPrepared() ? await prisma.financialOperation.findMany({ where: { OR: [{ requested_by: userId }, { participant_ids: { has: userId } }], ...page }, take, orderBy, select: { id: true, booking_id: true, kind: true, provider_environment: true, reference: true, amount_kobo: true, retained_kobo: true, currency: true, status: true, policy_version: true, completed_at: true, createdAt: true, updatedAt: true } }) : []; break
    case 'messages': rows = await prisma.message.findMany({ where: { sender_id: userId, ...page }, take, orderBy, select: { id: true, conversation_id: true, body: true, shared_listing_id: true, createdAt: true } }); break
    case 'notifications': rows = await prisma.notification.findMany({ where: { user_id: userId, ...page }, take, orderBy, select: { id: true, kind: true, title: true, body: true, href: true, read_at: true, createdAt: true } }); break
    case 'reviews': rows = await prisma.review.findMany({ where: { author_id: userId, ...page }, take, orderBy, select: { id: true, booking_id: true, rating: true, comment: true, createdAt: true } }); break
    case 'reports': rows = await prisma.dispute.findMany({ where: { opened_by: userId, ...page }, take, orderBy, select: { id: true, booking_id: true, reason: true, status: true, createdAt: true, updatedAt: true } }); break
    case 'saved': rows = await prisma.savedListing.findMany({ where: { user_id: userId, ...page }, take, orderBy, select: { id: true, listing_id: true, createdAt: true } }); break
    case 'consents': rows = query.cursor ? [] : await prisma.user.findMany({ where: { id: userId }, take: 1, select: { id: true, analytics_consent: true, analytics_consent_at: true } }); break
  }
  const serialized = rows.slice(0, query.limit).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : typeof value === 'bigint' ? value.toString() : value])))
  return accountExportPageSchema.parse({ version: 1, resource: query.resource, generatedAt: new Date().toISOString(), items: serialized, nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null })
}
