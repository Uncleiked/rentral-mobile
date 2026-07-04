'use server'

import { z } from 'zod'
import prisma from '@/lib/db'
import { createClient } from '@/lib/server'
import { createAdminClient } from '@/lib/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { individualProfileSchema, organizationProfileSchema } from '@/lib/schemas'

export async function submitProfile(data: z.infer<typeof individualProfileSchema> | z.infer<typeof organizationProfileSchema>) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Not authenticated')
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id }
  })

  if (!dbUser) {
    throw new Error('User record not found in database')
  }

  if (dbUser.account_type === 'individual' || !dbUser.account_type) {
    const parsed = individualProfileSchema.parse(data)
    
    await prisma.individualProfile.upsert({
      where: { userId: user.id },
      update: {
        full_name: parsed.full_name,
        date_of_birth: parsed.date_of_birth,
        country: parsed.country,
        state: (parsed as any).state || '',
        address: parsed.address,
        phone_number: parsed.phone_number,
      },
      create: {
        userId: user.id,
        full_name: parsed.full_name,
        date_of_birth: parsed.date_of_birth,
        country: parsed.country,
        state: (parsed as any).state || '',
        address: parsed.address,
        phone_number: parsed.phone_number,
      }
    })
  } else if (dbUser.account_type === 'organization') {
    const parsed = organizationProfileSchema.parse(data)
    
    const diditPayload = (dbUser.didit_decision as any) || {}
    const verifiedOrgName = diditPayload.companyName || diditPayload.name || 'Verified Organization'

    await prisma.organizationProfile.upsert({
      where: { userId: user.id },
      update: {
        organization_name: verifiedOrgName,
        country: parsed.country,
        address: parsed.address,
        phone_number: parsed.phone_number,
      },
      create: {
        userId: user.id,
        organization_name: verifiedOrgName,
        country: parsed.country,
        address: parsed.address,
        phone_number: parsed.phone_number,
      }
    })
  }

  // Sync full app_metadata using Admin client — include all fields for consistency
  const adminClient = createAdminClient()
  const updatedDbUser = await prisma.user.findUnique({
    where: { id: user.id },
  })

  await adminClient.auth.admin.updateUserById(user.id, {
    app_metadata: {
      kyc_verified: updatedDbUser?.kyc_verified ?? false,
      account_type: updatedDbUser?.account_type,
      verification_status: updatedDbUser?.verification_status,
      verification_kind: updatedDbUser?.verification_kind,
      username: updatedDbUser?.username,
      profile_completed: true,
    }
  })

  revalidatePath('/onboarding')
  return { success: true }
}
