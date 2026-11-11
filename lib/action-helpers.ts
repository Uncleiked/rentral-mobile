import { createClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import { organizationMarketplaceAllowed } from '@/lib/organizations/access'
import { ensureAccountHandle } from '@/lib/accounts/bootstrap'

// Shared by server actions only (pulls in next/headers via lib/server).
// Not a 'use server' file — these are helpers, not client-invokable actions.

export async function requireSessionUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user }, error,
  } = await supabase.auth.getUser()
  return !error && user && !user.is_anonymous ? user.id : null
}

export async function requireUserId(): Promise<string | null> {
  const id = await requireSessionUserId()
  return id && await organizationMarketplaceAllowed(id) ? id : null
}

// Compatibility name for existing web actions: a real authenticated account
// is required, with no KYC decision or mandatory profile wizard.
export async function requireVerifiedUserId(): Promise<string | null> {
  const userId = await requireUserId()
  if (!userId) return null
  const user = await ensureAccountHandle(userId)
  return user ? userId : null
}

export function revalidateProfilePaths(username: string | null, previousUsername?: string | null) {
  revalidatePath('/marketplace/profile')
  if (username) {
    revalidatePath(`/marketplace/profile/${username}`)
  }
  if (previousUsername && previousUsername !== username) {
    revalidatePath(`/marketplace/profile/${previousUsername}`)
  }
}
