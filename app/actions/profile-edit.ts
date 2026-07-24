'use server'

import { z } from 'zod'
import prisma from '@/lib/db'
import { createClient } from '@/lib/server'
import { captureServerEvent } from '@/lib/posthog'
import { requireUserId, revalidateProfilePaths } from '@/lib/action-helpers'

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

  const userId = await requireUserId()
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
  const userId = await requireUserId()
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

    await prisma.user.update({
      where: { id: userId },
      data: { username, bio: bio.length > 0 ? bio : null },
    })

    revalidateProfilePaths(username, previous?.username)
    await captureServerEvent(userId, 'profile_updated', { field: 'identity' })
    return { success: true }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: 'That username is already taken.' }
    }

    console.error('[actions/profile-edit] updateProfileIdentity failed:', error)
    return { success: false, error: 'Could not save your profile. Please try again.' }
  }
}

export async function requestEmailChange(newEmail: string): Promise<ActionResult> {
  const parsed = z.string().trim().email().safeParse(newEmail)
  if (!parsed.success) {
    return { success: false, error: 'Enter a valid email address.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const next = encodeURIComponent('/marketplace/profile?email_change=check')

  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: `${appUrl}/auth/callback?next=${next}` }
  )

  if (error) {
    console.error('[actions/profile-edit] requestEmailChange failed:', error.message)
    return { success: false, error: 'Could not start the email change. Please try again.' }
  }

  return { success: true }
}

export async function updateAvatarUrl(avatarUrl: string): Promise<ActionResult> {
  const userId = await requireUserId()
  if (!userId) {
    return { success: false, error: 'Not authenticated' }
  }

  const parsed = z.string().trim().url().safeParse(avatarUrl)
  if (!parsed.success) {
    return { success: false, error: 'Invalid image URL.' }
  }

  try {
    const dbUser = await prisma.user.update({
      where: { id: userId },
      data: { avatar_url: parsed.data },
      select: { username: true },
    })

    revalidateProfilePaths(dbUser.username)

    await captureServerEvent(userId, 'profile_updated', { field: 'avatar' })
    return { success: true }
  } catch (error) {
    console.error('[actions/profile-edit] updateAvatarUrl failed:', error)
    return { success: false, error: 'Could not save your photo. Please try again.' }
  }
}
