import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { ApiError } from '@/lib/api/http'

export type SocialDatabase = Pick<Prisma.TransactionClient, 'socialFollow' | 'socialBlock'>
/** The query-only extension preserves delegate inputs/results. Erase its
 * internal generic metadata once; all database readiness guards stay active. */
export const socialReadDatabase = prisma as unknown as Prisma.TransactionClient
export const socialEdgeId = (kind: 'follow' | 'block' | 'like', from: string, to: string) => createHash('sha256').update(`rentral:${kind}:v1\0${from}\0${to}`).digest('hex')

export async function areUsersMutualFollowers(userA: string, userB: string, tx: SocialDatabase = socialReadDatabase): Promise<boolean> {
  if (userA === userB) return false
  const count = await tx.socialFollow.count({ where: { id: { in: [socialEdgeId('follow', userA, userB), socialEdgeId('follow', userB, userA)] }, active: true } })
  return count === 2
}
export async function areSociallyBlocked(userA: string, userB: string, tx: SocialDatabase = socialReadDatabase): Promise<boolean> {
  return Boolean(await tx.socialBlock.findFirst({ where: { active: true, OR: [{ blocker_id: userA, blocked_id: userB }, { blocker_id: userB, blocked_id: userA }] }, select: { id: true } }))
}
export async function assertSocialInteractionAllowed(tx: SocialDatabase, userA: string, userB: string): Promise<void> {
  if (await areSociallyBlocked(userA, userB, tx)) throw new ApiError(404, 'NOT_FOUND', 'This member is unavailable.')
}

