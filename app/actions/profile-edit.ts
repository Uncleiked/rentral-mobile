'use server'

import { z } from 'zod'
import prisma from '@/lib/db'
import { captureServerEvent } from '@/lib/posthog'
import { requireSessionUserId, revalidateProfilePaths } from '@/lib/action-helpers'
import { updateAccountProfile } from '@/lib/accounts/profile'
import { AccountUnavailableError } from '@/lib/accounts/availability'

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/
const MAX_BIO_LENGTH = 280

type ActionResult = { success: true } | { success: false; error: string }

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  )
}

export async function checkUsernameAvailability(
  username: string
): Promise<{ available: boolean; error?: string }> {
  const normalized = username.trim().toLowerCase()

  if (!USERNAME_PATTERN.test(normalized)) {
    return {
      available: false,
      error: 'Usernames must be 3-24 characters and use only lowercase letters, numbers, or underscores.',
    }
  }

  const userId = await requireSessionUserId()
  if (!userId) {
    return { available: false, error: 'Not authenticated' }
  }

  const existing = await prisma.user.findUnique({
    where: { username: normalized },
    select: { id: true },
  })

  if (existing && existing.id !== userId) {
    return { available: false, error: 'That username is already taken.' }
  }

  return { available: true }
}

export async function updateProfileIdentity(data: { username: string; bio: string }): Promise<ActionResult> {
  const userId = await requireSessionUserId()
  if (!userId) {
    return { success: false, error: 'Not authenticated' }
  }

  const username = data.username.trim().toLowerCase()
  const bio = data.bio.trim()

  if (!USERNAME_PATTERN.test(username)) {
    return {
      success: false,
      error: 'Usernames must be 3-24 characters and use only lowercase letters, numbers, or underscores.',
    }
  }

  if (bio.length > MAX_BIO_LENGTH) {
    return { success: false, error: `Bio must be ${MAX_BIO_LENGTH} characters or fewer.` }
  }

  try {
    const previous = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })

    await updateAccountProfile(userId, { username, bio: bio.length > 0 ? bio : null })

    revalidateProfilePaths(username, previous?.username)
    await captureServerEvent(userId, 'profile_updated', { field: 'identity' })
    return { success: true }
  } catch (error) {
    if (error instanceof AccountUnavailableError) return { success: false, error: error.message }
    if (isUniqueConstraintError(error)) {
      return { success: false, error: 'That username is already taken.' }
    }

    console.error('[actions/profile-edit] Profile update failed:', error instanceof Error ? error.name : 'UnknownError')
    return { success: false, error: 'Could not save your profile. Please try again.' }
  }
}

export async function updateAvatarUrl(avatarUrl: string): Promise<ActionResult> {
  const userId = await requireSessionUserId()
  if (!userId) {
    return { success: false, error: 'Not authenticated' }
  }

  const parsed = z.string().trim().min(1).max(1500).safeParse(avatarUrl)
  if (!parsed.success) {
    return { success: false, error: 'Invalid image URL.' }
  }

  try {
    const dbUser = await updateAccountProfile(userId, { avatarUrl: parsed.data })

    revalidateProfilePaths(dbUser.username)

    await captureServerEvent(userId, 'profile_updated', { field: 'avatar' })
    return { success: true }
  } catch (error) {
    console.error('[actions/profile-edit] Photo update failed:', error instanceof Error ? error.name : 'UnknownError')
    return { success: false, error: 'Choose a JPEG, PNG or WEBP photo uploaded to your own account, then try again.' }
  }
}
