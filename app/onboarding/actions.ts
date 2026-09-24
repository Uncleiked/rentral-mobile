'use server'

import { createAdminClient } from '@/lib/admin'
import prisma from '@/lib/db'
import { createClient } from '@/lib/server'
import { captureServerEvent } from '@/lib/posthog'
import { redirect } from 'next/navigation'

type AccountType = 'individual' | 'organization'

type OnboardingState = {
  accountType: AccountType | null
  verificationStatus: string
  kycVerified: boolean
  username: string | null
  diditSessionId: string | null
  profileCompleted: boolean
}

type ActionResult =
  | { error: string; url?: never; session_id?: never }
  | { error?: never; url: string; session_id: string | null }

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/

function normalizeAccountType(value: FormDataEntryValue | null): AccountType | null {
  return value === 'individual' || value === 'organization' ? value : null
}

function workflowForAccountType(accountType: AccountType): {
  workflowId: string | undefined
  verificationKind: 'kyc' | 'kyb'
} {
  if (accountType === 'organization') {
    return {
      workflowId: process.env.DIDIT_KYB_WORKFLOW_ID,
      verificationKind: 'kyb',
    }
  }

  return {
    workflowId: process.env.DIDIT_KYC_WORKFLOW_ID,
    verificationKind: 'kyc',
  }
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

async function syncUserAppMetadata(userId: string, metadata: Record<string, unknown>): Promise<void> {
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: metadata,
  })

  if (error) {
    console.error('[onboarding/actions] Supabase app metadata sync failed:', error.message)
    throw new Error('Could not sync verification status.')
  }
}

export async function getOnboardingState(): Promise<OnboardingState | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  try {
    const dbUser = await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email ?? '',
      },
      include: {
        individualProfile: true,
        organizationProfile: true,
      }
    })

    const profileCompleted = !!(dbUser.individualProfile || dbUser.organizationProfile)

    return {
      accountType:
        dbUser.account_type === 'individual' || dbUser.account_type === 'organization'
          ? dbUser.account_type
          : null,
      verificationStatus: dbUser.verification_status,
      kycVerified: dbUser.kyc_verified,
      username: dbUser.username,
      diditSessionId: dbUser.didit_session_id,
      profileCompleted,
    }
  } catch (error) {
    console.error('[onboarding/actions] getOnboardingState failed:', error)
    return { error: 'Could not load onboarding status.' }
  }
}

export async function initiateVerification(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Guard: prevent re-verification for already verified users
  const existingUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { individualProfile: true, organizationProfile: true },
  })

  if (existingUser?.kyc_verified) {
    return { error: 'Your identity is already verified. You cannot restart verification.' }
  }

  const accountType = normalizeAccountType(formData.get('role'))
  if (!accountType) {
    return { error: 'Choose whether you are registering as an individual or organization.' }
  }

  const { workflowId, verificationKind } = workflowForAccountType(accountType)
  if (!workflowId) {
    return {
      error:
        accountType === 'organization'
          ? 'Organization verification is not configured yet. Add DIDIT_KYB_WORKFLOW_ID.'
          : 'Individual verification is not configured yet. Add DIDIT_KYC_WORKFLOW_ID.',
    }
  }

  try {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        account_type: accountType,
        verification_kind: verificationKind,
        verification_status: 'in_progress',
        didit_workflow_id: workflowId,
        didit_session_id: null,
      },
      create: {
        id: user.id,
        email: user.email ?? '',
        account_type: accountType,
        verification_kind: verificationKind,
        verification_status: 'in_progress',
        didit_workflow_id: workflowId,
      },
    })

    await syncUserAppMetadata(user.id, {
      account_type: accountType,
      verification_status: 'in_progress',
      verification_kind: verificationKind,
      kyc_verified: false,
    })

    const response = await fetch('https://verification.didit.me/v3/session/', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.DIDIT_API_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        vendor_data: user.id,
        callback: `${getAppUrl()}/onboarding`,
        callback_method: 'both',
        metadata: {
          account_type: accountType,
          source: 'rentral_onboarding',
        },
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error('[onboarding/actions] Didit session creation failed:', detail)
      return { error: 'Failed to start verification. Please try again.' }
    }

    const session: unknown = await response.json()
    const sessionRecord = session && typeof session === 'object' ? session : {}
    const sessionUrl =
      'url' in sessionRecord && typeof sessionRecord.url === 'string' ? sessionRecord.url : null
    const sessionId =
      'session_id' in sessionRecord && typeof sessionRecord.session_id === 'string'
        ? sessionRecord.session_id
        : null

    if (!sessionUrl || !sessionId) {
      return { error: 'Didit did not return a verification URL. Please try again.' }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        didit_session_id: sessionId,
        verification_status: 'in_progress',
      },
    })

    await captureServerEvent(user.id, 'verification_started', {
      account_type: accountType,
      verification_kind: verificationKind,
    })

    return { url: sessionUrl, session_id: sessionId }
  } catch (error) {
    console.error('[onboarding/actions] initiateVerification failed:', error)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

export async function refreshStatus(): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  let shouldRedirect = false

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { individualProfile: true, organizationProfile: true },
    })

    if (!dbUser?.kyc_verified) {
      return { error: 'Your verification is not approved yet. Complete Didit and try again.' }
    }

    const profileCompleted = !!(dbUser.individualProfile || dbUser.organizationProfile)

    await syncUserAppMetadata(user.id, {
      kyc_verified: true,
      account_type: dbUser.account_type,
      verification_status: dbUser.verification_status,
      verification_kind: dbUser.verification_kind,
      username: dbUser.username,
      profile_completed: profileCompleted,
    })

    shouldRedirect = Boolean(dbUser.username)
  } catch (error) {
    console.error('[onboarding/actions] refreshStatus failed:', error)
    return { error: 'Could not fetch verification status.' }
  }

  if (shouldRedirect) {
    redirect('/onboarding')
  }
}

export async function saveUsername(formData: FormData): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const username = String(formData.get('username') ?? '').trim().toLowerCase()
  if (!USERNAME_PATTERN.test(username)) {
    return {
      error: 'Usernames must be 3-24 characters and use only lowercase letters, numbers, or underscores.',
    }
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { individualProfile: true, organizationProfile: true },
    })

    if (!dbUser?.kyc_verified) {
      return { error: 'Complete verification before choosing a username.' }
    }

    const profileCompleted = !!(dbUser.individualProfile || dbUser.organizationProfile)

    await prisma.user.update({
      where: { id: user.id },
      data: { username },
    })

    await syncUserAppMetadata(user.id, {
      kyc_verified: true,
      account_type: dbUser.account_type,
      verification_status: dbUser.verification_status,
      verification_kind: dbUser.verification_kind,
      username,
      profile_completed: profileCompleted,
    })
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return { error: 'That username is already taken.' }
    }

    console.error('[onboarding/actions] saveUsername failed:', error)
    return { error: 'Could not save username. Please try again.' }
  }

  redirect('/onboarding')
}
