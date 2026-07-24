import { createClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

// Shared by server actions only (pulls in next/headers via lib/server).
// Not a 'use server' file — these are helpers, not client-invokable actions.

export async function requireUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
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
