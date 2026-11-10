import { z } from 'zod'
import type { AccountRecord } from '@/lib/accounts/bootstrap'
import { platformEnabled } from '@/lib/platform'
import { permissionsForRole } from '@/lib/auth/roles-policy'

const reservedHandles = new Set(['admin', 'administrator', 'rentral', 'support', 'help', 'system'])
export const accountPatchSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/).refine(value => !reservedHandles.has(value), 'Choose another username.').optional(),
  bio: z.string().trim().max(280).nullable().optional(),
  avatarUrl: z.string().trim().max(1000).regex(/^\/api\/v1\/files\/profile-avatars\/[a-f0-9-]{36}\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i).nullable().optional(),
}).strict().refine(input => input.username !== undefined || input.bio !== undefined || input.avatarUrl !== undefined, 'Supply a username, bio or avatar.')

export function publicAccount(account: Omit<AccountRecord, 'staff_role' | 'gallery_upload_allowed' | 'gallery_permission_revision'> & Partial<Pick<AccountRecord, 'staff_role' | 'gallery_upload_allowed' | 'gallery_permission_revision'>>) {
  return {
    id: account.id, email: account.email, username: account.username,
    bio: account.bio, avatarUrl: account.avatar_url,
    accountType: account.account_type === 'organization' ? 'organization' : 'individual',
    memberSince: account.createdAt.toISOString(), platformAvailable: platformEnabled(),
    capabilities: { adminAvailable: permissionsForRole(account.staff_role).includes('staff:workspace'), galleryUploadAllowed: account.gallery_upload_allowed === true,
      galleryPermissionRevision: account.gallery_permission_revision ?? 0 },
  }
}
