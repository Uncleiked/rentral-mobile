'use server'

import prisma from '@/lib/db'
import { createClient } from '@/lib/server'
import { createAdminClient } from '@/lib/admin'
import { revalidatePath } from 'next/cache'
import { individualProfileSchema, organizationProfileSchema } from '@/lib/schemas'
import { captureServerEvent } from '@/lib/posthog'

type ProfileResult = { success: true } | { success: false; error: string }

export async function submitProfile(data: unknown): Promise<ProfileResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Please sign in again.' }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!dbUser?.kyc_verified) {
      return { success: false, error: 'Complete identity verification before saving your profile.' }
    }

    if (dbUser.account_type === 'individual') {
      const parsed = individualProfileSchema.safeParse(data)
      if (!parsed.success) return { success: false, error: 'Please check your personal details.' }
      await prisma.individualProfile.upsert({
        where: { userId: user.id },
        update: parsed.data,
        create: { userId: user.id, ...parsed.data },
      })
    } else if (dbUser.account_type === 'organization') {
      const parsed = organizationProfileSchema.safeParse(data)
      if (!parsed.success) return { success: false, error: 'Please check your company details.' }
      const decision = dbUser.didit_decision
      const name = decision && typeof decision === 'object' && !Array.isArray(decision)
        ? decision.companyName ?? decision.name : null
      const organizationName = typeof name === 'string' && name.trim() ? name : 'Verified Organization'
      const profile = { ...parsed.data, organization_name: organizationName }
      await prisma.organizationProfile.upsert({
        where: { userId: user.id }, update: profile, create: { userId: user.id, ...profile },
      })
    } else {
      return { success: false, error: 'Choose an account type before completing your profile.' }
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: {
        kyc_verified: dbUser.kyc_verified,
        account_type: dbUser.account_type,
        verification_status: dbUser.verification_status,
        verification_kind: dbUser.verification_kind,
        username: dbUser.username,
        profile_completed: true,
      },
    })
    if (error) {
      console.error('[actions/profile] Metadata sync failed:', error.code)
      return { success: false, error: 'Your details were saved, but setup could not finish. Please retry.' }
    }

    await captureServerEvent(user.id, 'onboarding_completed', { account_type: dbUser.account_type })
    revalidatePath('/onboarding')
    return { success: true }
  } catch {
    console.error('[actions/profile] Profile submission failed')
    return { success: false, error: 'We could not save your profile. Please try again.' }
  }
}
