import { createClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/db'

// Shared by server actions only (pulls in next/headers via lib/server).
// Not a 'use server' file — these are helpers, not client-invokable actions.

export async function requireUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function requireVerifiedUserId(): Promise<string | null> {
  const userId = await requireUserId()
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      kyc_verified: true, username: true, account_type: true,
      individualProfile: { select: { id: true } },
      organizationProfile: { select: { id: true } },
    },
  })
  const profile = user?.account_type === 'individual' ? user.individualProfile
    : user?.account_type === 'organization' ? user.organizationProfile : null
  return user?.kyc_verified && user.username && profile ? userId : null
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
