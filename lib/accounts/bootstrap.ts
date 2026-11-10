import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { activeAccountWhere } from './availability'

export const accountSelect = {
  id: true, email: true, username: true, account_type: true, bio: true,
  avatar_url: true, createdAt: true, staff_role: true, gallery_upload_allowed: true, gallery_permission_revision: true,
} satisfies Prisma.UserSelect

export type AccountRecord = Prisma.UserGetPayload<{ select: typeof accountSelect }>

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

/** A public handle contains no email/name and never grants verification or permissions. */
export function defaultAccountHandle(userId: string, attempt = 0): string {
  return `member_${createHash('sha256').update(`${userId}:${attempt}`).digest('hex').slice(0, 17)}`
}

/** Fill only a missing handle; existing accounts and identity decisions stay intact. */
export async function ensureAccountHandle(userId: string): Promise<AccountRecord | null> {
  const account = await prisma.user.findUnique({ where: { id: userId, ...activeAccountWhere }, select: accountSelect })
  if (!account || account.username) return account
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await prisma.user.updateMany({
        where: { id: userId, username: null, ...activeAccountWhere },
        data: { username: defaultAccountHandle(userId, attempt), ...(account.account_type ? {} : { account_type: 'individual' }) },
      })
      return prisma.user.findUnique({ where: { id: userId, ...activeAccountWhere }, select: accountSelect })
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error
    }
  }
  throw new Error('ACCOUNT_HANDLE_UNAVAILABLE')
}

/** Call only with an account from a validated local JWT session, never client-submitted identity. */
export async function ensureAccount(user: { id: string; email?: string }): Promise<AccountRecord | null> {
  const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } })
  if (!existing) {
    if (!user.email) return null
    await prisma.user.upsert({ where: { id: user.id }, create: { id: user.id, email: user.email }, update: {}, select: { id: true } })
  }
  return ensureAccountHandle(user.id)
}
