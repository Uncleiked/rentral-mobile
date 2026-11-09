import { z } from 'zod'
import type { AccountRecord } from '@/lib/accounts/bootstrap'
import { platformEnabled } from '@/lib/platform'

const reservedHandles = new Set(['admin', 'administrator', 'rentral', 'support', 'help', 'system'])
export const accountPatchSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/).refine(value => !reservedHandles.has(value), 'Choose another username.').optional(),
  bio: z.string().trim().max(280).nullable().optional(),
  avatarUrl: z.string().trim().max(1000).regex(/^\/api\/v1\/files\/profile-avatars\/[a-f0-9-]{36}\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i).nullable().optional(),
}).strict().refine(input => input.username !== undefined || input.bio !== undefined || input.avatarUrl !== undefined, 'Supply a username, bio or avatar.')

export function publicAccount(account: AccountRecord) {
  return {
    id: account.id, email: account.email, username: account.username,
    bio: account.bio, avatarUrl: account.avatar_url,
    accountType: account.account_type === 'organization' ? 'organization' : 'individual',
    memberSince: account.createdAt.toISOString(), platformAvailable: platformEnabled(),
  }
}
