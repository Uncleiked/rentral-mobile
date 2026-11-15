import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ApiError } from '@/lib/api/http'
import { assertActiveAccounts, activeAccountWhere } from '@/lib/accounts/availability'
import { assertSocialReady } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { committedMutation, mutationCommand, recordMutation, transactionMutation } from '@/lib/database/mutations'
import { followCommandSchema, blockCommandSchema, likeCommandSchema, type SocialPerson, type ListingLikeSummary, type BlockState } from '@/lib/contracts/social'
import { assertGalleryListingCurrent, galleryIsPublic, galleryListingSelect, galleryUserSelect } from '@/lib/listings/gallery'
import { assertSocialInteractionAllowed, socialEdgeId, socialReadDatabase } from './relationships'
import { getPerson } from './people'

const DAY = 86400000
function notFound(): ApiError { return new ApiError(404, 'NOT_FOUND', 'This member or listing is unavailable.') }
export async function setFollowing(actor: string, target: string, input: unknown): Promise<SocialPerson> {
  await assertSocialReady(); z.uuid().parse(target)
  const data = followCommandSchema.parse(input)
  if (actor === target) throw new ApiError(400, 'SELF_FOLLOW', 'You cannot follow your own account.')
  const command = mutationCommand(actor, 'social_follow', data.clientId, { target, ...data })
  if (await committedMutation(command)) return getPerson(actor, target)
  await withTransaction(async tx => {
    await assertActiveAccounts(tx, [actor, target]); await assertSocialInteractionAllowed(tx, actor, target)
    if (await transactionMutation(tx, command)) return
    const id = socialEdgeId('follow', actor, target), previous = await tx.socialFollow.findUnique({ where: { id } }), now = new Date()
    const notify = data.following && !previous?.active && (!previous?.notified_at || now.getTime() - previous.notified_at.getTime() >= DAY)
    await tx.socialFollow.upsert({ where: { id }, create: { id, follower_id: actor, followed_id: target, active: data.following, ...(notify ? { notified_at: now } : {}) },
      update: { active: data.following, ...(notify ? { notified_at: now } : {}) } })
    if (data.following && await tx.socialFollow.findFirst({ where: { follower_id: target, followed_id: actor, active: true }, select: { id: true } })) {
      // Following back accepts the existing request. Acceptance remains after
      // a later unfollow; a block still prevents further communication.
      await tx.conversation.updateMany({ where: { kind: 'direct', OR: [{ seeker_id: actor, lister_id: target }, { seeker_id: target, lister_id: actor }], AND: [{ OR: [{ accepted_at: null }, { accepted_at: { isSet: false } }] }] },
        data: { accepted_at: now, accepted_by: actor, revision: { increment: 1 } } })
    }
    if (notify) {
      const sender = await tx.user.findUnique({ where: { id: actor }, select: { username: true } })
      await tx.notification.create({ data: { user_id: target, kind: 'social_follow', title: 'New follower', body: sender?.username ? `@${sender.username} started following you.` : 'A Rentral member started following you.',
        href: sender?.username ? `/marketplace/profile/${encodeURIComponent(sender.username)}` : '/marketplace/people', email_status: 'skipped', dedupe_key: `social-follow:${id}:${data.clientId}` } })
    }
    await recordMutation(tx, command, target)
  })
  // Profile joins and relationship counts belong after commit. Prisma serializes
  // even Promise.all reads on an interactive transaction's single connection.
  return getPerson(actor, target)
}
async function ownBlockState(actor: string, target: string, tx: Pick<Prisma.TransactionClient, 'socialBlock'> = socialReadDatabase): Promise<BlockState> {
  const state = await tx.socialBlock.findUnique({ where: { id: socialEdgeId('block', actor, target) }, select: { active: true } })
  return { personId: target, blocked: Boolean(state?.active) }
}
/** Only the actor's choice is disclosed, even if the other member blocked them. */
export async function getOwnBlockState(actor: string, target: string): Promise<BlockState> {
  await assertSocialReady(); z.uuid().parse(target)
  return ownBlockState(actor, target)
}
export async function setBlocked(actor: string, target: string, input: unknown): Promise<BlockState> {
  await assertSocialReady(); z.uuid().parse(target)
  const data = blockCommandSchema.parse(input)
  if (actor === target) throw new ApiError(400, 'SELF_BLOCK', 'You cannot block your own account.')
  const command = mutationCommand(actor, 'social_block', data.clientId, { target, ...data })
  await withTransaction(async tx => {
    // Removing your own block must remain possible after the target closes
    // their account or blocks you. Creating a new block requires both active.
    await assertActiveAccounts(tx, data.blocked ? [actor, target] : [actor])
    if (await transactionMutation(tx, command)) return
    const id = socialEdgeId('block', actor, target)
    const previous = await tx.socialBlock.findUnique({ where: { id }, select: { active: true } })
    // Do not create an orphan block for an unknown target when it is already off.
    if (data.blocked || previous) await tx.socialBlock.upsert({ where: { id }, create: { id, blocker_id: actor, blocked_id: target, active: data.blocked }, update: { active: data.blocked } })
    if (data.blocked) {
      await tx.socialFollow.updateMany({ where: { id: { in: [socialEdgeId('follow', actor, target), socialEdgeId('follow', target, actor)] }, active: true }, data: { active: false } })
      const threads = await tx.conversation.findMany({ where: { OR: [{ seeker_id: actor, lister_id: target }, { seeker_id: target, lister_id: actor }] }, select: { id: true } })
      if (threads.length) await tx.conversationActivity.deleteMany({ where: { conversation_id: { in: threads.map(row => row.id) } } })
    }
    await recordMutation(tx, command, target)
  })
  return ownBlockState(actor, target)
}
const likeListingSelect = { id: true, lister_id: true, ...galleryListingSelect, lister: { select: { ...galleryUserSelect } } } satisfies Prisma.ListingSelect
async function listingForLike(actor: string, listingId: string, tx: Pick<Prisma.TransactionClient, 'listing' | 'socialBlock'> = socialReadDatabase) {
  const row = await tx.listing.findFirst({ where: { id: listingId, listing_status: 'active', lister: activeAccountWhere, AND: [{ OR: [{ archived_at: null }, { archived_at: { isSet: false } }] }] }, select: likeListingSelect })
  if (!row || !galleryIsPublic(row)) throw notFound()
  // Do not leak a blocked host through listing engagement metadata.
  if (await tx.socialBlock.findFirst({ where: { active: true, OR: [{ blocker_id: actor, blocked_id: row.lister_id }, { blocker_id: row.lister_id, blocked_id: actor }] }, select: { id: true } })) throw notFound()
  return row
}
async function likeSummary(actor: string, listingId: string, tx: Pick<Prisma.TransactionClient, 'listingLike'> = socialReadDatabase): Promise<ListingLikeSummary> {
  const [mine, count] = await Promise.all([tx.listingLike.findUnique({ where: { id: socialEdgeId('like', actor, listingId) }, select: { active: true } }),
    tx.listingLike.count({ where: { listing_id: listingId, active: true, user: activeAccountWhere } })])
  return { listingId, liked: Boolean(mine?.active), count }
}
export async function getListingLike(actor: string, listingId: string): Promise<ListingLikeSummary> {
  await assertSocialReady(); z.uuid().parse(listingId); await listingForLike(actor, listingId); return likeSummary(actor, listingId)
}
export async function setListingLike(actor: string, listingId: string, input: unknown): Promise<ListingLikeSummary> {
  await assertSocialReady(); z.uuid().parse(listingId)
  const data = likeCommandSchema.parse(input), command = mutationCommand(actor, 'social_like', data.clientId, { listingId, ...data })
  if (await committedMutation(command)) return getListingLike(actor, listingId)
  const listing = await listingForLike(actor, listingId)
  await withTransaction(async tx => {
    await assertActiveAccounts(tx, [actor, listing.lister_id]); await assertSocialInteractionAllowed(tx, actor, listing.lister_id)
    await lockRecord(tx, 'listing', listingId)
    const current = await listingForLike(actor, listingId, tx)
    if (current.lister_id !== listing.lister_id) throw notFound()
    await assertGalleryListingCurrent(tx, current)
    if (await transactionMutation(tx, command)) return
    const id = socialEdgeId('like', actor, listingId), previous = await tx.listingLike.findUnique({ where: { id } }), now = new Date()
    const notify = actor !== listing.lister_id && data.liked && !previous?.active && (!previous?.notified_at || now.getTime() - previous.notified_at.getTime() >= DAY)
    await tx.listingLike.upsert({ where: { id }, create: { id, user_id: actor, listing_id: listingId, active: data.liked, ...(notify ? { notified_at: now } : {}) }, update: { active: data.liked, ...(notify ? { notified_at: now } : {}) } })
    if (notify) {
      const sender = await tx.user.findUnique({ where: { id: actor }, select: { username: true } })
      await tx.notification.create({ data: { user_id: listing.lister_id, kind: 'social_like', title: 'Your listing was liked', body: sender?.username ? `@${sender.username} liked your listing.` : 'A Rentral member liked your listing.',
        href: `/marketplace/listing/${listingId}`, email_status: 'skipped', dedupe_key: `social-like:${id}:${data.clientId}` } })
    }
    await recordMutation(tx, command, listingId)
  })
  return getListingLike(actor, listingId)
}

