'use server'

import { requireVerifiedUserId } from '@/lib/action-helpers'
import { saveDraftForUser, saveListingForUser, updateListingForUser } from '@/lib/listings/service'

type ActionFailure = { success: false; error: string; uncertain?: boolean }

// Only the authenticated server session can choose the actor. Keeping actorId
// out of exported action signatures prevents clients from impersonating owners.
async function withListingAccount<T>(work: (userId: string) => Promise<T>): Promise<T | ActionFailure> {
  let workStarted = false
  try {
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to manage listings.' }
    workStarted = true
    return await work(userId)
  } catch {
    return { success: false, uncertain: workStarted, error: workStarted ? 'The save could not be confirmed. Check Your Listings before trying again.' : 'Listing management is temporarily unavailable. Please try again.' }
  }
}

export async function saveListing(input: unknown) {
  return withListingAccount(userId => saveListingForUser(userId, input))
}

export async function saveDraft(input: unknown) {
  return withListingAccount(userId => saveDraftForUser(userId, input))
}

export async function updateListing(input: unknown) {
  return withListingAccount(userId => updateListingForUser(userId, input))
}
